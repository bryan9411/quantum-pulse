'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MockDataSource } from '@/lib/mock-data-source'
import type { TradeTick, OrderBookDepth } from '@/lib/type'
import { TpsController } from '@/components/tps-controller'
import { runBenchmark, type BenchmarkResult } from '@/lib/benchmark-runner'

export default function NaivePage() {
  const [currentTick, setCurrentTick] = useState<TradeTick | null>(null)
  const [currentDepth, setCurrentDepth] = useState<OrderBookDepth | null>(null)
  const [tps, setTps] = useState(100)
  const [isRunning, setIsRunning] = useState(false)
  const [benchmarking, setBenchmarking] = useState(false)
  const [benchResults, setBenchResults] = useState<BenchmarkResult[]>([])

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
      return
    }

    dataSource.connect()

    const unsubTick = dataSource.subscribe('tick', (tick) => {
      setCurrentTick(tick)
    })

    const unsubDepth = dataSource.subscribe('depth', (depth) => {
      setCurrentDepth(depth)
    })

    return () => {
      unsubTick()
      unsubDepth()
      dataSource.disconnect()
    }
  }, [isRunning, dataSource])

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
            <div className='font-mono text-2xl font-bold text-amber-600 dark:text-amber-400'>
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

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          <div className='rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950'>
            <div className='text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2'>
              Latest Trade Tick
            </div>
            {currentTick ? (
              <div className='space-y-3 font-mono'>
                <div className='flex items-baseline gap-3'>
                  <span className={`text-3xl font-extrabold ${currentTick.side === 'buy' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    ${currentTick.price.toFixed(2)}
                  </span>
                  <span className='text-xs uppercase px-2 py-0.5 rounded font-semibold bg-zinc-100 dark:bg-zinc-800'>
                    {currentTick.side}
                  </span>
                </div>
                <div className='text-xs text-zinc-500 space-y-1'>
                  <div>數量 (Size): {currentTick.size} BTC</div>
                  <div>ID: {currentTick.id}</div>
                  <div>時間戳: {currentTick.timestamp}</div>
                </div>
              </div>
            ) : (
              <div className='py-8 text-center text-sm text-zinc-400'>尚未開始接收資料</div>
            )}
          </div>

          <div className='rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-950'>
            <div className='text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2'>
              Order Book (10 Levels)
            </div>
            {currentDepth ? (
              <div className='font-mono text-xs space-y-2'>
                <div className='text-rose-500 space-y-1'>
                  <div className='text-[10px] text-zinc-400 font-sans'>賣盤 (Asks 最低 3 檔)</div>
                  {currentDepth.asks.slice(0, 3).map(([price, size], i) => (
                    <div key={i} className='flex justify-between'>
                      <span>${price.toFixed(2)}</span>
                      <span className='text-zinc-500'>{size.toFixed(4)} BTC</span>
                    </div>
                  ))}
                </div>
                <div className='border-t border-dashed border-zinc-200 my-2 dark:border-zinc-800' />
                <div className='text-emerald-500 space-y-1'>
                  <div className='text-[10px] text-zinc-400 font-sans'>買盤 (Bids 最高 3 檔)</div>
                  {currentDepth.bids.slice(0, 3).map(([price, size], i) => (
                    <div key={i} className='flex justify-between'>
                      <span>${price.toFixed(2)}</span>
                      <span className='text-zinc-500'>{size.toFixed(4)} BTC</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className='py-8 text-center text-sm text-zinc-400'>尚未生成盤口</div>
            )}
          </div>
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
