'use client'

import React from 'react'
import type { PipelineMode } from '@/components/ab-mode-switch'
import { PanelCard } from '@/components/ui/panel-card'
import { cn } from '@/lib/utils'

/** 某個模式在某個 TPS 下的累積量測紀錄 */
export interface AbRecord {
  tps: number
  seconds: number
  fpsSum: number
  maxStallMs: number
  autoPaused: boolean
}

export type AbRecords = Partial<Record<PipelineMode, AbRecord>>

export interface AbComparisonCardProps {
  records: AbRecords
  onClear: () => void
  className?: string
}

const COLUMNS: { mode: PipelineMode; label: string; className: string }[] = [
  { mode: 'accelerated', label: '優化版', className: 'text-emerald-700 dark:text-emerald-400' },
  { mode: 'baseline', label: '未優化', className: 'text-rose-700 dark:text-rose-400' }
]

const avgFps = (r?: AbRecord) => (r && r.seconds > 0 ? Math.round(r.fpsSum / r.seconds) : null)

const resultOf = (r?: AbRecord): { text: string; tone: 'ok' | 'warn' | 'bad' } | null => {
  if (r?.autoPaused) return { text: '自動暫停', tone: 'bad' }
  if (!r || r.seconds === 0) return null
  const fps = avgFps(r) ?? 0
  if (fps >= 50 && r.maxStallMs < 100) return { text: '流暢', tone: 'ok' }
  if (fps >= 25) return { text: '偶有卡頓', tone: 'warn' }
  return { text: '嚴重卡頓', tone: 'bad' }
}

const toneClass = {
  ok: 'text-emerald-700 dark:text-emerald-400',
  warn: 'text-amber-700 dark:text-amber-400',
  bad: 'text-rose-700 dark:text-rose-400'
}

export const AbComparisonCard = ({ records, onClear, className }: AbComparisonCardProps) => {
  const hasAny = COLUMNS.some(({ mode }) => records[mode] !== undefined)
  const tpsValues = COLUMNS.map(({ mode }) => records[mode]?.tps).filter((v): v is number => v !== undefined)
  const sameTps = tpsValues.length === 2 && tpsValues[0] === tpsValues[1]

  const rows: { label: string; render: (r?: AbRecord) => React.ReactNode }[] = [
    { label: '測試 TPS', render: (r) => (r ? r.tps.toLocaleString() : '—') },
    { label: '測了幾秒', render: (r) => (r && r.seconds > 0 ? r.seconds : '—') },
    { label: '平均幀率', render: (r) => avgFps(r) ?? '—' },
    {
      label: '最長畫面停頓',
      render: (r) => (r && (r.seconds > 0 || r.maxStallMs > 0) ? `${r.maxStallMs.toLocaleString()} ms` : '—')
    },
    {
      label: '結果',
      render: (r) => {
        const res = resultOf(r)
        return res ? <span className={cn('font-sans font-semibold', toneClass[res.tone])}>{res.text}</span> : '—'
      }
    }
  ]

  return (
    <PanelCard
      title='A/B 對比紀錄'
      headerRight={
        <>
          {sameTps && (
            <span className='text-xs text-zinc-600 dark:text-zinc-300'>
              同樣 {tpsValues[0].toLocaleString()} TPS
            </span>
          )}
          {hasAny && (
            <button
              type='button'
              onClick={onClear}
              className='text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline dark:text-zinc-300 dark:hover:text-zinc-100 cursor-pointer'
            >
              清除
            </button>
          )}
        </>
      }
      className={className}
      bodyClassName='pt-1'
    >
      <div className='grid grid-cols-[auto_1fr_1fr] items-center gap-x-3 gap-y-1.5 text-xs'>
        <span />
        {COLUMNS.map((col) => (
          <span key={col.mode} className={cn('text-center font-semibold', col.className)}>
            {col.label}
          </span>
        ))}
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <span className='text-zinc-600 dark:text-zinc-300'>{row.label}</span>
            {COLUMNS.map((col) => (
              <span
                key={col.mode}
                className='text-center font-mono tabular-nums text-zinc-900 dark:text-zinc-100'
              >
                {row.render(records[col.mode])}
              </span>
            ))}
          </React.Fragment>
        ))}
      </div>
      {!hasAny && (
        <p className='mt-2.5 text-xs text-zinc-600 dark:text-zinc-300'>
          用同樣的 TPS 分別跑「優化版」和「未優化」各幾秒，這裡會自動記錄並排比較。
        </p>
      )}
    </PanelCard>
  )
}
