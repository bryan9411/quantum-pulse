'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MockDataSource } from '@/lib/mock-data-source'
import type { TradeTick, OrderBookDepth } from '@/lib/type'
import type { BackpressureStrategy } from '@/lib/coalescing-strategies'
import { TpsController } from '@/components/tps-controller'
import { PriceChart } from '@/components/price-chart'
import { OrderBook } from '@/components/order-book'
import { RecentTrades } from '@/components/recent-trades'
import { PerformanceHUD } from '@/components/performance-hud'
import { TerminalNavbar, type PipelineMode } from '@/components/terminal-navbar'
import { runBenchmark, type BenchmarkResult } from '@/lib/benchmark-runner'
import { runQueueBenchmark, type QueueBenchmarkResult } from '@/lib/queue-benchmark'
import { useWorkerStream } from '@/hooks/useWorkerStream'

const STRATEGY_OPTIONS: {
  id: BackpressureStrategy
  label: string
  desc: string
}[] = [
  {
    id: 'queue',
    label: '🐢 Queue (排隊死扛)',
    desc: '每幀只抽 60 筆，零丟失但水塔積水、畫面嚴重滯後'
  },
  {
    id: 'drop',
    label: '✂️ Drop (斷尾丟棄)',
    desc: '一次抽乾水塔只留最新 60 筆，零延遲但中間成交量蒸發'
  },
  {
    id: 'coalesce',
    label: '🧬 Coalesce (智慧合併)',
    desc: '一次抽乾並分桶濃縮為 60 筆，零延遲且完整保留總成交量'
  }
]

export default function TerminalPage() {
  const [mode, setMode] = useState<PipelineMode>('accelerated')
  const [showLab, setShowLab] = useState(false)
  const [currentTick, setCurrentTick] = useState<TradeTick | null>(null)
  const [currentDepth, setCurrentDepth] = useState<OrderBookDepth | null>(null)
  const [baselineTicks, setBaselineTicks] = useState<TradeTick[]>([])
  const [tps, setTps] = useState(1000)
  const [isRunning, setIsRunning] = useState(false)
  const [benchmarking, setBenchmarking] = useState(false)
  const [benchResults, setBenchResults] = useState<BenchmarkResult[]>([])

  const [queueBenchmarking, setQueueBenchmarking] = useState(false)
  const [queueBenchResult, setQueueBenchResult] = useState<QueueBenchmarkResult | null>(null)

  const {
    strategy,
    latestTicks,
    latestDepth,
    metrics,
    start: startStream,
    stop: stopStream,
    reset: resetStream,
    setStrategy,
    ingestTick,
    ingestDepth,
    burstInject
  } = useWorkerStream()

  const renderCountRef = useRef(0)
  renderCountRef.current++

  const dataSourceRef = useRef<MockDataSource | null>(null)

  if (!dataSourceRef.current) {
    dataSourceRef.current = new MockDataSource()
  }

  const dataSource = dataSourceRef.current

  useEffect(() => {
    if (!isRunning) {
      dataSource.disconnect()
      stopStream()
      return
    }

    dataSource.setTps(tps)
    startStream(16)
    dataSource.connect()

    const unsubTick = dataSource.subscribe('tick', (tick) => {
      if (mode === 'accelerated') {
        ingestTick(tick)
      } else {
        // Baseline 基準對照模式：主執行緒每筆直接 setState 觸發同步重繪
        setCurrentTick(tick)
        setBaselineTicks([tick])
      }
    })

    const unsubDepth = dataSource.subscribe('depth', (depth) => {
      if (mode === 'accelerated') {
        ingestDepth(depth)
      } else {
        setCurrentDepth(depth)
      }
    })

    return () => {
      unsubTick()
      unsubDepth()
      dataSource.disconnect()
      stopStream()
    }
  }, [isRunning, mode, tps, dataSource, startStream, stopStream, ingestTick, ingestDepth])

  const handleTpsChange = (newTps: number) => {
    setTps(newTps)
    dataSource.setTps(newTps)
  }

  const handleToggle = (running: boolean) => {
    setIsRunning(running)
  }

  const handleRunBenchmark = async () => {
    setBenchmarking(true)
    setBenchResults([])

    try {
      const worker = new Worker(
        new URL('../workers/benchmark.worker.ts', import.meta.url),
        { type: 'module' }
      )

      const cloneRes = await runBenchmark(worker, 32, 'clone')
      const transferRes = await runBenchmark(worker, 32, 'transfer')

      setBenchResults([cloneRes, transferRes])
      worker.terminate()
    } catch (err) {
      console.error('Benchmark Error:', err)
    } finally {
      setBenchmarking(false)
    }
  }

  const handleRunQueueBenchmark = () => {
    setQueueBenchmarking(true)
    setTimeout(() => {
      const res = runQueueBenchmark(100000)
      setQueueBenchResult(res)
      setQueueBenchmarking(false)
    }, 50)
  }

  const activeTicks = mode === 'accelerated' ? latestTicks : baselineTicks
  const activeLatestTick =
    mode === 'accelerated'
      ? (latestTicks[latestTicks.length - 1] ?? currentTick)
      : currentTick
  const activeDepth = mode === 'accelerated' ? (latestDepth ?? currentDepth) : currentDepth
  const batchTotalVolume = activeTicks.reduce((sum, tick) => sum + tick.size, 0)

  return (
    <main className='min-h-screen px-4 py-3 md:px-6 md:py-4'>
      <div className='mx-auto max-w-[1440px] space-y-3.5'>
        {/* 5-E 頂部導航列與膠囊控制器 */}
        <TerminalNavbar
          mode={mode}
          onModeChange={setMode}
          strategy={strategy}
          onStrategyChange={setStrategy}
          showLab={showLab}
          onToggleLab={() => setShowLab((prev) => !prev)}
        />

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
              currentTps={tps}
              bufferUsage={metrics.bufferUsage}
              isRunning={isRunning}
              renderCount={renderCountRef.current}
            />

            <RecentTrades
              latestTicks={activeTicks}
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

        {/* 可展開之階段 3 & 4 底層效能碰撞實驗室（點擊右上角 Benchmarks 膠囊展開） */}
        {showLab && (
          <div className='space-y-4 pt-2'>
            <div className='rounded-2xl border border-blue-200 bg-blue-50/50 p-5 dark:border-blue-900/50 dark:bg-blue-950/20'>
              <div className='flex items-center justify-between mb-3'>
                <div>
                  <h2 className='text-sm font-bold text-blue-900 dark:text-blue-300'>
                    ⚡ 3-A 32MB 巨量記憶體傳輸壓力碰撞
                  </h2>
                  <p className='text-xs text-blue-700/80 dark:text-blue-400/80 mt-0.5'>
                    檢測深拷貝造成的往返延遲與發送端記憶體脫鉤（Detached）狀態
                  </p>
                </div>
                <button
                  onClick={handleRunBenchmark}
                  disabled={benchmarking}
                  className='px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 cursor-pointer shadow-xs'
                >
                  {benchmarking ? '測試進行中...' : '開始 32MB 碰撞測試'}
                </button>
              </div>

              {benchResults.length > 0 && (
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-3'>
                  {benchResults.map((res, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border font-mono text-xs space-y-1.5 ${
                        res.mode.includes('深拷貝')
                          ? 'border-rose-300 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20 text-rose-950 dark:text-rose-200'
                          : 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200'
                      }`}
                    >
                      <div className='font-bold text-sm'>{res.mode}</div>
                      <div>資料量: {res.sizeMB} MB</div>
                      <div className='text-base font-extrabold'>
                        往返耗時 (RTT): {res.roundTripMs} ms
                      </div>
                      <div className='text-[11px] opacity-80'>
                        發送端 Buffer 被脫鉤 (byteLength=0):{' '}
                        <span className='font-bold underline'>
                          {res.senderBufferNeutered ? '是 (所有權已轉移)' : '否 (留在原記憶體)'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className='rounded-2xl border border-amber-200 bg-amber-50/50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20'>
              <div className='flex items-center justify-between mb-3'>
                <div>
                  <h2 className='text-sm font-bold text-amber-900 dark:text-amber-300'>
                    💥 4-A Array.push vs push + shift (100,000 次操作)
                  </h2>
                  <p className='text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5'>
                    親眼觀察 V8 引擎連續記憶體 FixedArray 在 shift 時強制搬遷（O(n) memmove）的恐怖代價
                  </p>
                </div>
                <button
                  onClick={handleRunQueueBenchmark}
                  disabled={queueBenchmarking}
                  className='px-4 py-2 text-xs font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition disabled:opacity-50 cursor-pointer shadow-xs'
                >
                  {queueBenchmarking ? '計算中...' : '開始 10 萬次佇列碰撞'}
                </button>
              </div>

              {queueBenchResult && (
                <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 font-mono text-xs'>
                  <div className='p-3 rounded-lg border border-emerald-300 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20'>
                    <div className='font-bold'>純 push</div>
                    <div className='mt-1 text-base font-extrabold'>{queueBenchResult.pushOnlyTimeMs} ms</div>
                  </div>
                  <div className='p-3 rounded-lg border border-rose-300 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20'>
                    <div className='font-bold'>push + shift</div>
                    <div className='mt-1 text-base font-extrabold'>{queueBenchResult.pushAndShiftTimeMs} ms</div>
                  </div>
                  <div className='p-3 rounded-lg border border-purple-300 bg-purple-50/60 dark:border-purple-900/50 dark:bg-purple-950/20'>
                    <div className='font-bold'>效能崩潰倍率</div>
                    <div className='mt-1 text-xl font-black text-rose-600 dark:text-rose-400'>
                      慢了 {queueBenchResult.slowdownFactor} 倍！
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className='rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/20'>
              <div className='flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4'>
                <div>
                  <h2 className='text-sm font-bold text-indigo-950 dark:text-indigo-200'>
                    🌊 4-D / 4-E 環形緩衝水位監控 & 前端背壓三刀流實驗室
                  </h2>
                  <p className='text-xs text-indigo-700/80 dark:text-indigo-400/80 mt-0.5'>
                    本批渲染筆數: {activeTicks.length} 筆 | 總成交量: {batchTotalVolume.toFixed(2)} BTC
                  </p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                  <button
                    type='button'
                    onClick={() => burstInject(2500, activeLatestTick?.price)}
                    className='px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition cursor-pointer'
                  >
                    + 灌入 2,500 筆 (黃燈)
                  </button>
                  <button
                    type='button'
                    onClick={() => burstInject(3600, activeLatestTick?.price)}
                    className='px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition cursor-pointer'
                  >
                    + 灌入 3,600 筆 (紅燈)
                  </button>
                  <button
                    type='button'
                    onClick={resetStream}
                    className='px-3 py-1.5 text-xs font-semibold rounded-lg border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 transition cursor-pointer'
                  >
                    清空水塔
                  </button>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-2.5'>
                {STRATEGY_OPTIONS.map((opt) => {
                  const active = strategy === opt.id
                  return (
                    <button
                      key={opt.id}
                      type='button'
                      onClick={() => setStrategy(opt.id)}
                      className={`text-left p-3 rounded-lg border transition cursor-pointer ${
                        active
                          ? 'border-indigo-600 bg-indigo-600/10 dark:border-indigo-400 dark:bg-indigo-500/20'
                          : 'border-zinc-200 bg-white/80 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60'
                      }`}
                    >
                      <div className='font-mono text-xs font-bold text-indigo-950 dark:text-indigo-200'>
                        {opt.label}
                      </div>
                      <p className='text-[11px] text-zinc-500 dark:text-zinc-400 mt-1'>
                        {opt.desc}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
