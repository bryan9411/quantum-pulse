import { useState, useEffect, useRef, useCallback } from 'react'
import type { TradeTick, OrderBookDepth } from '@/lib/type'
import { TypedRingBuffer } from '@/lib/ring-buffer'
import type { StreamCommand, StreamEvent } from '@/workers/stream-processor.worker'

const RING_BUFFER_CAPACITY = 4096
const MAX_TICKS_PER_FRAME = 60
const TELEMETRY_SAMPLE_MS = 200
const WARN_WATERMARK_PERCENT = 50
const HIGH_WATERMARK_PERCENT = 80

export type BufferWatermarkStatus = 'healthy' | 'warning' | 'critical'

export const getWatermarkStatus = (usagePercent: number): BufferWatermarkStatus => {
  if (usagePercent >= HIGH_WATERMARK_PERCENT) return 'critical'
  if (usagePercent >= WARN_WATERMARK_PERCENT) return 'warning'
  return 'healthy'
}

export interface WorkerStreamState {
  status: 'idle' | 'running' | 'stopped'
  latestTicks: TradeTick[]
  latestDepth: OrderBookDepth | null
  metrics: {
    fps: number
    tps: number
    queueSize: number
    bufferUsage: number
    bufferCapacity: number
    droppedTicks: number
    watermarkStatus: BufferWatermarkStatus
    lastLatencyMs: number
  }
}

export interface UseWorkerStreamReturn extends WorkerStreamState {
  start: (batchIntervalMs?: number) => void
  stop: () => void
  reset: () => void
  ingestTick: (tick: TradeTick) => void
  ingestDepth: (depth: OrderBookDepth) => void
  burstInject: (count: number, basePrice?: number) => void
}

export const useWorkerStream = (): UseWorkerStreamReturn => {
  const workerRef = useRef<Worker | null>(null)
  const ringBufferRef = useRef<TypedRingBuffer>(new TypedRingBuffer(RING_BUFFER_CAPACITY))
  const pendingDepthRef = useRef<OrderBookDepth | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const lastFpsSampleTimeRef = useRef(0)
  const lastTelemetrySampleTimeRef = useRef(0)
  const currentFpsRef = useRef(0)

  const [status, setStatus] = useState<'idle' | 'running' | 'stopped'>('idle')
  const [latestTicks, setLatestTicks] = useState<TradeTick[]>([])
  const [latestDepth, setLatestDepth] = useState<OrderBookDepth | null>(null)
  const [metrics, setMetrics] = useState<WorkerStreamState['metrics']>({
    fps: 0,
    tps: 0,
    queueSize: 0,
    bufferUsage: 0,
    bufferCapacity: RING_BUFFER_CAPACITY,
    droppedTicks: 0,
    watermarkStatus: 'healthy',
    lastLatencyMs: 0
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const ringBuffer = ringBufferRef.current
    const startTime = performance.now()
    lastFpsSampleTimeRef.current = startTime
    lastTelemetrySampleTimeRef.current = startTime
    frameCountRef.current = 0

    const renderFrame = (now: number) => {
      frameCountRef.current++
      const fpsElapsed = now - lastFpsSampleTimeRef.current

      if (fpsElapsed >= 1000) {
        currentFpsRef.current = Math.round((frameCountRef.current * 1000) / fpsElapsed)
        frameCountRef.current = 0
        lastFpsSampleTimeRef.current = now
      }

      if (ringBuffer.size > 0) {
        const drainedTicks = ringBuffer.drain(MAX_TICKS_PER_FRAME)
        setLatestTicks(drainedTicks)
      }

      if (pendingDepthRef.current !== null) {
        setLatestDepth(pendingDepthRef.current)
        pendingDepthRef.current = null
      }

      const telemetryElapsed = now - lastTelemetrySampleTimeRef.current
      if (telemetryElapsed >= TELEMETRY_SAMPLE_MS) {
        lastTelemetrySampleTimeRef.current = now
        const usage = ringBuffer.getUsageRatio()

        setMetrics((prev) => ({
          ...prev,
          fps: currentFpsRef.current,
          queueSize: ringBuffer.size,
          bufferUsage: usage,
          bufferCapacity: ringBuffer.maxCapacity,
          droppedTicks: ringBuffer.dropped,
          watermarkStatus: getWatermarkStatus(usage)
        }))
      }

      rafIdRef.current = window.requestAnimationFrame(renderFrame)
    }

    rafIdRef.current = window.requestAnimationFrame(renderFrame)

    const worker = new Worker(
      new URL('../workers/stream-processor.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<StreamEvent>) => {
      const message = event.data

      switch (message.type) {
        case 'BINARY_BATCH_TICKS': {
          ringBuffer.pushBatchFromBuffer(message.buffer)
          break
        }

        case 'BATCH_TICKS': {
          for (let i = 0; i < message.ticks.length; i++) {
            ringBuffer.push(message.ticks[i])
          }
          break
        }

        case 'LATEST_DEPTH':
          pendingDepthRef.current = message.depth
          break

        case 'METRICS': {
          const usage = ringBuffer.getUsageRatio()
          setMetrics((prev) => ({
            ...prev,
            tps: message.metrics.tps,
            queueSize: ringBuffer.size,
            bufferUsage: usage,
            bufferCapacity: ringBuffer.maxCapacity,
            droppedTicks: ringBuffer.dropped,
            watermarkStatus: getWatermarkStatus(usage),
            lastLatencyMs: message.metrics.lastLatencyMs
          }))
          break
        }

        case 'STATUS':
          setStatus(message.status)
          break
      }
    }

    worker.onerror = (err) => {
      console.error('StreamProcessor Worker Error:', err)
      setStatus('stopped')
    }

    return () => {
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      worker.terminate()
      workerRef.current = null
      ringBuffer.clear()
      pendingDepthRef.current = null
    }
  }, [])

  const sendCommand = useCallback((cmd: StreamCommand) => {
    if (workerRef.current) {
      workerRef.current.postMessage(cmd)
    }
  }, [])

  const start = useCallback((batchIntervalMs?: number) => {
    sendCommand({ type: 'START', payload: { batchIntervalMs } })
  }, [sendCommand])

  const stop = useCallback((() => {
    sendCommand({ type: 'STOP' })
  }), [sendCommand])

  const reset = useCallback(() => {
    sendCommand({ type: 'RESET' })
    const ringBuffer = ringBufferRef.current
    ringBuffer.clear()
    pendingDepthRef.current = null
    setLatestTicks([])
    setLatestDepth(null)
    setMetrics((prev) => ({
      ...prev,
      queueSize: 0,
      bufferUsage: 0,
      droppedTicks: 0,
      watermarkStatus: 'healthy'
    }))
  }, [sendCommand])

  const ingestTick = useCallback((tick: TradeTick) => {
    sendCommand({ type: 'INGEST_TICK', payload: tick })
  }, [sendCommand])

  const ingestDepth = useCallback((depth: OrderBookDepth) => {
    sendCommand({ type: 'INGEST_DEPTH', payload: depth })
  }, [sendCommand])

  const burstInject = useCallback((count: number, basePrice = 67432.18) => {
    const ringBuffer = ringBufferRef.current
    const now = Date.now()

    for (let i = 0; i < count; i++) {
      const jitter = (Math.random() - 0.5) * 20
      ringBuffer.push({
        id: `burst_${now}_${i}`,
        price: Number((basePrice + jitter).toFixed(2)),
        size: Number((Math.random() * 1.5 + 0.01).toFixed(4)),
        side: Math.random() > 0.5 ? 'buy' : 'sell',
        timestamp: now + i
      })
    }

    const usage = ringBuffer.getUsageRatio()
    setMetrics((prev) => ({
      ...prev,
      queueSize: ringBuffer.size,
      bufferUsage: usage,
      droppedTicks: ringBuffer.dropped,
      watermarkStatus: getWatermarkStatus(usage)
    }))
  }, [])

  return {
    status,
    latestTicks,
    latestDepth,
    metrics,
    start,
    stop,
    reset,
    ingestTick,
    ingestDepth,
    burstInject
  }
}
