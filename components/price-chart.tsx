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

/**
 * 每個時間區間：bucketSec 為每個資料點聚合的秒數，windowSec 為畫面可視的時間長度
 * 讓每個區間畫面上都維持約 60 ~ 300 個點
 */
const TIMEFRAME_CONFIG: Record<Timeframe, { bucketSec: number; windowSec: number }> = {
  '1m': { bucketSec: 1, windowSec: 60 },
  '5m': { bucketSec: 1, windowSec: 300 },
  '15m': { bucketSec: 5, windowSec: 900 },
  '1h': { bucketSec: 15, windowSec: 3600 },
  '4h': { bucketSec: 60, windowSec: 14400 },
  '1D': { bucketSec: 300, windowSec: 86400 }
}

const BASE_SEED_PRICE = 67432.18
// 種子走勢的起點價（24 小時前），固定常數讓 SSR 與 Client 計算出相同的漲跌幅
const SEED_OPEN_PRICE = Number((BASE_SEED_PRICE - 420).toFixed(2))
const SEED_HISTORY_SEC = 86400
// 種子歷史的每秒波動（相對價格），24 小時約 ±6%
const SEED_VOLATILITY_PER_SEC = 0.0002
const MAX_HISTORY_SEC = SEED_HISTORY_SEC + 3600

interface SecondPoint {
  time: number
  value: number
}

export interface PriceChartProps {
  latestTicks: TradeTick[]
  currentTick: TradeTick | null
  className?: string
}

/**
 * 以 Brownian Bridge 產生 24 小時、每秒一點的種子歷史：
 * 隨機漫步後線性校正，讓起點精準等於 SEED_OPEN_PRICE、終點精準等於 BASE_SEED_PRICE
 */
const generateSeedHistory = (): SecondPoint[] => {
  const nowSec = Math.floor(Date.now() / 1000)
  const n = SEED_HISTORY_SEC
  const walk = new Float64Array(n)
  let logPrice = 0
  for (let i = 1; i < n; i++) {
    const u1 = Math.random() || Number.MIN_VALUE
    const u2 = Math.random()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    logPrice += SEED_VOLATILITY_PER_SEC * z
    walk[i] = logPrice
  }

  const startLog = Math.log(SEED_OPEN_PRICE)
  const endLog = Math.log(BASE_SEED_PRICE)
  const drift = walk[n - 1]
  const points: SecondPoint[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const bridged = startLog + (endLog - startLog) * t + walk[i] - drift * t
    points[i] = {
      time: nowSec - (n - 1 - i),
      value: Number(Math.exp(bridged).toFixed(2))
    }
  }
  return points
}

/**
 * 將每秒歷史依 bucketSec 聚合（取每個區間最後一筆價格）
 */
const bucketize = (history: SecondPoint[], bucketSec: number): AreaData<UTCTimestamp>[] => {
  if (bucketSec <= 1) {
    return history.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
  }
  const out: AreaData<UTCTimestamp>[] = []
  for (const p of history) {
    const bucketTime = Math.floor(p.time / bucketSec) * bucketSec
    const last = out[out.length - 1]
    if (last && last.time === bucketTime) {
      last.value = p.value
    } else {
      out.push({ time: bucketTime as UTCTimestamp, value: p.value })
    }
  }
  return out
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
  const historyRef = useRef<SecondPoint[]>([])
  const bucketSecRef = useRef(TIMEFRAME_CONFIG['1m'].bucketSec)

  /**
   * 以指定時間區間重建整條資料序列並調整可視範圍
   */
  const applyTimeframe = (tf: Timeframe) => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return

    const { bucketSec, windowSec } = TIMEFRAME_CONFIG[tf]
    bucketSecRef.current = bucketSec

    const data = bucketize(historyRef.current, bucketSec)
    series.setData(data)

    chart.applyOptions({ timeScale: { secondsVisible: bucketSec < 60 } })
    const visibleBars = Math.ceil(windowSec / bucketSec)
    chart.timeScale().setVisibleLogicalRange({
      from: Math.max(0, data.length - visibleBars),
      to: data.length - 1 + 3
    })
  }

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

    chartRef.current = chart
    seriesRef.current = areaSeries

    if (historyRef.current.length === 0) {
      historyRef.current = generateSeedHistory()
    }

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

  // 時間區間切換（含首次掛載）：重新聚合歷史並設定可視範圍
  useEffect(() => {
    applyTimeframe(timeframe)
  }, [timeframe])

  useEffect(() => {
    const series = seriesRef.current
    if (!series || latestTicks.length === 0) return

    const history = historyRef.current
    const lastTick = latestTicks[latestTicks.length - 1]
    const lastPoint = history[history.length - 1]
    const tickSec = Math.floor(lastTick.timestamp / 1000)
    const sec = lastPoint ? Math.max(tickSec, lastPoint.time) : tickSec

    if (lastPoint && lastPoint.time === sec) {
      lastPoint.value = lastTick.price
    } else {
      history.push({ time: sec, value: lastTick.price })
      if (history.length > MAX_HISTORY_SEC) {
        history.splice(0, history.length - SEED_HISTORY_SEC)
      }
    }

    const bucketSec = bucketSecRef.current
    series.update({
      time: (Math.floor(sec / bucketSec) * bucketSec) as UTCTimestamp,
      value: lastTick.price
    })
  }, [latestTicks])

  const displayPrice = currentTick?.price ?? BASE_SEED_PRICE
  const priceChangePercent = ((displayPrice - SEED_OPEN_PRICE) / SEED_OPEN_PRICE) * 100
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

