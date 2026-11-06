import { useState, useEffect, useRef, useCallback } from 'react'
import type { TradeTick, OrderBookDepth } from '@/lib/type'
import { TypedRingBuffer } from '@/lib/ring-buffer'
import {
  type BackpressureStrategy,
  executeBackpressureStrategy,
  coalesceOrderBookDepth
} from '@/lib/coalescing-strategies'
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
  strategy: BackpressureStrategy
  latestTicks: TradeTick[]
  latestDepth: OrderBookDepth | null
  metrics: {
    fps: number
    tps: number
    queueSize: number
    bufferUsage: number
    bufferCapacity: number
    droppedTicks: number
    coalescedTicks: number
    watermarkStatus: BufferWatermarkStatus
    lastLatencyMs: number
  }
}

/**
 * 給 1 秒取樣器讀取的即時統計（累計值），讀取後會重設「最長畫面間隔」
 */
export interface FrameStats {
  fps: number
  /** 累計已送到畫面上的 Tick 數 */
  renderedTicks: number
  /** 累計被策略合併（coalesce）或丟棄（drop）的 Tick 數 */
  strategyDiscarded: number
  /** 累計因 Ring Buffer 滿載被覆蓋的 Tick 數 */
  overwritten: number
  queueSize: number
  bufferUsage: number
  /** 上次讀取以來最長的兩幀間隔（ms），代表主執行緒最長停頓 */
  maxFrameGapMs: number
  /** 累計畫面幀數（分頁隱藏期間不計） */
  totalFrames: number
  /** 累計卡頓幀數：兩幀間隔超過 LONG_FRAME_MS */
  longFrames: number
}

/** 兩幀間隔超過此值視為一次肉眼可見的卡頓（約掉 3 幀） */
export const LONG_FRAME_MS = 50

export interface UseWorkerStreamReturn extends WorkerStreamState {
  readFrameStats: () => FrameStats
  start: (batchIntervalMs?: number) => void
  stop: () => void
  reset: () => void
  setStrategy: (strategy: BackpressureStrategy) => void
  ingestTick: (tick: TradeTick) => void
  ingestBinary: (buffer: ArrayBuffer, count: number) => void
  ingestDepth: (depth: OrderBookDepth) => void
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
  const strategyRef = useRef<BackpressureStrategy>('coalesce')
  const statusRef = useRef<'idle' | 'running' | 'stopped'>('idle')
  const coalescedCountRef = useRef(0)
  const renderedTicksRef = useRef(0)
  const lastFrameTimeRef = useRef(0)
  const maxFrameGapRef = useRef(0)
  const totalFramesRef = useRef(0)
  const longFramesRef = useRef(0)

  const [status, setStatus] = useState<'idle' | 'running' | 'stopped'>('idle')
  const [strategy, setStrategyState] = useState<BackpressureStrategy>('coalesce')
  const [latestTicks, setLatestTicks] = useState<TradeTick[]>([])
  const [latestDepth, setLatestDepth] = useState<OrderBookDepth | null>(null)
  const [metrics, setMetrics] = useState<WorkerStreamState['metrics']>({
    fps: 0,
    tps: 0,
    queueSize: 0,
    bufferUsage: 0,
    bufferCapacity: RING_BUFFER_CAPACITY,
    droppedTicks: 0,
    coalescedTicks: 0,
    watermarkStatus: 'healthy',
    lastLatencyMs: 0
  })

  const setStrategy = useCallback((nextStrategy: BackpressureStrategy) => {
    strategyRef.current = nextStrategy
    setStrategyState(nextStrategy)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const ringBuffer = ringBufferRef.current
    const startTime = performance.now()
    lastFpsSampleTimeRef.current = startTime
    lastTelemetrySampleTimeRef.current = startTime
    frameCountRef.current = 0

    const renderFrame = (now: number) => {
      frameCountRef.current++
      // 分頁隱藏時瀏覽器會暫停 rAF，回來後的那一大段間隔不是卡頓，不列入統計
      if (lastFrameTimeRef.current > 0 && !document.hidden) {
        const gap = now - lastFrameTimeRef.current
        if (gap > maxFrameGapRef.current) maxFrameGapRef.current = gap
        totalFramesRef.current++
        if (gap > LONG_FRAME_MS) longFramesRef.current++
      }
      lastFrameTimeRef.current = document.hidden ? 0 : now
      const fpsElapsed = now - lastFpsSampleTimeRef.current

      if (fpsElapsed >= 1000) {
        currentFpsRef.current = Math.round((frameCountRef.current * 1000) / fpsElapsed)
        frameCountRef.current = 0
        lastFpsSampleTimeRef.current = now
      }

      if (ringBuffer.size > 0) {
        const batchResult = executeBackpressureStrategy(
          strategyRef.current,
          ringBuffer,
          MAX_TICKS_PER_FRAME
        )
        coalescedCountRef.current += batchResult.discardedOrMergedCount
        renderedTicksRef.current += batchResult.ticks.length
        setLatestTicks(batchResult.ticks)
      }

      if (pendingDepthRef.current !== null) {
        setLatestDepth(pendingDepthRef.current)
        pendingDepthRef.current = null
      }

      const telemetryElapsed = now - lastTelemetrySampleTimeRef.current
      if (telemetryElapsed >= TELEMETRY_SAMPLE_MS && (statusRef.current === 'running' || ringBuffer.size > 0)) {
        lastTelemetrySampleTimeRef.current = now
        const usage = ringBuffer.getUsageRatio()
        const nextStatus = getWatermarkStatus(usage)

        setMetrics((prev) => {
          if (
            prev.fps === currentFpsRef.current &&
            prev.queueSize === ringBuffer.size &&
            prev.bufferUsage === usage &&
            prev.droppedTicks === ringBuffer.dropped &&
            prev.coalescedTicks === coalescedCountRef.current &&
            prev.watermarkStatus === nextStatus
          ) {
            return prev
          }

          return {
            ...prev,
            fps: currentFpsRef.current,
            queueSize: ringBuffer.size,
            bufferUsage: usage,
            bufferCapacity: ringBuffer.maxCapacity,
            droppedTicks: ringBuffer.dropped,
            coalescedTicks: coalescedCountRef.current,
            watermarkStatus: nextStatus
          }
        })
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
          pendingDepthRef.current = coalesceOrderBookDepth(
            pendingDepthRef.current,
            message.depth
          )
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
            coalescedTicks: coalescedCountRef.current,
            watermarkStatus: getWatermarkStatus(usage),
            lastLatencyMs: message.metrics.lastLatencyMs
          }))
          break
        }

        case 'STATUS':
          statusRef.current = message.status
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

  const readFrameStats = useCallback((): FrameStats => {
    const ringBuffer = ringBufferRef.current
    const stats: FrameStats = {
      fps: currentFpsRef.current,
      renderedTicks: renderedTicksRef.current,
      strategyDiscarded: coalescedCountRef.current,
      overwritten: ringBuffer.dropped,
      queueSize: ringBuffer.size,
      bufferUsage: ringBuffer.getUsageRatio(),
      maxFrameGapMs: Math.round(maxFrameGapRef.current),
      totalFrames: totalFramesRef.current,
      longFrames: longFramesRef.current
    }
    maxFrameGapRef.current = 0
    return stats
  }, [])

  const sendCommand = useCallback((cmd: StreamCommand) => {
    if (workerRef.current) {
      workerRef.current.postMessage(cmd)
    }
  }, [])

  const start = useCallback((batchIntervalMs?: number) => {
    statusRef.current = 'running'
    sendCommand({ type: 'START', payload: { batchIntervalMs } })
  }, [sendCommand])

  const stop = useCallback((() => {
    statusRef.current = 'stopped'
    ringBufferRef.current.clear()
    pendingDepthRef.current = null
    sendCommand({ type: 'STOP' })
  }), [sendCommand])

  const reset = useCallback(() => {
    sendCommand({ type: 'RESET' })
    const ringBuffer = ringBufferRef.current
    ringBuffer.clear()
    pendingDepthRef.current = null
    coalescedCountRef.current = 0
    setLatestTicks([])
    setLatestDepth(null)
    setMetrics((prev) => ({
      ...prev,
      queueSize: 0,
      bufferUsage: 0,
      droppedTicks: 0,
      coalescedTicks: 0,
      watermarkStatus: 'healthy'
    }))
  }, [sendCommand])

  const ingestTick = useCallback((tick: TradeTick) => {
    sendCommand({ type: 'INGEST_TICK', payload: tick })
  }, [sendCommand])

  const ingestBinary = useCallback((buffer: ArrayBuffer, count: number) => {
    // 以 Transferable 轉交，主執行緒不解碼、不複製
    workerRef.current?.postMessage(
      { type: 'INGEST_BINARY', payload: { buffer, count } } satisfies StreamCommand,
      [buffer]
    )
  }, [])

  const ingestDepth = useCallback((depth: OrderBookDepth) => {
    sendCommand({ type: 'INGEST_DEPTH', payload: depth })
  }, [sendCommand])


  return {
    readFrameStats,
    status,
    strategy,
    latestTicks,
    latestDepth,
    metrics,
    start,
    stop,
    reset,
    setStrategy,
    ingestTick,
    ingestBinary,
    ingestDepth
  }
}
