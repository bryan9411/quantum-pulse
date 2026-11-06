'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { PanelCard } from '@/components/ui/panel-card'

export interface TpsControllerProps {
  currentTps: number
  isRunning: boolean
  onTpsChange: (tps: number) => void
  onToggle: (running: boolean) => void
  min?: number
  max?: number
}

const TPS_PRESETS = [
  { label: '100', value: 100 },
  { label: '1K', value: 1000 },
  { label: '10K', value: 10000 },
  { label: '50K', value: 50000 }
] as const

// 對數刻度滑桿：讓 10 ~ 50,000 在整條軌道上平均分布
const SLIDER_STEPS = 1000

const tpsToSlider = (tps: number, min: number, max: number): number => {
  const lo = Math.log10(min)
  const hi = Math.log10(max)
  return Math.round(((Math.log10(Math.max(min, tps)) - lo) / (hi - lo)) * SLIDER_STEPS)
}

const sliderToTps = (pos: number, min: number, max: number): number => {
  const lo = Math.log10(min)
  const hi = Math.log10(max)
  const raw = Math.pow(10, lo + (pos / SLIDER_STEPS) * (hi - lo))
  // 取兩位有效數字，避免出現 12,347 這種難讀的數字
  const magnitude = Math.pow(10, Math.max(0, Math.floor(Math.log10(raw)) - 1))
  return Math.min(max, Math.max(min, Math.round(raw / magnitude) * magnitude))
}

export const TpsController = ({
  currentTps,
  isRunning,
  onTpsChange,
  onToggle,
  min = 10,
  max = 50000
}: TpsControllerProps) => {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onTpsChange(sliderToTps(Number(e.target.value), min, max))
  }

  const handleToggle = () => {
    onToggle(!isRunning)
  }

  return (
    <PanelCard
      title='TPS'
      headerRight={
        <>
          <span className='font-mono tabular-nums text-xs font-medium text-zinc-600 dark:text-zinc-300'>
            {currentTps.toLocaleString()} TPS
          </span>
          <button
            type='button'
            onClick={handleToggle}
            title={isRunning ? '暫停注入' : '開始注入'}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer',
              isRunning
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
              )}
            />
            {isRunning ? '執行中' : '已暫停'}
          </button>
        </>
      }
      bodyClassName='flex flex-col gap-3 pt-1'
    >
      <div className='flex items-center py-1'>
        <input
          type='range'
          min={0}
          max={SLIDER_STEPS}
          value={tpsToSlider(currentTps, min, max)}
          aria-label='TPS'
          onChange={handleSliderChange}
          className='h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-sky-500 dark:bg-zinc-800 dark:accent-sky-400'
        />
      </div>

      <div className='grid grid-cols-4 gap-2 pt-0.5'>
        {TPS_PRESETS.map((preset) => {
          const isActive = currentTps === preset.value
          return (
            <button
              key={preset.value}
              type='button'
              onClick={() => onTpsChange(preset.value)}
              className={cn(
                'py-1 text-center text-xs font-mono tabular-nums rounded-full border transition-all cursor-pointer',
                isActive
                  ? 'border-zinc-900 bg-zinc-900 text-white font-medium shadow-xs dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900'
              )}
            >
              {preset.label}
            </button>
          )
        })}
      </div>
    </PanelCard>
  )
}
