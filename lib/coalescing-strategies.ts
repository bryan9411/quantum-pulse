import type { TradeTick, OrderBookDepth } from '@/lib/type'
import type { TypedRingBuffer } from '@/lib/ring-buffer'

export type BackpressureStrategy = 'queue' | 'drop' | 'coalesce'

export interface BackpressureBatchResult {
  ticks: TradeTick[]
  rawDrainedCount: number
  discardedOrMergedCount: number
}

/**
 * 策略一：Queue（排隊模式）
 * 每幀僅從環形緩衝區抽取固定上限筆數，其餘留在緩衝區排隊等待下一幀。
 */
export const applyQueueStrategy = (
  ringBuffer: TypedRingBuffer,
  maxPerFrame: number
): BackpressureBatchResult => {
  const ticks = ringBuffer.drain(maxPerFrame)

  return {
    ticks,
    rawDrainedCount: ticks.length,
    discardedOrMergedCount: 0
  }
}

/**
 * 策略二：Drop（尾端保留 / 丟棄舊資料模式）
 * 每幀將環形緩衝區一次抽乾（消除排隊延遲），但僅保留最新 maxPerFrame 筆，舊資料直接丟棄。
 */
export const applyDropStrategy = (
  ringBuffer: TypedRingBuffer,
  maxPerFrame: number
): BackpressureBatchResult => {
  const allTicks = ringBuffer.drain()
  const total = allTicks.length

  if (total <= maxPerFrame) {
    return {
      ticks: allTicks,
      rawDrainedCount: total,
      discardedOrMergedCount: 0
    }
  }

  const keptTicks = allTicks.slice(total - maxPerFrame)

  return {
    ticks: keptTicks,
    rawDrainedCount: total,
    discardedOrMergedCount: total - keptTicks.length
  }
}

/**
 * 策略三：Coalesce（微批次智慧合併模式）
 * 每幀將環形緩衝區一次抽乾，若超過 maxPerFrame，則均勻分桶（Bucketing）聚合：
 * 保留每個桶子最後一筆的最新價格、方向與時間戳，並將桶內所有成交量（size）精確累加。
 */
export const applyCoalesceStrategy = (
  ringBuffer: TypedRingBuffer,
  maxPerFrame: number
): BackpressureBatchResult => {
  const allTicks = ringBuffer.drain()
  const total = allTicks.length

  if (total <= maxPerFrame) {
    return {
      ticks: allTicks,
      rawDrainedCount: total,
      discardedOrMergedCount: 0
    }
  }

  const coalesced: TradeTick[] = new Array(maxPerFrame)

  for (let b = 0; b < maxPerFrame; b++) {
    const startIdx = Math.floor((b * total) / maxPerFrame)
    const endIdx = Math.floor(((b + 1) * total) / maxPerFrame)

    let totalSize = 0
    for (let i = startIdx; i < endIdx; i++) {
      totalSize += allTicks[i].size
    }

    const lastTick = allTicks[endIdx - 1]
    coalesced[b] = {
      id: `${lastTick.id}_c${endIdx - startIdx}`,
      price: lastTick.price,
      size: Number(totalSize.toFixed(4)),
      side: lastTick.side,
      timestamp: lastTick.timestamp
    }
  }

  return {
    ticks: coalesced,
    rawDrainedCount: total,
    discardedOrMergedCount: total - maxPerFrame
  }
}

/**
 * 盤口深度合併策略：Last-Write-Wins (LWW)
 * 由於 OrderBookDepth 是完整狀態快照，同一幀內多次更新只需保留最新一筆。
 */
export const coalesceOrderBookDepth = (
  previousPending: OrderBookDepth | null,
  incomingDepth: OrderBookDepth
): OrderBookDepth => {
  if (!previousPending) return incomingDepth
  return incomingDepth.sequenceId >= previousPending.sequenceId
    ? incomingDepth
    : previousPending
}

/**
 * 背壓策略統一調度器
 */
export const executeBackpressureStrategy = (
  strategy: BackpressureStrategy,
  ringBuffer: TypedRingBuffer,
  maxPerFrame = 60
): BackpressureBatchResult => {
  switch (strategy) {
    case 'queue':
      return applyQueueStrategy(ringBuffer, maxPerFrame)
    case 'drop':
      return applyDropStrategy(ringBuffer, maxPerFrame)
    case 'coalesce':
      return applyCoalesceStrategy(ringBuffer, maxPerFrame)
  }
}
