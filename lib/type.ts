export type OrderSide = 'buy' | 'sell';
export type OrderBookLevel = [price: number, size: number]

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
export type DataSourceEventType = 'tick' | 'depth' | 'status' | 'metrics';


/**
 * 成交流水
 * 
 * id: 唯一流水號  
 * price: 成交價格  
 * size: 成交量  
 * side: 買賣方向(買入或賣出)  
 * timestamp: 成交時間(毫秒)  
 */
export interface TradeTick {
	id: string
	price: number
	size: number
	side: OrderSide
	timestamp: number
}

/**
 * 深度盤口
 * 
 * bids: 買盤列表 (由高到低排序，買一價為最高價)  
 * asks: 賣盤列表 (由低到高排序，賣一價為最低價)  
 * timestamp: 快照時間(毫秒)  
 * sequenceId: 封包序號(檢查有沒有掉封包)  
 */
export interface OrderBookDepth {
	bids: OrderBookLevel[]
	asks: OrderBookLevel[]
	timestamp: number
	sequenceId: number
}

/**
 * 系統監測與效能監控指標
 * 
 * fps: 渲染幀率  
 * tps: 每秒處理事件數  
 * bufferUsage: 環形緩衝佔用率  
 * droppedEvents: 背壓機制觸發時，實際被丟棄或合併的封包總數  
 * jsHeapSizeMB: 記憶體佔用量  
 * latencyMs: 資料產生到畫面上渲染的延遲時間  
 */
export interface TelemetryMetrics {
	fps: number
	tps: number
	bufferUsage: number
	droppedEvents: number
	jsHeapSizeMB: number
	latencyMs: number
}

export type DataSourcePayloadMap = {
  tick: TradeTick
  depth: OrderBookDepth
  status: { status: ConnectionStatus, message?: string }
  metrics: TelemetryMetrics
}

export type DataSourceEvent =
  | { type: 'tick', data: TradeTick, timestamp: number }
  | { type: 'depth', data: OrderBookDepth, timestamp: number }
  | { type: 'status', data: { status: ConnectionStatus, message?: string }, timestamp: number }
  | { type: 'metrics', data: TelemetryMetrics, timestamp: number }
