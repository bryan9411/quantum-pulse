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
      aria-label='Pipeline Architecture Mode Switch'
      className={cn(
        'inline-flex items-center rounded-full border border-zinc-200/90 bg-white/75 p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] backdrop-blur-md transition-colors dark:border-zinc-800/90 dark:bg-zinc-900/75',
        className
      )}
    >
      <button
        type='button'
        onClick={() => onChange('accelerated')}
        title='極致加速管線：Web Worker 零拷貝 + Ring Buffer + 60FPS rAF 水閥'
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
          isAccelerated
            ? 'bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900'
            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
        )}
      >
        <Zap
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            isAccelerated ? 'fill-emerald-400 text-emerald-400 dark:fill-emerald-600 dark:text-emerald-600 scale-105' : ''
          )}
        />
        <span>Accelerated</span>
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
        title='基準對照管線：主執行緒逐筆直接 setState（未優化 Naive 對照組）'
        className={cn(
          'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
          !isAccelerated
            ? 'bg-rose-600 text-white shadow-xs'
            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
        )}
      >
        {!isAccelerated && <AlertTriangle className='h-3 w-3 shrink-0' />}
        <span>Baseline</span>
      </button>
    </div>
  )
}

