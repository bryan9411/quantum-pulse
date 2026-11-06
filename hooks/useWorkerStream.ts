import { useState, useEffect, useRef, useCallback } from 'react'
import type { TradeTick, OrderBookDepth } from '@/lib/type'
import { TypedRingBuffer } from '@/lib/ring-buffer'
import type { StreamCommand, StreamEvent } from '@/workers/stream-processor.worker'

const RING_BUFFER_CAPACITY = 4096
const MAX_TICKS_PER_FRAME = 60

export interface WorkerStreamState {
  status: 'idle' | 'running' | 'stopped'
  latestTicks: TradeTick[]
  latestDepth: OrderBookDepth | null
  metrics: {
    fps: number
    tps: number
    queueSize: number
    lastLatencyMs: number
  }
}

export interface UseWorkerStreamReturn extends WorkerStreamState {
  start: (batchIntervalMs?: number) => void
  stop: () => void
  reset: () => void
  ingestTick: (tick: TradeTick) => void
  ingestDepth: (depth: OrderBookDepth) => void
}

export const useWorkerStream = (): UseWorkerStreamReturn => {
  const workerRef = useRef<Worker | null>(null)
  const ringBufferRef = useRef<TypedRingBuffer>(new TypedRingBuffer(RING_BUFFER_CAPACITY))
  const pendingDepthRef = useRef<OrderBookDepth | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const lastFpsSampleTimeRef = useRef(0)

  const [status, setStatus] = useState<'idle' | 'running' | 'stopped'>('idle')
  const [latestTicks, setLatestTicks] = useState<TradeTick[]>([])
  const [latestDepth, setLatestDepth] = useState<OrderBookDepth | null>(null)
  const [metrics, setMetrics] = useState({
    fps: 0,
    tps: 0,
    queueSize: 0,
    lastLatencyMs: 0
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const ringBuffer = ringBufferRef.current
    lastFpsSampleTimeRef.current = performance.now()
    frameCountRef.current = 0

    const renderFrame = (now: number) => {
      frameCountRef.current++
      const elapsed = now - lastFpsSampleTimeRef.current

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed)
        frameCountRef.current = 0
        lastFpsSampleTimeRef.current = now

        setMetrics((prev) => ({
          ...prev,
          fps: currentFps,
          queueSize: ringBuffer.size
        }))
      }

      if (ringBuffer.size > 0) {
        const drainedTicks = ringBuffer.drain(MAX_TICKS_PER_FRAME)
        setLatestTicks(drainedTicks)
      }

      if (pendingDepthRef.current !== null) {
        setLatestDepth(pendingDepthRef.current)
        pendingDepthRef.current = null
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

        case 'METRICS':
          setMetrics((prev) => ({
            ...prev,
            tps: message.metrics.tps,
            queueSize: ringBuffer.size,
            lastLatencyMs: message.metrics.lastLatencyMs
          }))
          break

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

  const stop = useCallback(() => {
    sendCommand({ type: 'STOP' })
  }, [sendCommand])

  const reset = useCallback(() => {
    sendCommand({ type: 'RESET' })
    ringBufferRef.current.clear()
    pendingDepthRef.current = null
    setLatestTicks([])
    setLatestDepth(null)
  }, [sendCommand])

  const ingestTick = useCallback((tick: TradeTick) => {
    sendCommand({ type: 'INGEST_TICK', payload: tick })
  }, [sendCommand])

  const ingestDepth = useCallback((depth: OrderBookDepth) => {
    sendCommand({ type: 'INGEST_DEPTH', payload: depth })
  }, [sendCommand])

  return {
    status,
    latestTicks,
    latestDepth,
    metrics,
    start,
    stop,
    reset,
    ingestTick,
    ingestDepth
  }
}
