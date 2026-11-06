'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  createChart,
  AreaSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  LineType,
  LastPriceAnimationMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type AreaData
} from 'lightweight-charts'
import type { TradeTick } from '@/lib/type'
import { PanelCard } from '@/components/ui/panel-card'
import { cn } from '@/lib/utils'

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const
type Timeframe = (typeof TIMEFRAMES)[number]

const BASE_SEED_PRICE = 67432.18
const INITIAL_POINTS_COUNT = 80

export interface PriceChartProps {
  latestTicks: TradeTick[]
  currentTick: TradeTick | null
  className?: string
}

const generateInitialSeriesData = (
  count = INITIAL_POINTS_COUNT,
  endPrice = BASE_SEED_PRICE
): AreaData<UTCTimestamp>[] => {
  const nowSec = Math.floor(Date.now() / 1000)
  const points: AreaData<UTCTimestamp>[] = new Array(count)
  let current = endPrice - 420

  for (let i = 0; i < count; i++) {
    const time = (nowSec - (count - 1 - i)) as UTCTimestamp
    if (i === count - 1) {
      current = endPrice
    } else {
      const drift = (endPrice - current) / (count - i)
      const noise = (Math.random() - 0.48) * 18
      current = Number((current + drift + noise).toFixed(2))
    }
    points[i] = { time, value: current }
  }

  return points
}

const getChartThemeOptions = (isDark: boolean) => ({
  layout: {
    background: { type: ColorType.Solid, color: 'transparent' },
    textColor: isDark ? '#a1a1aa' : '#71717a',
    fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
    fontSize: 11,
    attributionLogo: false
  },
  grid: {
    vertLines: { color: isDark ? 'rgba(39, 39, 42, 0.5)' : 'rgba(228, 228, 231, 0.6)' },
    horzLines: { color: isDark ? 'rgba(39, 39, 42, 0.5)' : 'rgba(228, 228, 231, 0.6)' }
  },
  rightPriceScale: {
    borderColor: isDark ? '#27272a' : '#e4e4e7',
    scaleMargins: { top: 0.12, bottom: 0.12 }
  },
  timeScale: {
    borderColor: isDark ? '#27272a' : '#e4e4e7',
    timeVisible: true,
    secondsVisible: true,
    rightOffset: 3
  }
})

export const PriceChart = ({
  latestTicks,
  currentTick,
  className
}: PriceChartProps) => {
  const [timeframe, setTimeframe] = useState<Timeframe>('1m')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const lastTimeSecRef = useRef<number>(0)
  const openPriceRef = useRef<number>(65890.5)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isDark = document.documentElement.classList.contains('dark')
    const chart = createChart(container, {
      ...getChartThemeOptions(isDark),
      width: container.clientWidth,
      height: container.clientHeight || 380,
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#10b981',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#10b981'
        },
        horzLine: {
          color: '#10b981',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#10b981'
        }
      },
      handleScroll: true,
      handleScale: true
    })

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#10b981',
      topColor: 'rgba(16, 185, 129, 0.24)',
      bottomColor: 'rgba(16, 185, 129, 0.01)',
      lineWidth: 2,
      lineType: LineType.Curved,
      priceLineVisible: true,
      priceLineColor: '#10b981',
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dashed,
      lastPriceAnimation: LastPriceAnimationMode.Continuous
    })

    const seedData = generateInitialSeriesData(INITIAL_POINTS_COUNT, BASE_SEED_PRICE)
    areaSeries.setData(seedData)

    if (seedData.length > 0) {
      lastTimeSecRef.current = Number(seedData[seedData.length - 1].time)
      openPriceRef.current = seedData[0].value
    }

    chart.timeScale().fitContent()

    chartRef.current = chart
    seriesRef.current = areaSeries

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry || !chartRef.current) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        chartRef.current.applyOptions({ width, height })
      }
    })
    resizeObserver.observe(container)

    const themeObserver = new MutationObserver(() => {
      if (!chartRef.current) return
      const darkNow = document.documentElement.classList.contains('dark')
      chartRef.current.applyOptions(getChartThemeOptions(darkNow))
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    })

    return () => {
      resizeObserver.disconnect()
      themeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    if (!series || latestTicks.length === 0) return

    const lastTick = latestTicks[latestTicks.length - 1]
    const tickTimeSec = Math.floor(lastTick.timestamp / 1000)
    const safeTimeSec = Math.max(tickTimeSec, lastTimeSecRef.current)

    lastTimeSecRef.current = safeTimeSec

    series.update({
      time: safeTimeSec as UTCTimestamp,
      value: lastTick.price
    })
  }, [latestTicks])

  const displayPrice = currentTick?.price ?? BASE_SEED_PRICE
  const priceChangePercent = ((displayPrice - openPriceRef.current) / openPriceRef.current) * 100
  const isPositive = priceChangePercent >= 0

  return (
    <PanelCard
      className={cn('min-h-[460px]', className)}
      bodyClassName='flex flex-col pt-3'
    >
      <div className='flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-zinc-100 dark:border-zinc-800/80'>
        <div className='flex items-center gap-4'>
          <div className='flex items-center gap-2.5'>
            <div className='flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white font-bold text-sm shadow-xs'>
              ₿
            </div>
            <span className='text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100'>
              BTC/USDT
            </span>
          </div>

          <div className='flex flex-col'>
            <div className='flex items-baseline gap-2'>
              <span className='font-mono tabular-nums text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100'>
                ${displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span
                className={cn(
                  'font-mono tabular-nums text-xs font-semibold',
                  isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {isPositive ? '+' : ''}
                {priceChangePercent.toFixed(2)}%
              </span>
            </div>
            <span className='font-mono tabular-nums text-[11px] text-zinc-400 dark:text-zinc-500'>
              ≈ ${displayPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className='flex items-center gap-1 rounded-lg bg-zinc-100/80 p-1 dark:bg-zinc-800/80'>
          {TIMEFRAMES.map((tf) => {
            const active = timeframe === tf
            return (
              <button
                key={tf}
                type='button'
                onClick={() => setTimeframe(tf)}
                className={cn(
                  'px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all cursor-pointer',
                  active
                    ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100'
                    : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                )}
              >
                {tf}
              </button>
            )
          })}
        </div>
      </div>

      <div
        ref={containerRef}
        className='relative flex-1 w-full min-h-[360px] pt-2'
      />
    </PanelCard>
  )
}

