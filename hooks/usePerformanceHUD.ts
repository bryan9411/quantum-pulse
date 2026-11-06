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
  jsHeapMB: number
  bufferUsage: number
  fpsHistory: number[]
  tpsHistory: number[]
  heapHistory: number[]
  bufferHistory: number[]
}

export interface UsePerformanceHUDInput {
  currentTps: number
  bufferUsage: number
  isRunning: boolean
}

const INITIAL_FPS_HISTORY = [
  56, 58, 57, 59, 58, 60, 59, 57, 59, 60, 58, 59,
  60, 58, 59, 60, 59, 58, 60, 59, 60, 59, 60, 60
]

const INITIAL_TPS_HISTORY = [
  920, 980, 1050, 1010, 990, 1120, 1080, 1040, 1150, 1090, 1180, 1140,
  1110, 1210, 1160, 1190, 1240, 1180, 1220, 1200, 1260, 1210, 1235, 1248
]

const INITIAL_HEAP_HISTORY = [
  42.1, 42.6, 43.0, 43.4, 43.8, 44.1, 44.5, 44.9, 45.2, 45.6, 45.9, 46.1,
  46.4, 46.8, 47.0, 47.2, 47.5, 47.7, 47.9, 48.1, 48.3, 48.4, 48.6, 48.7
]

const INITIAL_BUFFER_HISTORY = [
  12.0, 14.5, 15.2, 16.8, 18.0, 19.4, 21.0, 20.5, 22.1, 23.4, 24.8, 25.2,
  26.5, 27.1, 28.0, 28.9, 29.5, 30.2, 30.8, 31.2, 31.6, 31.9, 32.1, 32.4
]

const readJsHeapMB = (fallbackBase: number): number => {
  if (typeof performance !== 'undefined') {
    const perf = performance as ExtendedPerformance
    if (perf.memory && perf.memory.usedJSHeapSize > 0) {
      return Number((perf.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1))
    }
  }
  const jitter = (Math.random() - 0.48) * 0.4
  return Number(Math.max(32, Math.min(128, fallbackBase + jitter)).toFixed(1))
}

const pushRolling = (arr: number[], nextVal: number): number[] => {
  const next = arr.slice(1)
  next.push(nextVal)
  return next
}

export const usePerformanceHUD = ({
  currentTps,
  bufferUsage,
  isRunning
}: UsePerformanceHUDInput): HudTelemetrySnapshot => {
  const [snapshot, setSnapshot] = useState<HudTelemetrySnapshot>({
    fps: 60,
    tps: 1000,
    jsHeapMB: 48.7,
    bufferUsage: 32.4,
    fpsHistory: INITIAL_FPS_HISTORY,
    tpsHistory: INITIAL_TPS_HISTORY,
    heapHistory: INITIAL_HEAP_HISTORY,
    bufferHistory: INITIAL_BUFFER_HISTORY
  })

  const frameCountRef = useRef(0)
  const lastRafTimeRef = useRef(0)
  const measuredFpsRef = useRef(60)
  const latestInputRef = useRef({ currentTps, bufferUsage })

  useEffect(() => {
    latestInputRef.current = { currentTps, bufferUsage }
  }, [currentTps, bufferUsage])

  useEffect(() => {
    if (typeof window === 'undefined' || !isRunning) return

    let rafId = 0
    lastRafTimeRef.current = performance.now()
    frameCountRef.current = 0

    const trackFps = (now: number) => {
      frameCountRef.current++
      const elapsed = now - lastRafTimeRef.current
      if (elapsed >= 250) {
        measuredFpsRef.current = Math.min(
          60,
          Math.round((frameCountRef.current * 1000) / elapsed)
        )
        frameCountRef.current = 0
        lastRafTimeRef.current = now
      }
      rafId = window.requestAnimationFrame(trackFps)
    }

    rafId = window.requestAnimationFrame(trackFps)

    const timer = window.setInterval(() => {
      const { currentTps: targetTps, bufferUsage: buf } = latestInputRef.current

      setSnapshot((prev) => {
        const nextFps = measuredFpsRef.current
        const tpsJitter = Math.round((Math.random() - 0.48) * targetTps * 0.08)
        const nextTps = Math.max(1, targetTps + tpsJitter)
        const nextHeap = readJsHeapMB(prev.jsHeapMB)
        const simulatedBuf = buf > 0 ? buf : Number((Math.min(95, (targetTps / 2500) * 65 + Math.random() * 6)).toFixed(1))

        return {
          fps: nextFps,
          tps: nextTps,
          jsHeapMB: nextHeap,
          bufferUsage: simulatedBuf,
          fpsHistory: pushRolling(prev.fpsHistory, nextFps),
          tpsHistory: pushRolling(prev.tpsHistory, nextTps),
          heapHistory: pushRolling(prev.heapHistory, nextHeap),
          bufferHistory: pushRolling(prev.bufferHistory, simulatedBuf)
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
