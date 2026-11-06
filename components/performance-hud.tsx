'use client'

import React, { useId } from 'react'
import { PanelCard } from '@/components/ui/panel-card'
import { usePerformanceHUD } from '@/hooks/usePerformanceHUD'
import type { PipelineMode } from '@/components/ab-mode-switch'
import { cn } from '@/lib/utils'

interface SparklineProps {
  data: number[]
  strokeColor: string
  fillColor: string
  min?: number
  max?: number
}

const Sparkline = ({
  data,
  strokeColor,
  fillColor,
  min,
  max
}: SparklineProps) => {
  const gradId = useId()
  const width = 156
  const height = 34
  const padY = 3

  if (data.length < 2) return null

  const low = min ?? Math.min(...data)
  const high = max ?? Math.max(...data, low + 1)
  const range = Math.max(high - low, 0.001)

  const coords = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width
    const clamped = Math.min(high, Math.max(low, val))
    const y = height - padY - ((clamped - low) / range) * (height - padY * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const linePoints = coords.join(' ')
  const areaPoints = `0,${height} ${linePoints} ${width},${height}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className='overflow-visible shrink-0'
      aria-hidden='true'
    >
      <defs>
        <linearGradient id={gradId} x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stopColor={fillColor} stopOpacity='0.28' />
          <stop offset='100%' stopColor={fillColor} stopOpacity='0.02' />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradId})`} />
      <polyline
        fill='none'
        stroke={strokeColor}
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        points={linePoints}
      />
    </svg>
  )
}

export interface PerformanceHUDProps {
  currentTps: number
  bufferUsage: number
  isRunning: boolean
  mode: PipelineMode
  renderCount?: number
  className?: string
}

export const PerformanceHUD = ({
  currentTps,
  bufferUsage,
  isRunning,
  mode,
  renderCount,
  className
}: PerformanceHUDProps) => {
  const hud = usePerformanceHUD({
    currentTps,
    bufferUsage,
    isRunning,
    mode
  })

  const isFpsLow = hud.fps < 45
  const isBufferHigh = hud.bufferUsage >= 75

  return (
    <PanelCard
      title='Performance'
      headerRight={
        renderCount !== undefined && (
          <span
            suppressHydrationWarning
            className='font-mono tabular-nums text-[10px] text-zinc-400 dark:text-zinc-500'
          >
            Renders: {renderCount.toLocaleString()}
          </span>
        )
      }
      className={cn(className)}
      bodyClassName='flex flex-col gap-2 pt-1'
    >
      {/* 1. FPS Sparkline Row */}
      <div className='flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-800/30'>
        <div className='min-w-[78px]'>
          <div className='text-[11px] font-medium text-zinc-400 dark:text-zinc-500'>
            FPS
          </div>
          <div
            className={cn(
              'font-mono tabular-nums text-base font-extrabold',
              isFpsLow
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-zinc-900 dark:text-zinc-100'
            )}
          >
            {hud.fps}
          </div>
        </div>
        <Sparkline
          data={hud.fpsHistory}
          strokeColor={isFpsLow ? '#f43f5e' : '#10b981'}
          fillColor={isFpsLow ? '#f43f5e' : '#10b981'}
          min={5}
          max={65}
        />
      </div>

      {/* 2. TPS Sparkline Row */}
      <div className='flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-800/30'>
        <div className='min-w-[78px]'>
          <div className='text-[11px] font-medium text-zinc-400 dark:text-zinc-500'>
            TPS
          </div>
          <div className='font-mono tabular-nums text-base font-extrabold text-zinc-900 dark:text-zinc-100'>
            {hud.tps.toLocaleString()}
          </div>
        </div>
        <Sparkline
          data={hud.tpsHistory}
          strokeColor='#0ea5e9'
          fillColor='#0ea5e9'
          min={0}
        />
      </div>

      {/* 3. JS Heap Sparkline Row */}
      <div className='flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-800/30'>
        <div className='min-w-[78px]'>
          <div className='text-[11px] font-medium text-zinc-400 dark:text-zinc-500'>
            JS Heap
          </div>
          <div className='font-mono tabular-nums text-base font-extrabold text-zinc-900 dark:text-zinc-100'>
            {hud.jsHeapMB.toFixed(1)}MB
          </div>
        </div>
        <Sparkline
          data={hud.heapHistory}
          strokeColor='#8b5cf6'
          fillColor='#8b5cf6'
        />
      </div>

      {/* 4. Buffer Usage Sparkline Row */}
      <div className='flex items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50/50 px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-800/30'>
        <div className='min-w-[78px]'>
          <div className='text-[11px] font-medium text-zinc-400 dark:text-zinc-500'>
            Buffer Usage
          </div>
          <div
            className={cn(
              'font-mono tabular-nums text-base font-extrabold',
              isBufferHigh
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-zinc-900 dark:text-zinc-100'
            )}
          >
            {hud.bufferUsage.toFixed(1)}%
          </div>
        </div>
        <Sparkline
          data={hud.bufferHistory}
          strokeColor={isBufferHigh ? '#f43f5e' : '#f59e0b'}
          fillColor={isBufferHigh ? '#f43f5e' : '#f59e0b'}
          min={0}
          max={100}
        />
      </div>
    </PanelCard>
  )
}
