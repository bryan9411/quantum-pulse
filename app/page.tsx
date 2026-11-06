'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MockDataSource } from '@/lib/mock-data-source'
import type { TradeTick, OrderBookDepth } from '@/lib/type'
import { TpsController } from '@/components/tps-controller'
import { PriceChart } from '@/components/price-chart'
import { OrderBook } from '@/components/order-book'
import { RecentTrades } from '@/components/recent-trades'
import { PerformanceHUD } from '@/components/performance-hud'
import { TerminalNavbar, type PipelineMode } from '@/components/terminal-navbar'
import { useWorkerStream, type FrameStats } from '@/hooks/useWorkerStream'
import { DataFlowPanel, EMPTY_FLOW_STATS, type FlowStats } from '@/components/data-flow-panel'
import { AbComparisonCard, type AbRecords } from '@/components/ab-comparison-card'

// Baseline 主執行緒延遲超過此值即自動暫停
const BASELINE_LAG_LIMIT_MS = 3000

export default function TerminalPage() {
  const [mode, setMode] = useState<PipelineMode>('accelerated')
  const [currentTick, setCurrentTick] = useState<TradeTick | null>(null)
  const [currentDepth, setCurrentDepth] = useState<OrderBookDepth | null>(null)
  const [baselineTicks, setBaselineTicks] = useState<TradeTick[]>([])
  const [tps, setTps] = useState(1000)
  const [isRunning, setIsRunning] = useState(false)

  const {
    strategy,
    latestTicks,
    latestDepth,
    metrics,
    start: startStream,
    stop: stopStream,
    setStrategy,
    ingestBinary,
    ingestDepth,
    readFrameStats
  } = useWorkerStream()

  // Render 計數：在 commit 後（useEffect）累加並直接寫入 DOM，避免在 render 階段讀寫 ref
  const renderCountRef = useRef(0)
  const renderBadgeRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    renderCountRef.current++
    if (renderBadgeRef.current) {
      renderBadgeRef.current.textContent = `渲染次數：${renderCountRef.current.toLocaleString()}`
    }
  })

  const naiveQueueRef = useRef<TradeTick[]>([])
  const pendingBaselineTicksRef = useRef<TradeTick[]>([])
  const lastBaselineTickCommitRef = useRef(0)
  const lastBaselineDepthCommitRef = useRef(0)
  const ticksReceivedRef = useRef(0)
  const maxLagInWindowRef = useRef(0)
  const autoPausedRef = useRef(false)
  const [measuredTps, setMeasuredTps] = useState(0)
  const [mainThreadLagMs, setMainThreadLagMs] = useState(0)
  const [autoPauseNotice, setAutoPauseNotice] = useState<string | null>(null)
  const [flowStats, setFlowStats] = useState<FlowStats>(EMPTY_FLOW_STATS)
  const [abRecords, setAbRecords] = useState<AbRecords>({})
  const tpsRef = useRef(tps)
  useEffect(() => {
    tpsRef.current = tps
  }, [tps])
  const [dataSource] = useState(() => new MockDataSource())

  // 每秒取樣：主執行緒實際收到的 Tick 速率、資料去向、A/B 對比紀錄（兩種管線共用同一個量測點）
  useEffect(() => {
    if (!isRunning) return

    ticksReceivedRef.current = 0
    maxLagInWindowRef.current = 0
    let lastSample = performance.now()
    let prev: FrameStats = readFrameStats()
    let sampleIndex = 0
    let wasHiddenInWindow = document.hidden
    const onVisibilityChange = () => {
      if (document.hidden) wasHiddenInWindow = true
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const timer = window.setInterval(() => {
      const now = performance.now()
      const elapsedSec = (now - lastSample) / 1000
      const perSec = (n: number) => Math.max(0, n) / elapsedSec
      const incoming = Math.round(ticksReceivedRef.current / elapsedSec)
      const cur = readFrameStats()

      setMeasuredTps(incoming)
      setMainThreadLagMs(maxLagInWindowRef.current)
      setFlowStats({
        incomingPerSec: incoming,
        renderedPerSec: perSec(cur.renderedTicks - prev.renderedTicks),
        discardedPerSec: perSec(cur.strategyDiscarded - prev.strategyDiscarded),
        overwrittenPerSec: perSec(cur.overwritten - prev.overwritten),
        queueSize: cur.queueSize,
        bufferUsage: cur.bufferUsage
      })

      // 必須在這裡先算好：setAbRecords 的 updater 由 React 稍後執行，屆時 prev 已被改成 cur
      const framesThisSecond = Math.max(0, cur.totalFrames - prev.totalFrames)
      const longFramesThisSecond = Math.max(0, cur.longFrames - prev.longFrames)
      const maxGapThisSecond = cur.maxFrameGapMs

      // 第一秒包含啟動成本，不列入 A/B 紀錄；自動暫停後、或這一秒內分頁曾被隱藏，也略過。
      // 計時器能準時執行、卻一幀都沒畫，代表主執行緒是空閒的、是瀏覽器暫停了繪製（視窗被遮住等），不算卡頓
      // （若計時器本身也遲到超過 0.5 秒，代表主執行緒被卡住，那就是真的卡頓）
      const browserThrottled = framesThisSecond === 0 && elapsedSec < 1.5
      if (sampleIndex > 0 && !autoPausedRef.current && !wasHiddenInWindow && !browserThrottled) {
        setAbRecords((records) => {
          const existing = records[mode]
          const base =
            existing && existing.tps === tps && !existing.autoPaused
              ? existing
              : { tps, seconds: 0, fpsSum: 0, maxStallMs: 0, frames: 0, longFrames: 0, autoPaused: false }
          return {
            ...records,
            [mode]: {
              ...base,
              seconds: base.seconds + 1,
              // 用這一秒實際畫出的幀數計算，rAF 被卡住時不會沿用上一秒的舊值
              fpsSum: base.fpsSum + framesThisSecond / elapsedSec,
              maxStallMs: Math.max(base.maxStallMs, maxGapThisSecond),
              frames: base.frames + framesThisSecond,
              longFrames: base.longFrames + longFramesThisSecond
            }
          }
        })
      }

      sampleIndex++
      wasHiddenInWindow = document.hidden
      prev = cur
      ticksReceivedRef.current = 0
      maxLagInWindowRef.current = 0
      lastSample = now
    }, 1000)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isRunning, mode, tps, readFrameStats])

  useEffect(() => {
    if (!isRunning) {
      dataSource.disconnect()
      stopStream()
      return
    }

    pendingBaselineTicksRef.current = []
    if (mode === 'accelerated') {
      startStream(16)
    } else {
      stopStream()
    }
    dataSource.connect()

    autoPausedRef.current = false

    // ⚡ Accelerated：整批二進位 buffer 直接轉交給 StreamProcessor Worker，主執行緒不解碼
    const unsubBatch = mode === 'accelerated'
      ? dataSource.subscribe('tickBatch', ({ buffer, count }) => {
          ticksReceivedRef.current += count
          ingestBinary(buffer, count)
        })
      : () => {}

    const unsubTick = mode === 'baseline'
      ? dataSource.subscribe('tick', (tick) => {
        if (autoPausedRef.current) return
        ticksReceivedRef.current++

        // 主執行緒延遲：Tick 在 Worker 產生到主執行緒真正處理之間的時間差
        const lag = Date.now() - tick.timestamp
        if (lag > maxLagInWindowRef.current) {
          maxLagInWindowRef.current = lag
        }

        // 安全閥：延遲超過門檻代表主執行緒已追不上，自動暫停以免分頁完全卡死
        if (lag > BASELINE_LAG_LIMIT_MS) {
          autoPausedRef.current = true
          dataSource.disconnect()
          setIsRunning(false)
          setMeasuredTps(0)
          setMainThreadLagMs(lag)
          setAbRecords((records) => {
            const existing = records.baseline
            const base =
              existing && existing.tps === tpsRef.current && !existing.autoPaused
                ? existing
                : { tps: tpsRef.current, seconds: 0, fpsSum: 0, maxStallMs: 0, frames: 0, longFrames: 0, autoPaused: false }
            return { ...records, baseline: { ...base, autoPaused: true } }
          })
          setAutoPauseNotice(
            `未優化模式的主執行緒延遲已達 ${(lag / 1000).toFixed(1)} 秒，已自動暫停以避免分頁卡死。切到「優化版」用同樣 TPS 再跑一次對比看看。`
          )
          return
        }

        // 🐢 Baseline 未優化對照組：
        // 1. 每筆 Tick 都在主執行緒做 Array.push + shift (O(N)) 與深拷貝序列化，消耗主執行緒幀預算
        const q = naiveQueueRef.current
        q.push(tick)
        while (q.length < 4000) {
          q.push({ ...tick })
        }
        if (q.length > 4000) {
          q.shift()
        }
        const clonedSnapshot = JSON.parse(JSON.stringify(q.slice(-250))) as TradeTick[]
        const latestCloned = clonedSnapshot[clonedSnapshot.length - 1] ?? tick
        pendingBaselineTicksRef.current.push(latestCloned)

        // 2. 控制 React setState 最小間隔 (20ms)，防止高頻同步訊息觸發 React Maximum update depth 保護鎖
        //    只提交「上次 commit 之後」的新成交，避免重複或遺漏
        const now = performance.now()
        if (now - lastBaselineTickCommitRef.current >= 20) {
          lastBaselineTickCommitRef.current = now
          const batch = pendingBaselineTicksRef.current
          pendingBaselineTicksRef.current = []
          setCurrentTick(batch[batch.length - 1])
          setBaselineTicks(batch)
        }
      })
      : () => {}

    const unsubDepth = dataSource.subscribe('depth', (depth) => {
      if (mode === 'accelerated') {
        ingestDepth(depth)
      } else {
        // 盤口使用獨立的節流時間戳，不受成交 commit 影響
        const now = performance.now()
        if (now - lastBaselineDepthCommitRef.current >= 25) {
          lastBaselineDepthCommitRef.current = now
          setCurrentDepth(depth)
        }
      }
    })

    return () => {
      unsubBatch()
      unsubTick()
      unsubDepth()
      dataSource.disconnect()
      stopStream()
    }
  }, [isRunning, mode, dataSource, startStream, stopStream, ingestBinary, ingestDepth])

  const handleTpsChange = (newTps: number) => {
    setTps(newTps)
    dataSource.setTps(newTps)
  }

  const handleToggle = (running: boolean) => {
    setIsRunning(running)
    if (running) {
      setAutoPauseNotice(null)
      setMainThreadLagMs(0)
    }
    if (!running) {
      setMeasuredTps(0)
    }
  }


  const activeTicks = mode === 'accelerated' ? latestTicks : baselineTicks
  const activeLatestTick =
    mode === 'accelerated'
      ? (latestTicks[latestTicks.length - 1] ?? currentTick)
      : currentTick
  const activeDepth = mode === 'accelerated' ? (latestDepth ?? currentDepth) : currentDepth

  return (
    <main className='min-h-screen px-4 py-3 md:px-6 md:py-4'>
      <div className='mx-auto max-w-[1440px] space-y-3.5'>
        {/* 5-E 頂部導航列與膠囊控制器 */}
        <TerminalNavbar
          mode={mode}
          onModeChange={setMode}
        />

        {autoPauseNotice && (
          <div className='flex items-start justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300'>
            <span>⚠️ {autoPauseNotice}</span>
            <button
              type='button'
              onClick={() => setAutoPauseNotice(null)}
              className='shrink-0 font-semibold hover:underline cursor-pointer'
            >
              關閉
            </button>
          </div>
        )}

        {/* 主終端機三欄 Bento Grid（對齊 design-preview.jpg） */}
        <div className='grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px_310px] gap-3.5 items-stretch'>
          {/* 左欄：lightweight-charts Canvas 面積走勢圖 */}
          <PriceChart
            latestTicks={activeTicks}
            currentTick={activeLatestTick}
            className='h-full'
          />

          {/* 中欄：高資訊密度深度盤口階梯 */}
          <OrderBook
            depth={activeDepth}
            currentTick={activeLatestTick}
          />

          {/* 右欄：Performance HUD 四大 Sparkline + 成交流水虛擬列表 + TPS 調頻控制器 */}
          <div className='flex flex-col gap-3.5'>
            <PerformanceHUD
              measuredTps={measuredTps}
              bufferUsage={mode === 'accelerated' ? metrics.bufferUsage : null}
              mainThreadLagMs={mode === 'baseline' ? mainThreadLagMs : null}
              targetTps={tps}
              isRunning={isRunning}
              renderCountRef={renderBadgeRef}
            />

            <RecentTrades
              latestTicks={activeTicks}
              mode={mode}
              className='flex-1'
            />

            <TpsController
              currentTps={tps}
              isRunning={isRunning}
              onTpsChange={handleTpsChange}
              onToggle={handleToggle}
            />
          </div>
        </div>

        {/* 資料流向（背壓策略）與 A/B 對比紀錄 */}
        <div className='grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_310px] gap-3.5 items-stretch'>
          <DataFlowPanel
            mode={mode}
            strategy={strategy}
            onStrategyChange={setStrategy}
            stats={flowStats}
            mainThreadLagMs={mainThreadLagMs}
            isRunning={isRunning}
          />
          <AbComparisonCard
            records={abRecords}
            onClear={() => setAbRecords({})}
          />
        </div>
      </div>
    </main>
  )
}
