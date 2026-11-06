'use client'

import React, { useId, type RefObject } from 'react'
import { PanelCard } from '@/components/ui/panel-card'
import { usePerformanceHUD } from '@/hooks/usePerformanceHUD'
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

const StatusLine = ({ children }: { children: React.ReactNode }) => (
  <div className='text-[11px] text-zinc-600 dark:text-zinc-300 whitespace-nowrap'>{children}</div>
)

export interface PerformanceHUDProps {
  /** 主執行緒實際量測到的每秒 Tick 數 */
  measuredTps: number
  /** Ring Buffer 使用率（%），Baseline 模式沒有 Ring Buffer 時傳 null */
  bufferUsage: number | null
  /** Baseline 模式的主執行緒延遲（ms），Accelerated 模式傳 null */
  mainThreadLagMs?: number | null
  /** 使用者設定的目標 TPS，用來對照實測值 */
  targetTps?: number
  isRunning: boolean
  /** 由父層在 commit 後直接寫入 Render 次數的 span */
  renderCountRef?: RefObject<HTMLSpanElement | null>
  className?: string
}

export const PerformanceHUD = ({
  measuredTps,
  bufferUsage,
  mainThreadLagMs = null,
  targetTps,
  isRunning,
  renderCountRef,
  className
}: PerformanceHUDProps) => {
  const hud = usePerformanceHUD({
    measuredTps,
    bufferUsage,
    mainThreadLagMs,
    isRunning
  })

  // 卡片種類與 Lag 數值以 props 為準（自動暫停時也能顯示觸發當下的延遲）；曲線取 HUD 取樣歷史
  const showLag = mainThreadLagMs !== null
  const lagValue = mainThreadLagMs ?? 0
  const isLagHigh = showLag && lagValue >= 100

  const isFpsLow = isRunning && hud.fps < 45
  const fpsStatus = !isRunning ? '未執行' : hud.fps >= 55 ? '流暢' : hud.fps >= 30 ? '普通' : '卡頓'
  const tpsStatus = targetTps !== undefined ? `目標 ${targetTps.toLocaleString()}` : ''
  const heapStatus = hud.jsHeapMB === null ? '此瀏覽器不支援' : '目前用量'
  const isBufferHigh = hud.bufferUsage !== null && hud.bufferUsage >= 75

  return (
    <PanelCard
      title='效能監控'
      headerRight={
        renderCountRef && (
          <span
            ref={renderCountRef}
            suppressHydrationWarning
            className='font-mono tabular-nums text-[11px] text-zinc-600 dark:text-zinc-300'
          >
            渲染次數：0
          </span>
        )
      }
      className={cn(className)}
      bodyClassName='flex flex-col gap-2 pt-1'
    >
      {/* 1. FPS Sparkline Row */}
      <div className='flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-800/30'>
        <div className='min-w-[78px]'>
          <div className='text-xs font-medium text-zinc-600 dark:text-zinc-300'>
            幀率 (FPS)
          </div>
          <div
            className={cn(
              'font-mono tabular-nums text-base font-extrabold',
              isFpsLow
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-zinc-900 dark:text-zinc-100'
            )}
          >
            {hud.fps}
          </div>
          <StatusLine>{fpsStatus}</StatusLine>
        </div>
        <Sparkline
          data={hud.fpsHistory}
          strokeColor={isFpsLow ? '#f43f5e' : '#10b981'}
          fillColor={isFpsLow ? '#f43f5e' : '#10b981'}
          min={0}
          max={Math.max(65, ...hud.fpsHistory)}
        />
      </div>

      {/* 2. TPS Sparkline Row */}
      <div className='flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-800/30'>
        <div className='min-w-[78px]'>
          <div className='text-xs font-medium text-zinc-600 dark:text-zinc-300'>
            每秒成交 (TPS)
          </div>
          <div className='font-mono tabular-nums text-base font-extrabold text-zinc-900 dark:text-zinc-100'>
            {hud.tps.toLocaleString()}
          </div>
          {tpsStatus && <StatusLine>{tpsStatus}</StatusLine>}
        </div>
        <Sparkline
          data={hud.tpsHistory}
          strokeColor='#0ea5e9'
          fillColor='#0ea5e9'
          min={0}
        />
      </div>

      {/* 3. JS Heap Sparkline Row */}
      <div className='flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-800/30'>
        <div className='min-w-[78px]'>
          <div className='text-xs font-medium text-zinc-600 dark:text-zinc-300'>
            JS 記憶體 (JS Heap)
          </div>
          <div className='font-mono tabular-nums text-base font-extrabold text-zinc-900 dark:text-zinc-100'>
            {hud.jsHeapMB !== null ? `${hud.jsHeapMB.toFixed(1)}MB` : 'N/A'}
          </div>
          <StatusLine>{heapStatus}</StatusLine>
        </div>
        <Sparkline
          data={hud.heapHistory}
          strokeColor='#8b5cf6'
          fillColor='#8b5cf6'
        />
      </div>

      {/* 4. Buffer Usage（Accelerated）/ Main Thread Lag（Baseline）Sparkline Row */}
      <div className='flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 dark:border-zinc-700/80 dark:bg-zinc-800/30'>
        <div className='min-w-[78px]'>
          <div className='text-xs font-medium text-zinc-600 dark:text-zinc-300'>
            {showLag ? '主執行緒延遲 (Main Thread Lag)' : '緩衝區使用率'}
          </div>
          <div
            className={cn(
              'font-mono tabular-nums text-base font-extrabold',
              (showLag ? isLagHigh : isBufferHigh)
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-zinc-900 dark:text-zinc-100'
            )}
          >
            {showLag
              ? `${lagValue.toLocaleString()}ms`
              : hud.bufferUsage !== null ? `${hud.bufferUsage.toFixed(1)}%` : 'N/A'}
          </div>
          <StatusLine>
            {showLag
              ? lagValue < 100 ? '即時' : lagValue < 1000 ? '開始延遲' : '嚴重延遲'
              : hud.bufferUsage === null ? '—' : hud.bufferUsage < 50 ? '健康' : hud.bufferUsage < 80 ? '偏高' : '快滿了'}
          </StatusLine>
        </div>
        {showLag ? (
          <Sparkline
            data={hud.lagHistory}
            strokeColor={isLagHigh ? '#f43f5e' : '#f59e0b'}
            fillColor={isLagHigh ? '#f43f5e' : '#f59e0b'}
            min={0}
          />
        ) : (
          <Sparkline
            data={hud.bufferHistory}
            strokeColor={isBufferHigh ? '#f43f5e' : '#f59e0b'}
            fillColor={isBufferHigh ? '#f43f5e' : '#f59e0b'}
            min={0}
            max={100}
          />
        )}
      </div>
    </PanelCard>
  )
}
