export interface BenchmarkResult {
  mode: 'Structured Clone (深拷貝)' | 'Transferable Objects (零拷貝)'
  sizeMB: number
  roundTripMs: number
  senderBufferNeutered: boolean
}

export const runBenchmark = (
  worker: Worker,
  sizeMB: number,
  mode: 'clone' | 'transfer'
): Promise<BenchmarkResult> => {
  return new Promise((resolve) => {
    // 建立指定大小的 ArrayBuffer
    const byteLength = sizeMB * 1024 * 1024
    const buffer = new ArrayBuffer(byteLength)

    // 填入資料，讓 OS 分配實體記憶體分頁
    const view = new Uint8Array(buffer)
    view[0] = 42
    view[view.length - 1] = 99

    const startTime = performance.now()

    const handleMessage = (event: MessageEvent) => {
      const endTime = performance.now()

      worker.removeEventListener('message', handleMessage)

      const roundTripMs = endTime - startTime

      // 檢查發送端的 buffer 是否已經失效（byteLength 歸 0）
      const isNeutered = buffer.byteLength === 0

      resolve({
        mode: mode === 'clone' ? 'Structured Clone (深拷貝)' : 'Transferable Objects (零拷貝)',
        sizeMB,
        roundTripMs: Number(roundTripMs.toFixed(2)),
        senderBufferNeutered: isNeutered
      })
    }

    worker.addEventListener('message', handleMessage)

    const sentAt = performance.now()
    if (mode === 'clone') {
      worker.postMessage({ type: 'STRUCTURED_CLONE', buffer, sentAt })
    } else {
      worker.postMessage({ type: 'TRANSFERABLE', buffer, sentAt }, [buffer])
    }
  })
}
