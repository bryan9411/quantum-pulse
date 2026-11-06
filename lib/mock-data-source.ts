import { decodeBufferToTicks, TICK_STRIDE } from './binary-protocol'
import type {
  ConnectionStatus,
  DataSourceEventType,
  DataSourcePayloadMap
} from './type'
import type { DataSource, DataSourceListener, Unsubscribe } from './data-source'
import type {
  WorkerInboundCommand,
  WorkerOutboundEvent
} from '../workers/mock-generator.worker'

export class MockDataSource implements DataSource {
  private _status: ConnectionStatus = 'disconnected'
  private worker: Worker | null = null
  private lastPrice = 67432.18
  private targetTps = 1000
  private tickSeq = 0
  private listeners: { [K in DataSourceEventType]: Set<DataSourceListener<K>> } = {
    tick: new Set(),
    tickBatch: new Set(),
    depth: new Set(),
    status: new Set(),
    metrics: new Set()
  }

  get status(): ConnectionStatus {
    return this._status
  }

  connect(): void {
    if (this._status === 'connected' || this._status === 'connecting') {
      return
    }

    this.setStatus('connecting')

    try {
      this.worker = new Worker(
        new URL('../workers/mock-generator.worker.ts', import.meta.url),
        { type: 'module' }
      )

      this.worker.onmessage = this.handleWorkerMessage.bind(this)
      this.worker.onerror = (error) => {
        console.error('MockDataSource Worker Error:', error)
        this.setStatus('error', 'Worker 內部發生未捕捉例外')
      }

      const startCmd: WorkerInboundCommand = {
        type: 'START',
        payload: {
          initialPrice: this.lastPrice,
          tps: this.targetTps
        }
      }

      this.worker.postMessage(startCmd)
      this.setStatus('connected')
    } catch (err) {
      this.setStatus('error', err instanceof Error ? err.message : '連線失敗')
    }
  }

  disconnect(): void {
    if (this.worker) {
      const stopCmd: WorkerInboundCommand = { type: 'STOP' }

      this.worker.postMessage(stopCmd)
      this.worker.terminate()
      this.worker = null
    }

    this.setStatus('disconnected')
  }

  subscribe<T extends DataSourceEventType>(
    event: T,
    listener: DataSourceListener<T>
  ): Unsubscribe {
    const bucket = this.listeners[event] as Set<DataSourceListener<T>>
    bucket.add(listener)

    return () => {
      bucket.delete(listener)
    }
  }

  setTps(tps: number): void {
    this.targetTps = tps

    if (this.worker && this._status === 'connected') {
      const cmd: WorkerInboundCommand = {
        type: 'SET_TPS',
        payload: { tps }
      }

      this.worker.postMessage(cmd)
    }
  }

  private emit<T extends DataSourceEventType>(
    event: T,
    data: DataSourcePayloadMap[T]
  ): void {
    const bucket = this.listeners[event] as Set<DataSourceListener<T>>

    if (bucket.size === 0) return

    bucket.forEach((listener) => {
      try {
        listener(data)
      } catch (err) {
        console.error(`Error in listener for event "${event}":`, err)
      }
    })
  }

  private handleWorkerMessage(event: MessageEvent<WorkerOutboundEvent>): void {
    const message = event.data

    switch (message.type) {
      case 'tickBatch': {
        if (message.count === 0) break
        const view = new Float64Array(message.buffer)
        this.lastPrice = view[(message.count - 1) * TICK_STRIDE]

        // 只有在有人訂閱逐筆 'tick'（Baseline 管線）時才在主執行緒解碼成物件
        if (this.listeners.tick.size > 0) {
          const ticks = decodeBufferToTicks(message.buffer)
          for (let i = 0; i < ticks.length; i++) {
            ticks[i].id = `tick_${++this.tickSeq}`
            this.emit('tick', ticks[i])
          }
        }

        // 批次訂閱者（Accelerated 管線）可直接把 buffer 轉交給下一個 Worker，因此必須最後才發送
        this.emit('tickBatch', { buffer: message.buffer, count: message.count })
        break
      }

      case 'depth':
        this.emit('depth', message.data)
        break

      case 'status':
        if (message.status === 'stopped' && this._status === 'connected') {
          this.setStatus('disconnected')
        }
        break
    }
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    this._status = status
    this.emit('status', { status, message })
  }
}
