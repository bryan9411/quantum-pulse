'use client'

import React, { useMemo } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { OrderBookDepth, OrderBookLevel, TradeTick } from '@/lib/type'
import { PanelCard } from '@/components/ui/panel-card'
import { cn } from '@/lib/utils'

const DISPLAY_LEVELS = 5

const INITIAL_ASKS: OrderBookLevel[] = [
  [67434.16, 0.8964],
  [67435.06, 0.5127],
  [67436.02, 1.2436],
  [67437.21, 0.7810],
  [67438.78, 0.4522]
]

const INITIAL_BIDS: OrderBookLevel[] = [
  [67431.76, 0.3187],
  [67431.21, 0.7345],
  [67430.55, 1.1263],
  [67429.98, 0.9821],
  [67428.76, 0.6032]
]

export interface OrderBookProps {
  depth: OrderBookDepth | null
  currentTick: TradeTick | null
  className?: string
}

export const OrderBook = ({
  depth,
  currentTick,
  className
}: OrderBookProps) => {
  const { asks, bids, maxSize, spread } = useMemo(() => {
    const rawAsks = depth?.asks?.length ? depth.asks.slice(0, DISPLAY_LEVELS) : INITIAL_ASKS
    const rawBids = depth?.bids?.length ? depth.bids.slice(0, DISPLAY_LEVELS) : INITIAL_BIDS

    // 賣盤由高價到低價往下排列（最接近中間價的賣一檔在最下方）
    const sortedAsks = [...rawAsks].sort((a, b) => b[0] - a[0])
    // 買盤由高價到低價往下排列（最接近中間價的買一檔在最上方）
    const sortedBids = [...rawBids].sort((a, b) => b[0] - a[0])

    let highestSize = 0.0001
    for (let i = 0; i < sortedAsks.length; i++) {
      if (sortedAsks[i][1] > highestSize) highestSize = sortedAsks[i][1]
    }
    for (let i = 0; i < sortedBids.length; i++) {
      if (sortedBids[i][1] > highestSize) highestSize = sortedBids[i][1]
    }

    // 價差 = 賣一（最低賣價）− 買一（最高買價）
    const bestAsk = Math.min(...rawAsks.map((level) => level[0]))
    const bestBid = Math.max(...rawBids.map((level) => level[0]))

    return {
      asks: sortedAsks,
      bids: sortedBids,
      maxSize: highestSize,
      spread: Math.max(0, bestAsk - bestBid)
    }
  }, [depth])

  const lastPrice = currentTick?.price ?? 67432.18
  const isBuy = (currentTick?.side ?? 'buy') === 'buy'

  return (
    <PanelCard
      title='Order Book'
      className={cn('h-full', className)}
      bodyClassName='flex flex-col justify-between gap-2 pt-1'
    >
      <div className='flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-300 px-2 pb-1 border-b border-zinc-200 dark:border-zinc-700/80'>
        <span>價格 (USDT)</span>
        <span>數量 (BTC)</span>
      </div>

      {/* 賣盤 Asks (上方 5 檔) */}
      <div className='flex flex-col gap-1'>
        {asks.map(([price, size], idx) => {
          const depthRatio = Math.min(100, Math.max(8, (size / maxSize) * 100))
          return (
            <div
              key={`ask-${idx}`}
              className='relative flex items-center justify-between px-2.5 py-1.5 rounded-md overflow-hidden font-mono tabular-nums text-xs bg-rose-500/[0.04] dark:bg-rose-500/[0.06]'
            >
              <div
                className='pointer-events-none absolute inset-y-0 right-0 bg-rose-500/12 dark:bg-rose-500/20 transition-[width] duration-150'
                style={{ width: `${depthRatio}%` }}
              />
              <span className='relative z-10 font-semibold text-rose-700 dark:text-rose-400'>
                {price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className='relative z-10 font-medium text-zinc-700 dark:text-zinc-200'>
                {size.toFixed(4)}
              </span>
            </div>
          )
        })}
      </div>

      {/* 中間最新成交價與方向指標 */}
      <div className='flex items-center justify-between px-2.5 py-2 my-0.5 rounded-lg bg-zinc-50/80 dark:bg-zinc-800/40'>
        <div
          className={cn(
            'flex items-center gap-1 font-mono tabular-nums text-lg font-extrabold tracking-tight',
            isBuy ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
          )}
        >
          <span>
            {lastPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {isBuy ? (
            <ArrowUp className='h-4 w-4 stroke-[2.5]' />
          ) : (
            <ArrowDown className='h-4 w-4 stroke-[2.5]' />
          )}
        </div>
        <span className='font-mono tabular-nums text-xs text-zinc-600 dark:text-zinc-300'>
          價差 {spread.toFixed(2)}
        </span>
      </div>

      {/* 買盤 Bids (下方 5 檔) */}
      <div className='flex flex-col gap-1'>
        {bids.map(([price, size], idx) => {
          const depthRatio = Math.min(100, Math.max(8, (size / maxSize) * 100))
          return (
            <div
              key={`bid-${idx}`}
              className='relative flex items-center justify-between px-2.5 py-1.5 rounded-md overflow-hidden font-mono tabular-nums text-xs bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]'
            >
              <div
                className='pointer-events-none absolute inset-y-0 right-0 bg-emerald-500/12 dark:bg-emerald-500/20 transition-[width] duration-150'
                style={{ width: `${depthRatio}%` }}
              />
              <span className='relative z-10 font-semibold text-emerald-700 dark:text-emerald-400'>
                {price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className='relative z-10 font-medium text-zinc-700 dark:text-zinc-200'>
                {size.toFixed(4)}
              </span>
            </div>
          )
        })}
      </div>
    </PanelCard>
  )
}

