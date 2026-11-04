import type { TradeTick } from '@/lib/type'
import { TICK_STRIDE } from '@/lib/binary-protocol'

export class TypedRingBuffer {
  private readonly capacity: number
  private readonly buffer: Float64Array
  private writeIndex = 0
  private readIndex = 0
  private count = 0
  private droppedCount = 0

  constructor(capacity = 4096) {
    if (capacity <= 0) {
      throw new Error('RingBuffer capacity must be greater than 0')
    }
    this.capacity = capacity
    this.buffer = new Float64Array(capacity * TICK_STRIDE)
  }

  /**
   * 寫入一筆 Tick。緩衝區滿載時會覆寫最舊的資料。
   * @returns true 表示正常寫入，false 表示覆寫了一筆舊資料。
   */
  push(tick: TradeTick): boolean {
    const offset = this.writeIndex * TICK_STRIDE

    this.buffer[offset + 0] = tick.price
    this.buffer[offset + 1] = tick.size
    this.buffer[offset + 2] = tick.side === 'buy' ? 1 : 0
    this.buffer[offset + 3] = tick.timestamp

    this.writeIndex = (this.writeIndex + 1) % this.capacity

    if (this.count === this.capacity) {
      this.readIndex = (this.readIndex + 1) % this.capacity
      this.droppedCount++
      return false
    }

    this.count++
    return true
  }

  /**
   * 將 Worker 傳回的 ArrayBuffer 批次寫入環形緩衝區。
   * @returns 本次寫入時因緩衝區滿載而覆寫的筆數。
   */
  pushBatchFromBuffer(incomingBuffer: ArrayBuffer): number {
    const view = new Float64Array(incomingBuffer)
    const incomingTickCount = view.length / TICK_STRIDE
    let batchDropped = 0

    for (let i = 0; i < incomingTickCount; i++) {
      const srcOffset = i * TICK_STRIDE
      const dstOffset = this.writeIndex * TICK_STRIDE

      this.buffer[dstOffset + 0] = view[srcOffset + 0]
      this.buffer[dstOffset + 1] = view[srcOffset + 1]
      this.buffer[dstOffset + 2] = view[srcOffset + 2]
      this.buffer[dstOffset + 3] = view[srcOffset + 3]

      this.writeIndex = (this.writeIndex + 1) % this.capacity

      if (this.count === this.capacity) {
        this.readIndex = (this.readIndex + 1) % this.capacity
        this.droppedCount++
        batchDropped++
      } else {
        this.count++
      }
    }

    return batchDropped
  }

  /**
   * 取出最舊的一筆 Tick，並將讀取位置往前移動。
   * 緩衝區為空時回傳 null。
   */
  shift(): TradeTick | null {
    if (this.count === 0) {
      return null
    }

    const offset = this.readIndex * TICK_STRIDE
    const price = this.buffer[offset + 0]
    const size = this.buffer[offset + 1]
    const side = this.buffer[offset + 2] === 1 ? 'buy' : 'sell'
    const timestamp = this.buffer[offset + 3]

    this.readIndex = (this.readIndex + 1) % this.capacity
    this.count--

    return {
      id: `rb_${timestamp}_${this.readIndex}`,
      price,
      size,
      side,
      timestamp
    }
  }

  /**
   * 一次取出多筆尚未讀取的 Tick。
   * @param maxCount 最多取出的筆數，未指定時會取出所有資料。
   */
  drain(maxCount?: number): TradeTick[] {
    if (this.count === 0) {
      return []
    }

    const takeCount = maxCount !== undefined
      ? Math.min(maxCount, this.count)
      : this.count

    const result: TradeTick[] = new Array(takeCount)

    for (let i = 0; i < takeCount; i++) {
      const tick = this.shift()
      if (tick !== null) {
        result[i] = tick
      }
    }

    return result
  }

  /**
   * 取得目前緩衝區的使用率（百分比）。
   */
  getUsageRatio(): number {
    return Number(((this.count / this.capacity) * 100).toFixed(1))
  }

  /** 目前尚未讀取的 Tick 數量。 */
  get size(): number {
    return this.count
  }

  /** 緩衝區可容納的最大 Tick 數量。 */
  get maxCapacity(): number {
    return this.capacity
  }

  /** 累計因緩衝區滿載而被覆寫的 Tick 數量。 */
  get dropped(): number {
    return this.droppedCount
  }

  /** 清空緩衝區並重置所有索引與計數器，不重新配置底層記憶體。 */
  clear(): void {
    this.writeIndex = 0
    this.readIndex = 0
    this.count = 0
    this.droppedCount = 0
  }
}
