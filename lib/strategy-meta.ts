import type { BackpressureStrategy } from '@/lib/coalescing-strategies'

export interface StrategyMeta {
  id: BackpressureStrategy
  /** 按鈕上的短名稱 */
  label: string
  /** 被處理掉的那部分 Tick 叫什麼 */
  discardedLabel: string
  /** 一句話說明 */
  description: string
}

export const STRATEGY_META: Record<BackpressureStrategy, StrategyMeta> = {
  coalesce: {
    id: 'coalesce',
    label: '合併',
    discardedLabel: '合併進摘要',
    description: '每幀把積壓的成交全部取出，壓縮成 60 筆摘要。畫面即時，總成交量不遺失，列表會標示「合併 ×N」。'
  },
  drop: {
    id: 'drop',
    label: '丟棄',
    discardedLabel: '丟棄',
    description: '每幀把積壓的成交全部取出，只顯示最新 60 筆，其餘直接丟掉。畫面即時，但成交量會少算。'
  },
  queue: {
    id: 'queue',
    label: '排隊',
    discardedLabel: '—',
    description: '每幀只處理最舊的 60 筆，其餘繼續排隊。資料不刪減，但量大時畫面會落後，緩衝區滿了會覆蓋最舊的資料。'
  }
}

export const STRATEGY_ORDER: BackpressureStrategy[] = ['coalesce', 'drop', 'queue']
