export interface QueueBenchmarkResult {
  operationCount: number
  pushOnlyTimeMs: number
  pushAndShiftTimeMs: number
  slowdownFactor: number
}

/**
 * 比較純 push 與 push + shift 的效能落差
 */
// 視窗需夠大（> 約 2 萬筆）才會超出 V8 left-trim 快速路徑，真正觸發 O(n) 記憶體搬遷
const WINDOW_SIZE = 50000

export const runQueueBenchmark = (count = 200000): QueueBenchmarkResult => {
  // 先暖機讓 JIT 完成編譯，避免第一次量到的 push 時間被冷啟動灌水
  const warmup: number[] = []
  for (let i = 0; i < 10000; i++) warmup.push(i)

  // 純 push 方式
  const pushArray: number[] = []
  const startPush = performance.now()

  for (let i = 0; i < count; i++) {
    pushArray.push(i)
  }

  const pushOnlyTimeMs = performance.now() - startPush

  // push 加上 shift（保持佇列大小在 WINDOW_SIZE）
  const queue: number[] = []
  const startShift = performance.now()

  for (let i = 0; i < count; i++) {
    queue.push(i)
		
    if (queue.length > WINDOW_SIZE) {
      queue.shift()
    }
  }

  const pushAndShiftTimeMs = performance.now() - startShift

  return {
    operationCount: count,
    pushOnlyTimeMs: Number(pushOnlyTimeMs.toFixed(2)),
    pushAndShiftTimeMs: Number(pushAndShiftTimeMs.toFixed(2)),
    slowdownFactor: Number((pushAndShiftTimeMs / Math.max(pushOnlyTimeMs, 0.01)).toFixed(1))
  }
}
