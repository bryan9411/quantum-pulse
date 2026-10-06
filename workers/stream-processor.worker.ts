import type { TradeTick, OrderBookDepth } from '@/lib/type'

const ctx: Worker = self as unknown as Worker

/**
 * 主執行緒對 Worker 下達的指令
 */
export type StreamCommand =
  | { type: 'START', payload?: { batchIntervalMs?: number } }
  | { type: 'STOP' }
  | { type: 'INGEST_TICK', payload: TradeTick }
  | { type: 'INGEST_DEPTH', payload: OrderBookDepth }
  | { type: 'RESET' }

/**
 * Worker對主執行緒的事件回覆
 */
export type StreamEvent =
  | { type: 'BATCH_TICKS', ticks: TradeTick[], count: number }
  | { type: 'LATEST_DEPTH', depth: OrderBookDepth }
  | { type: 'METRICS', metrics: { tps: number, queueSize: number, lastLatencyMs: number } }
  | { type: 'STATUS', status: 'idle' | 'running' | 'stopped' }

let status: 'idle' | 'running' | 'stopped' = 'idle'
let batchIntervalMs = 16 // 動態調整 預設16ms 打包一次
let flushTimer: ReturnType<typeof setInterval> | null = null

// 暫存資料槽，在短時間內接收的連續資料暫存在這裡
let tickBuffer: TradeTick[] = []
let latestDepth: OrderBookDepth | null = null

// 監測統計變數
let processedTicksInWindow = 0
let lastMetricsSampleTime = performance.now()
let currentTps = 0

/**
 * 將積累的 Ticks 與監測數據打包送回主執行緒
 */
const flushBatch = () => {
	if (status !== 'running') return 
	
	const now = performance.now()
	const elapsed = now - lastMetricsSampleTime

	if (tickBuffer.length) {
		const ticksToSend = tickBuffer
		tickBuffer = []

		ctx.postMessage({
			type: 'BATCH_TICKS',
			ticks: ticksToSend,
			count: ticksToSend.length
		} as StreamEvent)
	}

	// 計算即時 TPS (每 1000ms 計算一次)
	if (elapsed >= 1000) {
		currentTps = Math.round((processedTicksInWindow * 1000) / elapsed)
		processedTicksInWindow = 0
    lastMetricsSampleTime = now

		ctx.postMessage({
			type: 'METRICS',
			metrics: {
				tps: currentTps,
				queueSize: tickBuffer.length,
				lastLatencyMs: Number((performance.now() - now).toFixed(2))
			}
		} as StreamEvent)
	}
}

/**
 * 啟動排程
 */
const start = (intervalMs?: number) => {
  if (status === 'running') return
	
  if (intervalMs && intervalMs > 0) {
    batchIntervalMs = intervalMs
  }
  
	status = 'running'
  lastMetricsSampleTime = performance.now()
  processedTicksInWindow = 0
  
	if (flushTimer) {
		clearInterval(flushTimer)
	}

	flushTimer = setInterval(flushBatch, batchIntervalMs)

	ctx.postMessage({ type: 'STATUS', status: 'running' } as StreamEvent)
}

/**
 * 停止排程並釋放資源
 */
const stop = () => {
  status = 'stopped'
  
	if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
  
	tickBuffer = []
  latestDepth = null
  
	ctx.postMessage({ type: 'STATUS', status: 'stopped' } as StreamEvent)
}

/**
 * 接收主執行緒指令
 */
ctx.onmessage = (event: MessageEvent<StreamCommand>) => {
  const command = event.data
  switch (command.type) {
    case 'START':
      start(command.payload?.batchIntervalMs)
      break
    case 'STOP':
      stop()
      break
    case 'INGEST_TICK':
      if (status === 'running') {
        tickBuffer.push(command.payload)
        processedTicksInWindow++
      }
      break
    case 'INGEST_DEPTH':
      if (status === 'running') {
        latestDepth = command.payload
        
				ctx.postMessage({
          type: 'LATEST_DEPTH',
          depth: latestDepth
        } as StreamEvent)
      }
      break
    case 'RESET':
      tickBuffer = []
      latestDepth = null
      processedTicksInWindow = 0
      break
  }
}
