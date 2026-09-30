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
  private listeners: Map<DataSourceEventType, Set<DataSourceListener<any>>> = new Map()

  constructor() {
    this.listeners.set('tick', new Set())
    this.listeners.set('depth', new Set())
    this.listeners.set('status', new Set())
    this.listeners.set('metrics', new Set())
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
        payload: { tps: 1000 }
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
    const bucket = this.listeners.get(event)

    if (bucket) {
      bucket.add(listener)
    }

    return () => {
      const currentBucket = this.listeners.get(event)

      if (currentBucket) {
        currentBucket.delete(listener)
      }
    }
  }

  setTps(tps: number): void {
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
    const bucket = this.listeners.get(event)
    
    if (!bucket || bucket.size === 0) return

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
      case 'tick':
        this.emit('tick', message.data)
        break

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
