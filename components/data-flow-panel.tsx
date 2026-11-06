'use client'

import React from 'react'
import { ArrowRight } from 'lucide-react'
import type { BackpressureStrategy } from '@/lib/coalescing-strategies'
import type { PipelineMode } from '@/components/ab-mode-switch'
import { STRATEGY_META, STRATEGY_ORDER } from '@/lib/strategy-meta'
import { PanelCard } from '@/components/ui/panel-card'
import { cn } from '@/lib/utils'

/** 每秒取樣一次的資料去向統計 */
export interface FlowStats {
  incomingPerSec: number
  renderedPerSec: number
  /** 依目前策略：合併（coalesce）或丟棄（drop）的筆數 */
  discardedPerSec: number
  /** Ring Buffer 滿載被覆蓋的筆數 */
  overwrittenPerSec: number
  queueSize: number
  bufferUsage: number
}

export const EMPTY_FLOW_STATS: FlowStats = {
  incomingPerSec: 0,
  renderedPerSec: 0,
  discardedPerSec: 0,
  overwrittenPerSec: 0,
  queueSize: 0,
  bufferUsage: 0
}

export interface DataFlowPanelProps {
  mode: PipelineMode
  strategy: BackpressureStrategy
  onStrategyChange: (strategy: BackpressureStrategy) => void
  stats: FlowStats
  mainThreadLagMs: number
  isRunning: boolean
  className?: string
}

interface Segment {
  key: string
  label: string
  value: number
  colorClass: string
}

const fmt = (n: number) => Math.round(n).toLocaleString()

const FlowNode = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className='rounded-xl bg-zinc-100/80 px-3 py-2 text-center dark:bg-zinc-800/60'>
    <div className='text-xs text-zinc-600 dark:text-zinc-300'>{label}</div>
    <div className='mt-0.5 font-mono tabular-nums text-sm font-bold text-zinc-900 dark:text-zinc-100'>
      {children}
    </div>
  </div>
)

export const DataFlowPanel = ({
  mode,
  strategy,
  onStrategyChange,
  stats,
  mainThreadLagMs,
  isRunning,
  className
}: DataFlowPanelProps) => {
  const isAccelerated = mode === 'accelerated'
  const meta = STRATEGY_META[strategy]

  const segments: Segment[] = [
    {
      key: 'rendered',
      label: strategy === 'queue' && stats.queueSize > 60 ? '顯示（畫面落後中）' : '顯示',
      value: stats.renderedPerSec,
      colorClass: 'bg-emerald-600 dark:bg-emerald-400'
    },
    {
      key: 'discarded',
      label: meta.discardedLabel,
      value: strategy === 'queue' ? 0 : stats.discardedPerSec,
      colorClass: strategy === 'drop' ? 'bg-rose-600 dark:bg-rose-400' : 'bg-violet-600 dark:bg-violet-400'
    },
    {
      key: 'overwritten',
      label: '緩衝區滿被覆蓋',
      value: stats.overwrittenPerSec,
      colorClass: 'bg-amber-500 dark:bg-amber-400'
    }
  ].filter((seg) => seg.value > 0)

  const segmentTotal = segments.reduce((sum, seg) => sum + seg.value, 0)
  const bufferColor =
    stats.bufferUsage >= 80
      ? 'bg-rose-600 dark:bg-rose-400'
      : stats.bufferUsage >= 50
        ? 'bg-amber-500 dark:bg-amber-400'
        : 'bg-emerald-600 dark:bg-emerald-400'
  // 排隊策略下，目前積壓量需要多久才能消化完
  const queueDelaySec = stats.renderedPerSec > 0 ? stats.queueSize / stats.renderedPerSec : 0

  return (
    <PanelCard
      title='資料流向'
      headerRight={
        isAccelerated && (
          <div role='group' aria-label='處理不完時的策略' className='flex items-center gap-1'>
            <span className='mr-1 text-xs text-zinc-600 dark:text-zinc-300'>處理不完時</span>
            {STRATEGY_ORDER.map((id) => {
              const active = strategy === id
              return (
                <button
                  key={id}
                  type='button'
                  onClick={() => onStrategyChange(id)}
                  title={STRATEGY_META[id].description}
                  className={cn(
                    'rounded-full border px-3 py-0.5 text-xs font-medium transition-colors cursor-pointer',
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                      : 'border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800'
                  )}
                >
                  {STRATEGY_META[id].label}
                </button>
              )
            })}
          </div>
        )
      }
      className={className}
      bodyClassName='flex flex-col gap-3 pt-1'
    >
      {isAccelerated ? (
        <>
          <div className='grid grid-cols-[1fr_auto_1.3fr_auto_1fr] items-center gap-2'>
            <FlowNode label='進入'>
              {fmt(stats.incomingPerSec)}
              <span className='ml-1 text-xs font-normal text-zinc-600 dark:text-zinc-300'>筆/秒</span>
            </FlowNode>
            <ArrowRight className='h-4 w-4 text-zinc-500 dark:text-zinc-400' aria-hidden='true' />
            <div className='rounded-xl bg-zinc-100/80 px-3 py-2 dark:bg-zinc-800/60'>
              <div className='flex justify-between text-xs text-zinc-600 dark:text-zinc-300'>
                <span>緩衝區</span>
                <span className='font-mono tabular-nums font-semibold text-zinc-900 dark:text-zinc-100'>
                  {stats.bufferUsage.toFixed(1)}%
                </span>
              </div>
              <div className='mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700'>
                <div
                  className={cn('h-full rounded-full transition-[width] duration-300', bufferColor)}
                  style={{ width: `${Math.min(100, stats.bufferUsage)}%` }}
                />
              </div>
            </div>
            <ArrowRight className='h-4 w-4 text-zinc-500 dark:text-zinc-400' aria-hidden='true' />
            <FlowNode label='畫面'>
              60
              <span className='ml-1 text-xs font-normal text-zinc-600 dark:text-zinc-300'>筆/幀上限</span>
            </FlowNode>
          </div>

          <div>
            <div className='mb-1 text-xs text-zinc-600 dark:text-zinc-300'>
              每秒 {fmt(stats.incomingPerSec)} 筆的去向
            </div>
            <div className='flex h-3 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-700'>
              {segmentTotal > 0 &&
                segments.map((seg) => (
                  <div
                    key={seg.key}
                    className={cn('h-full transition-[width] duration-300', seg.colorClass)}
                    style={{ width: `${(seg.value / segmentTotal) * 100}%` }}
                  />
                ))}
            </div>
            <div className='mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-700 dark:text-zinc-200'>
              {segments.length === 0 && (
                <span className='text-zinc-600 dark:text-zinc-300'>
                  {isRunning ? '等待資料…' : '按下「開始注入」後開始統計'}
                </span>
              )}
              {segments.map((seg) => (
                <span key={seg.key} className='flex items-center gap-1.5'>
                  <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', seg.colorClass)} />
                  {seg.label}
                  <span className='font-mono tabular-nums font-semibold'>{fmt(seg.value)}</span>
                  筆
                </span>
              ))}
              {strategy === 'queue' && stats.queueSize > 0 && (
                <span className='flex items-center gap-1.5'>
                  <span className='inline-block h-2.5 w-2.5 rounded-sm bg-zinc-400 dark:bg-zinc-500' />
                  排隊中
                  <span className='font-mono tabular-nums font-semibold'>{fmt(stats.queueSize)}</span>
                  筆（約落後 {queueDelaySec.toFixed(1)} 秒）
                </span>
              )}
            </div>
            <p className='mt-1.5 text-xs text-zinc-600 dark:text-zinc-300'>{meta.description}</p>
          </div>
        </>
      ) : (
        <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2'>
          <FlowNode label='進入'>
            {fmt(stats.incomingPerSec)}
            <span className='ml-1 text-xs font-normal text-zinc-600 dark:text-zinc-300'>筆/秒</span>
          </FlowNode>
          <ArrowRight className='h-4 w-4 text-zinc-500 dark:text-zinc-400' aria-hidden='true' />
          <FlowNode label='主執行緒延遲 (Main Thread Lag)'>
            <span className={cn(mainThreadLagMs >= 1000 && 'text-rose-700 dark:text-rose-400')}>
              {fmt(mainThreadLagMs)}
            </span>
            <span className='ml-1 text-xs font-normal text-zinc-600 dark:text-zinc-300'>ms</span>
          </FlowNode>
          <p className='col-span-3 text-xs text-zinc-600 dark:text-zinc-300'>
            未優化模式沒有緩衝區與背壓策略：每一筆成交都在主執行緒處理並直接更新畫面，量一大就會開始延遲，超過 3 秒會自動暫停。
          </p>
        </div>
      )}
    </PanelCard>
  )
}
