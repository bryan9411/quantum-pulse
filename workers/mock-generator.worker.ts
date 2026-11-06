import type { TradeTick, OrderSide, OrderBookDepth, OrderBookLevel } from '../lib/type'
import { encodeTicksToBuffer } from '../lib/binary-protocol'

/**
 * 發送給 Worker 的指令型別
 */
export type WorkerInboundCommand =
  | { type: 'START'; payload?: { initialPrice?: number; tps: number } }
  | { type: 'STOP' }
  | { type: 'SET_TPS'; payload: { tps: number } }

/**
 * Worker 回傳事件型別
 */
export type WorkerOutboundEvent =
  | { type: 'tickBatch'; buffer: ArrayBuffer; count: number }
  | { type: 'depth'; data: OrderBookDepth }
  | { type: 'status'; status: 'running' | 'stopped' }

let isRunning = false
let currentPrice = 67432.18
let targetTps = 1000
let tickSequenceId = 0
let depthSequenceId = 0
let timerId: ReturnType<typeof setInterval> | null = null

// 盤口微結構常數
const DEPTH_LEVELS = 10
const TICK_SIZE = 0.5
const BASE_SPREAD = 0.5

/**
 * 將均勻分布隨機數轉為標準常態分布隨機數 (Box-Muller)
 */
const generateGaussianNoise = (): number => {
  let u1 = 0
  let u2 = 0
  while (u1 === 0) u1 = Math.random()
  while (u2 === 0) u2 = Math.random()
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
}

/**
 * 幾何布朗運動（GBM）下一價格推算：
 * 公式：S(t + dt) = S(t) * exp((drift - 0.5 * vol^2) * dt + vol * sqrt(dt) * Z)
 * dt 以「秒」為單位並等於 1 / TPS，因此每秒的價格波動幅度與 TPS 無關。
 * volatility = 0.001 / sqrt(秒) ≈ 每分鐘約 0.77% 標準差（約 ±500 USDT）。
 */
const calculateNextGbmPrice = (
  price: number,
  dt: number,
  drift = 0,
  volatility = 0.001
): number => {
  const z = generateGaussianNoise()
  const driftTerm = (drift - 0.5 * Math.pow(volatility, 2)) * dt
  const shockTerm = volatility * Math.sqrt(dt) * z
  const nextPrice = price * Math.exp(driftTerm + shockTerm)

  return Number(nextPrice.toFixed(2))
}

/**
 * 計算指定檔位的掛單數量
 */
const calculateLevelSize = (levelIndex: number): number => {
  const baseVolume = 0.1 + levelIndex * 0.15
  const noise = Math.random() * 0.75 + 0.05
  return Number((baseVolume + noise).toFixed(4))
}

/**
 * 生成 10 檔深度盤口
 */
const produceOrderBookDepth = (midPrice: number): OrderBookDepth => {
  depthSequenceId++

  const halfSpread = BASE_SPREAD / 2
  const bestBid = Number((midPrice - halfSpread).toFixed(2))
  const bestAsk = Number((midPrice + halfSpread).toFixed(2))
  const bids: OrderBookLevel[] = []
  const asks: OrderBookLevel[] = []

  for (let i = 0; i < DEPTH_LEVELS; i++) {
    const bidPrice = Number((bestBid - i * TICK_SIZE).toFixed(2))
    bids.push([bidPrice, calculateLevelSize(i)])

    const askPrice = Number((bestAsk + i * TICK_SIZE).toFixed(2))
    asks.push([askPrice, calculateLevelSize(i)])
  }

  return {
    bids,
    asks,
    timestamp: Date.now(),
    sequenceId: depthSequenceId
  }
}

/**
 * 單筆 Tick
 */
const produceSingleTick = (): TradeTick => {
  tickSequenceId++
  currentPrice = calculateNextGbmPrice(currentPrice, 1 / Math.max(1, targetTps))

  const side: OrderSide = Math.random() > 0.48 ? 'buy' : 'sell'
  const size = Number((Math.random() * 1.49 + 0.01).toFixed(4))

  return {
    id: `tick_${tickSequenceId}_${Date.now()}`,
    price: currentPrice,
    size,
    side,
    timestamp: Date.now()
  }
}

const TICK_LOOP_INTERVAL_MS = 10
// 分頁背景節流後恢復時，最多補發 250ms 的量，避免一次灌爆下游
const MAX_CATCH_UP_SECONDS = 0.25

/**
 * 突破瀏覽器 setInterval 4ms (250Hz) 限制並精準對齊 TPS：
 * 固定以 10ms 觸發，依「實際經過時間 × targetTps」累積應發筆數（含小數進位），
 * 因此任何 TPS（例如 149、1234）都能得到正確吞吐量，也不受 setInterval 漂移影響。
 */
const restartInterval = () => {
  if (timerId !== null) {
    clearInterval(timerId)
    timerId = null
  }

  if (!isRunning) return

  let owedTicks = 0
  let lastLoopTime = performance.now()

  timerId = setInterval(() => {
    const now = performance.now()
    const elapsedSec = (now - lastLoopTime) / 1000
    lastLoopTime = now

    owedTicks = Math.min(
      owedTicks + elapsedSec * targetTps,
      Math.max(1, targetTps * MAX_CATCH_UP_SECONDS)
    )

    const ticksThisLoop = Math.floor(owedTicks)
    if (ticksThisLoop === 0) return
    owedTicks -= ticksThisLoop

    // 每輪只發一則訊息：整批 Tick 編碼為 Float64Array 並以 Transferable 零拷貝移交，
    // 50,000 TPS 時也只有 100 msg/s，不會把主執行緒的訊息佇列塞爆
    const batch: TradeTick[] = new Array(ticksThisLoop)
    for (let i = 0; i < ticksThisLoop; i++) {
      batch[i] = produceSingleTick()
    }
    const { buffer } = encodeTicksToBuffer(batch)
    ;(self as unknown as Worker).postMessage(
      { type: 'tickBatch', buffer, count: ticksThisLoop } as WorkerOutboundEvent,
      [buffer]
    )

    const depth = produceOrderBookDepth(currentPrice)
    self.postMessage({
      type: 'depth',
      data: depth
    } as WorkerOutboundEvent)
  }, TICK_LOOP_INTERVAL_MS)
}

self.onmessage = (event: MessageEvent<WorkerInboundCommand>) => {
  const message = event.data

  switch (message.type) {
    case 'START':
      isRunning = true

      if (message.payload?.initialPrice) {
        currentPrice = message.payload.initialPrice
      }

      if (message.payload?.tps) {
        targetTps = message.payload.tps
      }

      restartInterval()
      self.postMessage({ type: 'status', status: 'running' } as WorkerOutboundEvent)
      break

    case 'STOP':
      isRunning = false

      if (timerId !== null) {
        clearInterval(timerId)
        timerId = null
      }

      self.postMessage({ type: 'status', status: 'stopped' } as WorkerOutboundEvent)
      break

    case 'SET_TPS':
      targetTps = message.payload.tps

      if (isRunning) {
        restartInterval()
      }
      break
  }
}
