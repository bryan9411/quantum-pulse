import type { TradeTick, OrderSide } from '../lib/type'

/**
 * 發送給 Worker 的指令型別
 */
export type WorkerInboundCommand = 
	| { type: 'START', payload?: { initialPrice?: number, tps: number} }
	| { type: 'STOP' }
	| { type: 'SET_TPS', payload: { tps: number } }

/**
 * Worker 回傳事件型別
 */
export type WorkerOutboundEvent = 
	| { type: 'tick', data: TradeTick }
	| { type: 'status', status: 'running' | 'stopped'}


let isRunning = false
let currentPrice = 65000.0
let targetTps = 1000
let sequenceId = 0
let timerId: ReturnType<typeof setInterval> | null = null


/**
 * 將均勻分布隨機數轉為標準常態分布隨機數
 */
const generateGaussianNoise = (): number => {
  let u1 = 0
  let u2 = 0
  while (u1 === 0) u1 = Math.random() // 避免 log(0) 產生 -Infinity
  while (u2 === 0) u2 = Math.random()
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
}

/**
 * 幾何布朗運動（GBM）下一價格推算：
 * 公式：S(t + dt) = S(t) * exp((drift - 0.5 * vol^2) * dt + vol * sqrt(dt) * Z)
 */
const calculateNextGbmPrice = (
  currentPrice: number,
  dt: number = 0.001,
  drift: number = 0.0,
  volatility: number = 0.002
): number => {
  const z = generateGaussianNoise()
  const driftTerm = (drift - 0.5 * Math.pow(volatility, 2)) * dt
  const shockTerm = volatility * Math.sqrt(dt) * z
  const nextPrice = currentPrice * Math.exp(driftTerm + shockTerm)
  
  // 保留兩位小數（金融標準美分格式）
  return Number(nextPrice.toFixed(2))
}


/**
 * 單筆 Tick
 */
const produceSingleTick = (): TradeTick => {
	sequenceId++
  currentPrice = calculateNextGbmPrice(currentPrice)

  const side: OrderSide = Math.random() > 0.48 ? 'buy' : 'sell'
  const size = Number((Math.random() * 1.49 + 0.01).toFixed(4))
  
	return {
    id: `tick_${sequenceId}_${Date.now()}`,
    price: currentPrice,
    size,
    side,
    timestamp: Date.now()
  }
}

const restartInterval = () => {
	if (timerId !== null) {
		clearInterval(timerId)
		timerId = null
	}

	if (!isRunning) return 

	// 計算每筆 Tick 間隔的毫秒數
	const intervalMs = Math.max(1, Math.floor(1000 / targetTps))

	timerId = setInterval(() => {
		const tick = produceSingleTick()
		
		// 將資料複製一份往主要執行緒傳送
		self.postMessage({
			type: 'tick',
			data: tick
		} as WorkerOutboundEvent)
	}, intervalMs)
}

/**
 * 監聽控制指令
 * @param event 訊息事件  
 */
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
