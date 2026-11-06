'use client'

import React, { useState } from 'react'
import { Zap, Moon, Sun, FlaskConical } from 'lucide-react'
import type { BackpressureStrategy } from '@/lib/coalescing-strategies'
import { cn } from '@/lib/utils'

export type PipelineMode = 'accelerated' | 'baseline'

export interface TerminalNavbarProps {
  mode: PipelineMode
  onModeChange: (mode: PipelineMode) => void
  strategy: BackpressureStrategy
  onStrategyChange: (strategy: BackpressureStrategy) => void
  showLab: boolean
  onToggleLab: () => void
}

const STRATEGY_PILLS: { id: BackpressureStrategy; label: string }[] = [
  { id: 'coalesce', label: 'Coalesce' },
  { id: 'drop', label: 'Drop' },
  { id: 'queue', label: 'Queue' }
]

export const TerminalNavbar = ({
  mode,
  onModeChange,
  strategy,
  onStrategyChange,
  showLab,
  onToggleLab
}: TerminalNavbarProps) => {
  const [isDark, setIsDark] = useState(false)

  const handleToggleTheme = () => {
    const nextDark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', nextDark)
    setIsDark(nextDark)
  }

  const isAccelerated = mode === 'accelerated'

  return (
    <header className='flex flex-wrap items-center justify-between gap-3 py-1'>
      {/* 左側品牌與背壓策略膠囊控制器 */}
      <div className='flex items-center gap-3'>
        <div className='flex items-center gap-2'>
          <span className='h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' />
          <span className='text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100'>
            QuantumPulse
          </span>
        </div>

        {isAccelerated && (
          <div className='hidden sm:flex items-center gap-0.5 rounded-full border border-zinc-200/80 bg-white/80 p-0.5 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/80'>
            {STRATEGY_PILLS.map((pill) => {
              const active = strategy === pill.id
              return (
                <button
                  key={pill.id}
                  type='button'
                  onClick={() => onStrategyChange(pill.id)}
                  className={cn(
                    'px-2.5 py-0.5 text-[11px] font-mono rounded-full transition-all cursor-pointer',
                    active
                      ? 'bg-zinc-900 text-white font-medium dark:bg-zinc-100 dark:text-zinc-900'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  )}
                >
                  {pill.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 右上角膠囊控制器群組（對齊 design-preview.jpg） */}
      <div className='flex items-center gap-2.5'>
        <button
          type='button'
          onClick={onToggleLab}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all backdrop-blur-md cursor-pointer',
            showLab
              ? 'border-indigo-300 bg-indigo-50/90 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
              : 'border-zinc-200/90 bg-white/85 text-zinc-600 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/85 dark:text-zinc-400'
          )}
        >
          <FlaskConical className='h-3.5 w-3.5' />
          <span className='hidden md:inline'>Benchmarks</span>
        </button>

        {/* [ ⚡ Accelerated | Baseline ] 膠囊切換器 */}
        <div className='flex items-center rounded-full border border-zinc-200/90 bg-white/90 p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/90'>
          <button
            type='button'
            onClick={() => onModeChange('accelerated')}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
              isAccelerated
                ? 'bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            <Zap className='h-3.5 w-3.5 fill-current' />
            <span>Accelerated</span>
          </button>

          <span className='text-zinc-300 dark:text-zinc-700 select-none px-0.5 text-xs'>
            |
          </span>

          <button
            type='button'
            onClick={() => onModeChange('baseline')}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-all cursor-pointer',
              !isAccelerated
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            )}
          >
            Baseline
          </button>
        </div>

        {/* [ 🌙 Dark ] 主題切換膠囊按鈕 */}
        <button
          type='button'
          onClick={handleToggleTheme}
          className='flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white/90 px-3.5 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md hover:bg-white transition-all cursor-pointer dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-800'
        >
          {isDark ? (
            <>
              <Sun className='h-3.5 w-3.5 text-amber-400' />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className='h-3.5 w-3.5 text-zinc-600' />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>
    </header>
  )
}

