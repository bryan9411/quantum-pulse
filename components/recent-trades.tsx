'use client'

import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { TradeTick } from '@/lib/type'
import type { PipelineMode } from '@/components/ab-mode-switch'
import { PanelCard } from '@/components/ui/panel-card'
import { cn } from '@/lib/utils'

const MAX_TRADE_HISTORY = 500
const ROW_HEIGHT = 28

const INITIAL_TRADES: TradeTick[] = Array.from({ length: 120 }, (_, idx) => ({
  id: `seed-${idx}`,
  price: Number((67432.18 + Math.sin(idx * 0.5) * 12).toFixed(2)),
  size: Number((0.02 + ((idx * 17) % 90) / 100).toFixed(4)),
  side: idx % 2 === 0 ? 'buy' : 'sell',
  timestamp: Date.now() - idx * 1000
}))

const formatTradeTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export interface RecentTradesProps {
  latestTicks: TradeTick[]
  mode?: PipelineMode
  className?: string
}

export const RecentTrades = ({
  latestTicks,
  mode = 'accelerated',
  className
}: RecentTradesProps) => {
  const tradesRef = useRef<TradeTick[]>(INITIAL_TRADES)
  const lastBatchRef = useRef<TradeTick[] | null>(null)
  const parentRef = useRef<HTMLDivElement | null>(null)
  const isAccelerated = mode === 'accelerated'

  // 直接在 Render 階段同步合併最新批次，徹底消滅 useEffect -> setState 連鎖更新造成的 Maximum update depth exceeded
  if (latestTicks.length > 0 && latestTicks !== lastBatchRef.current) {
    lastBatchRef.current = latestTicks
    const incomingReversed = [...latestTicks].reverse()
    const merged = [...incomingReversed, ...tradesRef.current]
    tradesRef.current =
      merged.length > MAX_TRADE_HISTORY
        ? merged.slice(0, MAX_TRADE_HISTORY)
        : merged
  }

  const trades = tradesRef.current

  const rowVirtualizer = useVirtualizer({
    count: trades.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <PanelCard
      title='Recent Trades'
      headerRight={
        <span
          className={cn(
            'font-mono tabular-nums text-[10px] px-1.5 py-0.5 rounded font-semibold',
            isAccelerated
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
          )}
        >
          {isAccelerated
            ? `Virtual DOM: ${virtualItems.length} / ${trades.length}`
            : `Full DOM: ${trades.length} rows`}
        </span>
      }
      className={cn('h-full', className)}
      bodyClassName='flex flex-col pt-1'
    >
      <div className='grid grid-cols-3 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 px-1 pb-1.5 border-b border-zinc-100 dark:border-zinc-800/80'>
        <span>Price (USDT)</span>
        <span className='text-right'>Amount (BTC)</span>
        <span className='text-right'>Time</span>
      </div>

      <div
        ref={parentRef}
        className='no-scrollbar relative h-[168px] w-full overflow-y-auto mt-1'
      >
        {isAccelerated ? (
          /* ⚡ Accelerated 模式：@tanstack/react-virtual 僅渲染可視區約 8~11 列 DOM */
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative'
            }}
          >
            {virtualItems.map((virtualRow) => {
              const trade = trades[virtualRow.index]
              if (!trade) return null
              const isBuy = trade.side === 'buy'

              return (
                <div
                  key={`${trade.id}-${virtualRow.index}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`
                  }}
                  className='grid grid-cols-3 items-center px-1 font-mono tabular-nums text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded transition-colors'
                >
                  <div
                    className={cn(
                      'flex items-center gap-1 font-semibold',
                      isBuy ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {isBuy ? (
                      <ArrowUp className='h-3 w-3 shrink-0 stroke-[2.5]' />
                    ) : (
                      <ArrowDown className='h-3 w-3 shrink-0 stroke-[2.5]' />
                    )}
                    <span>
                      {trade.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <span className='text-right font-medium text-zinc-700 dark:text-zinc-200'>
                    {trade.size.toFixed(4)}
                  </span>

                  <span
                    suppressHydrationWarning
                    className='text-right text-[11px] text-zinc-400 dark:text-zinc-500'
                  >
                    {formatTradeTime(trade.timestamp)}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          /* 🐢 Baseline 未優化模式：直接把 500 筆完整 DOM 節點全部塞進畫面，不使用虛擬化與 tabular-nums */
          <div className='flex flex-col'>
            {trades.map((trade, idx) => {
              const isBuy = trade.side === 'buy'
              return (
                <div
                  key={`${trade.id}-${idx}`}
                  style={{ height: `${ROW_HEIGHT}px` }}
                  className='grid grid-cols-3 items-center px-1 text-xs'
                >
                  <div
                    className={cn(
                      'flex items-center gap-1 font-semibold',
                      isBuy ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {isBuy ? (
                      <ArrowUp className='h-3 w-3 shrink-0 stroke-[2.5]' />
                    ) : (
                      <ArrowDown className='h-3 w-3 shrink-0 stroke-[2.5]' />
                    )}
                    <span>
                      {trade.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  <span className='text-right font-medium text-zinc-700 dark:text-zinc-200'>
                    {trade.size.toFixed(4)}
                  </span>

                  <span
                    suppressHydrationWarning
                    className='text-right text-[11px] text-zinc-400 dark:text-zinc-500'
                  >
                    {formatTradeTime(trade.timestamp)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </PanelCard>
  )
}
