import type { TradeTick } from '@/lib/type'

export const TICK_STRIDE = 4 // 每筆 Tick 佔用 4 個 64-bit 浮點數
export const BYTES_PER_ELEMENT = 8 // 每個元素佔 8 Bytes
export const TICK_BYTE_SIZE = TICK_STRIDE * BYTES_PER_ELEMENT

/**
 * 分配指定筆數所需之二進位記憶體
 */
export const allocateTickBuffer = (tickCount: number): Float64Array => {
  const totalElements = tickCount * TICK_STRIDE
  const buffer = new ArrayBuffer(totalElements * BYTES_PER_ELEMENT)

  return new Float64Array(buffer)
}

/**
 * 將 TradeTick 陣列壓成二進位 Float64Array
 */
export const encodeTicksToBuffer = (ticks: TradeTick[]): Float64Array => {
  const view = allocateTickBuffer(ticks.length)
  
  for (let i = 0; i < ticks.length; i++) {
    const tick = ticks[i]
    const offset = i * TICK_STRIDE
    
    view[offset + 0] = tick.price
    view[offset + 1] = tick.size
    view[offset + 2] = tick.side === 'buy' ? 1 : 0
    view[offset + 3] = tick.timestamp
  }
  
  return view
}

/**
 * 從二進位 ArrayBuffer 還原回 TradeTick 陣列
 */
export const decodeBufferToTicks = (buffer: ArrayBuffer): TradeTick[] => {
  const view = new Float64Array(buffer)
  const count = view.length / TICK_STRIDE
  const ticks: TradeTick[] = new Array(count)
  
  for (let i = 0; i < count; i++) {
    const offset = i * TICK_STRIDE
    const price = view[offset + 0]
    const size = view[offset + 1]
    const side = view[offset + 2] === 1 ? 'buy' : 'sell'
    const timestamp = view[offset + 3]
    
    ticks[i] = {
      id: `tick_${timestamp}_${i}`,
      price,
      size,
      side,
      timestamp
    }
  }
  
  return ticks
}
