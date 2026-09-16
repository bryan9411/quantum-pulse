import type { ConnectionStatus, DataSourceEventType, DataSourcePayloadMap } from "./type"

/**
 * 取消訂閱型別
 * 可立即將當前 listener 從監聽清單移除，避免記憶體洩漏
 */
export type Unsubscribe = () => void;

export type DataSourceListener<T extends DataSourceEventType> = (
	data: DataSourcePayloadMap[T]
) => void

/**
 * 統一的資料接口規格
 * 讓前端不管是接 mock 假資料還是真實資料，必須用相同的開關和訂閱方式
 */
export interface DataSource {
	readonly status: ConnectionStatus
	
	/**
	 * 啟動連線(兼容未來串接真實資料(非同步網路)，所以使用 Promise<void> | void)
	 */
	connect(): Promise<void> | void,

	/**
	 * 關閉連線(兼容未來串接真實資料(非同步網路)，所以使用 Promise<void> | void)
	 */
	disconnect(): Promise<void> | void,

	/**
	 * 訂閱資料流
	 * @param event 訂閱的事件類型
	 * @param listener callback，接收資料
	 */
	subscribe<T extends DataSourceEventType>(
		event: T,
		listener: DataSourceListener<T>
	): Unsubscribe
}
