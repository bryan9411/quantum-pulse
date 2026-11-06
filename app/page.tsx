'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MockDataSource } from '@/lib/mock-data-source'
import type { TradeTick, OrderBookDepth } from '@/lib/type'
import type { BackpressureStrategy } from '@/lib/coalescing-strategies'
import { TpsController } from '@/components/tps-controller'
import { PriceChart } from '@/components/price-chart'
import { OrderBook } from '@/components/order-book'
import { RecentTrades } from '@/components/recent-trades'
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

export default function NaivePage() {
  const [currentTick, setCurrentTick] = useState<TradeTick | null>(null)
  const [currentDepth, setCurrentDepth] = useState<OrderBookDepth | null>(null)
  const [tps, setTps] = useState(100)
  const [isRunning, setIsRunning] = useState(false)
  const [benchmarking, setBenchmarking] = useState(false)
  const [benchResults, setBenchResults] = useState<BenchmarkResult[]>([])

  const [queueBenchmarking, setQueueBenchmarking] = useState(false)
  const [queueBenchResult, setQueueBenchResult] = useState<QueueBenchmarkResult | null>(null)

  const {
    status: streamStatus,
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

    startStream(16)
    dataSource.connect()

    const unsubTick = dataSource.subscribe('tick', (tick) => {
      ingestTick(tick)
      setCurrentTick(tick)
    })

    const unsubDepth = dataSource.subscribe('depth', (depth) => {
      ingestDepth(depth)
      setCurrentDepth(depth)
    })

    return () => {
      unsubTick()
      unsubDepth()
      dataSource.disconnect()
      stopStream()
    }
  }, [isRunning, dataSource, startStream, stopStream, ingestTick, ingestDepth])

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

  const batchTotalVolume = latestTicks.reduce((sum, tick) => sum + tick.size, 0)

  return (
    <div className='min-h-screen bg-zinc-50 p-8 font-sans text-zinc-900 dark:bg-black dark:text-zinc-100'>
      <div className='mx-auto max-w-4xl space-y-6'>

        <div className='flex items-center justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              記憶體傳輸效能碰撞實驗室
            </h1>
            <p className='text-xs text-rose-500 font-medium mt-1'>
              32MB 負載下：Structured Clone vs Transferable Objects 實測
            </p>
          </div>
          <div className='text-right'>
            <div className='font-mono text-xs text-zinc-500'>總渲染次數</div>
            <div suppressHydrationWarning className='font-mono text-2xl font-bold text-amber-600 dark:text-amber-400'>
              {renderCountRef.current.toLocaleString()}
            </div>
          </div>
        </div>

        <div className='rounded-xl border border-blue-200 bg-blue-50/50 p-6 dark:border-blue-900/50 dark:bg-blue-950/20'>
          <div className='flex items-center justify-between mb-4'>
            <div>
              <h2 className='text-sm font-bold text-blue-900 dark:text-blue-300'>
                ⚡ 32MB 巨量記憶體傳輸壓力碰撞
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
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4 mt-4'>
              {benchResults.map((res, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border font-mono text-xs space-y-2 ${res.mode.includes('深拷貝')
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

        {/* 4-A 佇列記憶體位移碰撞測試卡片 */}
        <div className='rounded-xl border border-amber-200 bg-amber-50/50 p-6 dark:border-amber-900/50 dark:bg-amber-950/20'>
          <div className='flex items-center justify-between mb-4'>
            <div>
              <h2 className='text-sm font-bold text-amber-900 dark:text-amber-300'>
                💥 4-A 第零層碰撞：Array.push vs push + shift (100,000 次操作)
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
              {queueBenchmarking ? '計算中（主執行緒卡頓中）...' : '開始 10 萬次佇列碰撞'}
            </button>
          </div>

          {queueBenchResult && (
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 font-mono text-xs'>
              <div className='p-4 rounded-lg border border-emerald-300 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20 text-emerald-950 dark:text-emerald-200'>
                <div className='font-bold text-sm'>純 push</div>
                <div className='mt-2 text-base font-extrabold'>
                  {queueBenchResult.pushOnlyTimeMs} ms
                </div>
                <div className='text-[11px] opacity-75'>時間複雜度 O(1)，記憶體直接追加</div>
              </div>

              <div className='p-4 rounded-lg border border-rose-300 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20 text-rose-950 dark:text-rose-200'>
                <div className='font-bold text-sm'>push + shift</div>
                <div className='mt-2 text-base font-extrabold'>
                  {queueBenchResult.pushAndShiftTimeMs} ms
                </div>
                <div className='text-[11px] opacity-75'>時間複雜度 O(n)，20,000 個元素集體位移</div>
              </div>

              <div className='p-4 rounded-lg border border-purple-300 bg-purple-50/60 dark:border-purple-900/50 dark:bg-purple-950/20 text-purple-950 dark:text-purple-200 flex flex-col justify-center'>
                <div className='font-bold text-sm'>效能崩潰倍率</div>
                <div className='mt-1 text-2xl font-black text-rose-600 dark:text-rose-400'>
                  慢了 {queueBenchResult.slowdownFactor} 倍！
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4-D & 4-E 環形緩衝區水位監控與背壓三刀流實驗室 */}
        <div className='rounded-xl border border-indigo-200 bg-indigo-50/40 p-6 dark:border-indigo-900/50 dark:bg-indigo-950/20'>
          <div className='flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4'>
            <div>
              <div className='flex items-center gap-2'>
                <h2 className='text-sm font-bold text-indigo-950 dark:text-indigo-200'>
                  🌊 4-D / 4-E 環形緩衝水位監控 & 前端背壓三刀流實驗室
                </h2>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase rounded-full ${metrics.watermarkStatus === 'critical'
                    ? 'bg-rose-500 text-white animate-pulse'
                    : metrics.watermarkStatus === 'warning'
                      ? 'bg-amber-500 text-white'
                      : 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    }`}
                >
                  {metrics.watermarkStatus}
                </span>
              </div>
              <p className='text-xs text-indigo-700/80 dark:text-indigo-400/80 mt-0.5'>
                切換下方三種背壓策略後點擊「灌入 3,600 筆」，親眼比較水塔排空速度與成交量保留差異
              </p>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              <button
                type='button'
                onClick={() => burstInject(2500, currentTick?.price)}
                className='px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition cursor-pointer shadow-xs'
              >
                + 灌入 2,500 筆 (黃燈 61%)
              </button>
              <button
                type='button'
                onClick={() => burstInject(3600, currentTick?.price)}
                className='px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition cursor-pointer shadow-xs'
              >
                + 灌入 3,600 筆 (紅燈/爆倉)
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

          {/* 4-E 背壓策略三選一膠囊切換器 */}
          <div className='grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-5'>
            {STRATEGY_OPTIONS.map((opt) => {
              const active = strategy === opt.id
              return (
                <button
                  key={opt.id}
                  type='button'
                  onClick={() => setStrategy(opt.id)}
                  className={`text-left p-3 rounded-lg border transition cursor-pointer ${active
                    ? 'border-indigo-600 bg-indigo-600/10 dark:border-indigo-400 dark:bg-indigo-500/20 shadow-xs'
                    : 'border-zinc-200 bg-white/80 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60'
                    }`}
                >
                  <div className='flex items-center justify-between'>
                    <span className='font-mono text-xs font-bold text-indigo-950 dark:text-indigo-200'>
                      {opt.label}
                    </span>
                    {active && (
                      <span className='text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white'>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <p className='text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-snug'>
                    {opt.desc}
                  </p>
                </button>
              )
            })}
          </div>

          <div className='space-y-1.5 mb-4'>
            <div className='flex justify-between text-xs font-mono'>
              <span className='text-zinc-500 dark:text-zinc-400'>
                Buffer Usage (水位佔用率)
              </span>
              <span className='font-bold text-indigo-950 dark:text-indigo-200'>
                {metrics.bufferUsage.toFixed(1)}% ({metrics.queueSize.toLocaleString()} / {metrics.bufferCapacity.toLocaleString()} Ticks)
              </span>
            </div>

            <div className='relative h-4 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800'>
              <div
                className='absolute top-0 bottom-0 left-[50%] w-0.5 bg-amber-500/70 z-10'
                title='50% Warning Watermark'
              />
              <div
                className='absolute top-0 bottom-0 left-[80%] w-0.5 bg-rose-500/80 z-10'
                title='80% Critical Watermark'
              />
              <div
                className={`h-full transition-all duration-150 ${metrics.watermarkStatus === 'critical'
                  ? 'bg-rose-500'
                  : metrics.watermarkStatus === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                  }`}
                style={{ width: `${Math.min(100, Math.max(0, metrics.bufferUsage))}%` }}
              />
            </div>

            <div className='flex justify-between text-[10px] font-mono text-zinc-400'>
              <span>0% (Empty)</span>
              <span className='text-amber-600 dark:text-amber-400'>50% (Warning)</span>
              <span className='text-rose-600 dark:text-rose-400'>80% (Critical)</span>
              <span>100% (4,096 Max)</span>
            </div>
          </div>

          <div className='grid grid-cols-2 md:grid-cols-5 gap-3 font-mono text-xs'>
            <div className='p-3 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'>
              <div className='text-[11px] text-zinc-400'>rAF 畫面幀率 (FPS)</div>
              <div className='mt-1 text-lg font-extrabold text-emerald-600 dark:text-emerald-400'>
                {metrics.fps} FPS
              </div>
              <div className='text-[10px] text-zinc-400'>單幀上限 60 筆</div>
            </div>

            <div className='p-3 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'>
              <div className='text-[11px] text-zinc-400'>緩衝區佔用率</div>
              <div className='mt-1 text-lg font-extrabold text-amber-600 dark:text-amber-400'>
                {metrics.bufferUsage.toFixed(1)}%
              </div>
              <div className='text-[10px] text-zinc-400'>待處理: {metrics.queueSize} 筆</div>
            </div>

            <div className='p-3 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'>
              <div className='text-[11px] text-zinc-400'>滿載溢流 (Ring Dropped)</div>
              <div className={`mt-1 text-lg font-extrabold ${metrics.droppedTicks > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {metrics.droppedTicks.toLocaleString()} 筆
              </div>
              <div className='text-[10px] text-zinc-400'>超過 4,096 格覆寫</div>
            </div>

            <div className='p-3 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'>
              <div className='text-[11px] text-zinc-400'>背壓濃縮/丟棄數</div>
              <div className='mt-1 text-lg font-extrabold text-purple-600 dark:text-purple-400'>
                {metrics.coalescedTicks.toLocaleString()} 筆
              </div>
              <div className='text-[10px] text-zinc-400'>策略: {strategy.toUpperCase()}</div>
            </div>

            <div className='p-3 rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950'>
              <div className='text-[11px] text-zinc-400'>本批渲染筆數 / 總量</div>
              <div className='mt-1 text-lg font-extrabold text-indigo-600 dark:text-indigo-400'>
                {latestTicks.length} 筆
              </div>
              <div className='text-[10px] text-zinc-500'>
                量: {batchTotalVolume.toFixed(1)} BTC
              </div>
            </div>
          </div>
        </div>

        {/* 5-B lightweight-charts Canvas 即時走勢圖 */}
        <PriceChart
          latestTicks={latestTicks}
          currentTick={currentTick}
        />

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* 5-D 成交流水虛擬化滾動列表 */}
          <RecentTrades
            latestTicks={latestTicks}
          />

          {/* 5-C 高資訊密度深度盤口階梯元件 */}
          <OrderBook
            depth={latestDepth ?? currentDepth}
            currentTick={currentTick}
          />
        </div>

        <div className='max-w-md mx-auto'>
          <TpsController
            currentTps={tps}
            isRunning={isRunning}
            onTpsChange={handleTpsChange}
            onToggle={handleToggle}
          />
        </div>

      </div>
    </div>
  )
}
