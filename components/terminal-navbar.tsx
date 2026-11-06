'use client'

import React, { useState } from 'react'
import { Moon, Sun, FlaskConical } from 'lucide-react'
import type { BackpressureStrategy } from '@/lib/coalescing-strategies'
import { AbModeSwitch, type PipelineMode } from '@/components/ab-mode-switch'
import { cn } from '@/lib/utils'

export type { PipelineMode }

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
      {/* 左側品牌、管線狀態徽章與背壓策略膠囊控制器 */}
      <div className='flex items-center gap-3'>
        <div className='flex items-center gap-2'>
          <span
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              isAccelerated
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse'
            )}
          />
          <span className='text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100'>
            QuantumPulse
          </span>
          <span
            className={cn(
              'hidden md:inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold',
              isAccelerated
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
            )}
          >
            {isAccelerated ? 'Worker + RingBuffer + rAF' : 'Main-Thread Naive setState'}
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

      {/* 右上角毛玻璃膠囊控制器群組 */}
      <div className='flex items-center gap-2.5'>
        <button
          type='button'
          onClick={onToggleLab}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all backdrop-blur-md cursor-pointer',
            showLab
              ? 'border-indigo-300 bg-indigo-50/90 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300'
              : 'border-zinc-200/90 bg-white/80 text-zinc-600 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400'
          )}
        >
          <FlaskConical className='h-3.5 w-3.5' />
          <span className='hidden md:inline'>Benchmarks</span>
        </button>

        {/* 6-A 右上角毛玻璃 A/B 切換膠囊按鈕 */}
        <AbModeSwitch
          mode={mode}
          onChange={onModeChange}
        />

        {/* [ 🌙 Dark ] 主題切換膠囊按鈕 */}
        <button
          type='button'
          onClick={handleToggleTheme}
          className='flex items-center gap-1.5 rounded-full border border-zinc-200/90 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-md hover:bg-white transition-all cursor-pointer dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800'
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
