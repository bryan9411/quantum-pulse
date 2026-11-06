'use client'

import React, { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { AbModeSwitch, type PipelineMode } from '@/components/ab-mode-switch'
import { cn } from '@/lib/utils'

export type { PipelineMode }

export interface TerminalNavbarProps {
  mode: PipelineMode
  onModeChange: (mode: PipelineMode) => void
}

export const THEME_STORAGE_KEY = 'qp-theme'

// 以 <html class="dark"> 為唯一真相來源，透過 MutationObserver 訂閱變化
const subscribeTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
const getThemeSnapshot = () => document.documentElement.classList.contains('dark')
const getServerThemeSnapshot = () => false

export const TerminalNavbar = ({
  mode,
  onModeChange,
}: TerminalNavbarProps) => {
  const isDark = useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot)

  const handleToggleTheme = () => {
    const nextDark = !document.documentElement.classList.contains('dark')
    document.documentElement.classList.toggle('dark', nextDark)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextDark ? 'dark' : 'light')
    } catch {
      // 無痕模式等情況下 localStorage 可能無法使用，忽略即可
    }
  }

  const isAccelerated = mode === 'accelerated'

  return (
    <header className='flex flex-wrap items-center justify-between gap-3 py-1'>
      {/* 左側品牌與管線狀態徽章 */}
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
              'hidden md:inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold',
              isAccelerated
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
            )}
          >
            {isAccelerated ? 'Worker 背景處理 + 環形緩衝 + 每幀批次更新' : '主執行緒逐筆更新（未優化）'}
          </span>
        </div>

      </div>

      {/* 右上角毛玻璃膠囊控制器群組 */}
      <div className='flex items-center gap-2.5'>

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
              <span>淺色</span>
            </>
          ) : (
            <>
              <Moon className='h-3.5 w-3.5 text-zinc-600' />
              <span>深色</span>
            </>
          )}
        </button>
      </div>
    </header>
  )
}
