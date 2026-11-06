'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { TradeTick } from '@/lib/type'
import { PanelCard } from '@/components/ui/panel-card'
import { cn } from '@/lib/utils'

const MAX_TRADE_HISTORY = 500
const ROW_HEIGHT = 28

const INITIAL_TRADES: TradeTick[] = [
  { id: 'seed-1', price: 67451.16, size: 0.0452, side: 'sell', timestamp: Date.now() - 1000 },
  { id: 'seed-2', price: 67432.18, size: 0.0321, side: 'buy', timestamp: Date.now() - 2000 },
  { id: 'seed-3', price: 67428.55, size: 0.0789, side: 'buy', timestamp: Date.now() - 3000 },
  { id: 'seed-4', price: 67428.76, size: 0.0217, side: 'sell', timestamp: Date.now() - 4000 },
  { id: 'seed-5', price: 67432.18, size: 0.0643, side: 'buy', timestamp: Date.now() - 5000 },
  { id: 'seed-6', price: 67430.92, size: 0.1124, side: 'buy', timestamp: Date.now() - 6000 },
  { id: 'seed-7', price: 67429.40, size: 0.0518, side: 'sell', timestamp: Date.now() - 7000 },
  { id: 'seed-8', price: 67431.05, size: 0.0890, side: 'buy', timestamp: Date.now() - 8000 }
]

const formatTradeTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

export interface RecentTradesProps {
  latestTicks: TradeTick[]
  className?: string
}

export const RecentTrades = ({
  latestTicks,
  className
}: RecentTradesProps) => {
  const [trades, setTrades] = useState<TradeTick[]>(INITIAL_TRADES)
  const parentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (latestTicks.length === 0) return

    setTrades((prev) => {
      const incomingReversed = [...latestTicks].reverse()
      const merged = [...incomingReversed, ...prev]
      return merged.length > MAX_TRADE_HISTORY
        ? merged.slice(0, MAX_TRADE_HISTORY)
        : merged
    })
  }, [latestTicks])

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
        <span className='font-mono tabular-nums text-[11px] text-zinc-400 dark:text-zinc-500'>
          {trades.length} rows
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
                key={trade.id}
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
      </div>
    </PanelCard>
  )
}

