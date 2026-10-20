export interface QueueBenchmarkResult {
  operationCount: number
  pushOnlyTimeMs: number
  pushAndShiftTimeMs: number
  slowdownFactor: number
}

/**
 * 比較純 push 與 push + shift 的效能落差
 */
export const runQueueBenchmark = (count = 100000): QueueBenchmarkResult => {
  // 純 push 方式
  const pushArray: number[] = []
  const startPush = performance.now()

  for (let i = 0; i < count; i++) {
    pushArray.push(i)
  }

  const pushOnlyTimeMs = performance.now() - startPush

  // ：push 加上 shift（保持佇列大小在 20,000）
  const queue: number[] = []
  const WINDOW_SIZE = 20000
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
