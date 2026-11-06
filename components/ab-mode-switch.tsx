'use client'

import React from 'react'
import { Zap, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type PipelineMode = 'accelerated' | 'baseline'

export interface AbModeSwitchProps {
  mode: PipelineMode
  onChange: (mode: PipelineMode) => void
  className?: string
}

export const AbModeSwitch = ({
  mode,
  onChange,
  className
}: AbModeSwitchProps) => {
  const isAccelerated = mode === 'accelerated'

  return (
    <div
      role='group'
      aria-label='資料管線切換'
      className={cn(
        'inline-flex items-center rounded-full border border-zinc-200/90 bg-white/75 p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-md transition-colors dark:border-zinc-800/90 dark:bg-zinc-900/75',
        className
      )}
    >
      <button
        type='button'
        onClick={() => onChange('accelerated')}
        title='優化管線：Web Worker 背景處理 + 零拷貝傳輸 + 環形緩衝區 + 每幀批次更新'
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
          isAccelerated
            ? 'bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100'
        )}
      >
        <Zap
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            isAccelerated ? 'fill-emerald-400 text-emerald-400 dark:fill-emerald-600 dark:text-emerald-600 scale-105' : ''
          )}
        />
        <span>優化版</span>
      </button>

      <span
        aria-hidden='true'
        className='px-0.5 text-xs text-zinc-300 dark:text-zinc-700 select-none'
      >
        |
      </span>

      <button
        type='button'
        onClick={() => onChange('baseline')}
        title='未優化對照組：每筆成交都在主執行緒處理並直接更新畫面'
        className={cn(
          'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
          !isAccelerated
            ? 'bg-rose-600 text-white shadow-xs'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100'
        )}
      >
        {!isAccelerated && <AlertTriangle className='h-3 w-3 shrink-0' />}
        <span>未優化</span>
      </button>
    </div>
  )
}

