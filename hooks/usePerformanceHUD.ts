'use client'

import { useState, useEffect, useRef } from 'react'

const SPARKLINE_POINTS = 24
const SAMPLE_INTERVAL_MS = 250

interface ChromePerformanceMemory {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface ExtendedPerformance extends Performance {
  memory?: ChromePerformanceMemory
}

export interface HudTelemetrySnapshot {
  fps: number
  tps: number
  /** null 表示瀏覽器不支援 performance.memory（非 Chromium） */
  jsHeapMB: number | null
  /** null 表示目前管線沒有 Ring Buffer（Baseline 模式） */
  bufferUsage: number | null
  /** null 表示目前不是 Baseline 模式 */
  mainThreadLagMs: number | null
  fpsHistory: number[]
  tpsHistory: number[]
  heapHistory: number[]
  bufferHistory: number[]
  lagHistory: number[]
}

export interface UsePerformanceHUDInput {
  /** 主執行緒實際量測到的每秒 Tick 數 */
  measuredTps: number
  /** Ring Buffer 實際使用率（%），沒有 Ring Buffer 時傳 null */
  bufferUsage: number | null
  /** Baseline 主執行緒延遲（ms），非 Baseline 傳 null */
  mainThreadLagMs: number | null
  isRunning: boolean
}

const emptyHistory = (): number[] => new Array<number>(SPARKLINE_POINTS).fill(0)

/**
 * 讀取真實 JS Heap 用量；不支援 performance.memory 的瀏覽器回傳 null，不做任何模擬。
 */
const readJsHeapMB = (): number | null => {
  if (typeof performance === 'undefined') return null
  const perf = performance as ExtendedPerformance
  if (perf.memory && perf.memory.usedJSHeapSize > 0) {
    return Number((perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1))
  }
  return null
}

const pushRolling = (arr: number[], nextVal: number): number[] => {
  const next = arr.slice(1)
  next.push(nextVal)
  return next
}

export const usePerformanceHUD = ({
  measuredTps,
  bufferUsage,
  mainThreadLagMs,
  isRunning
}: UsePerformanceHUDInput): HudTelemetrySnapshot => {
  const [snapshot, setSnapshot] = useState<HudTelemetrySnapshot>(() => ({
    fps: 0,
    tps: 0,
    jsHeapMB: null,
    bufferUsage: null,
    mainThreadLagMs: null,
    fpsHistory: emptyHistory(),
    tpsHistory: emptyHistory(),
    heapHistory: emptyHistory(),
    bufferHistory: emptyHistory(),
    lagHistory: emptyHistory()
  }))

  const frameCountRef = useRef(0)
  const lastRafTimeRef = useRef(0)
  const measuredFpsRef = useRef(0)
  const latestInputRef = useRef({ measuredTps, bufferUsage, mainThreadLagMs })

  useEffect(() => {
    latestInputRef.current = { measuredTps, bufferUsage, mainThreadLagMs }
  }, [measuredTps, bufferUsage, mainThreadLagMs])

  useEffect(() => {
    if (typeof window === 'undefined' || !isRunning) return

    let rafId = 0
    lastRafTimeRef.current = performance.now()
    frameCountRef.current = 0

    const trackFps = (now: number) => {
      frameCountRef.current++
      const elapsed = now - lastRafTimeRef.current
      if (elapsed >= 250) {
        measuredFpsRef.current = Math.max(
          1,
          Math.round((frameCountRef.current * 1000) / elapsed)
        )
        frameCountRef.current = 0
        lastRafTimeRef.current = now
      }
      rafId = window.requestAnimationFrame(trackFps)
    }

    rafId = window.requestAnimationFrame(trackFps)

    const timer = window.setInterval(() => {
      const { measuredTps: tps, bufferUsage: buf, mainThreadLagMs: lag } = latestInputRef.current

      setSnapshot((prev) => {
        const nextFps = measuredFpsRef.current
        const nextHeap = readJsHeapMB()

        return {
          fps: nextFps,
          tps,
          jsHeapMB: nextHeap,
          bufferUsage: buf,
          mainThreadLagMs: lag,
          fpsHistory: pushRolling(prev.fpsHistory, nextFps),
          tpsHistory: pushRolling(prev.tpsHistory, tps),
          heapHistory: pushRolling(prev.heapHistory, nextHeap ?? 0),
          bufferHistory: pushRolling(prev.bufferHistory, buf ?? 0),
          lagHistory: pushRolling(prev.lagHistory, lag ?? 0)
        }
      })
    }, SAMPLE_INTERVAL_MS)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.clearInterval(timer)
    }
  }, [isRunning])

  return snapshot
}
