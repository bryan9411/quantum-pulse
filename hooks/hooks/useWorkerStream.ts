import { useState, useEffect, useRef, useCallback } from 'react'
import type { TradeTick, OrderBookDepth } from '@/lib/type'
import { decodeBufferToTicks } from '@/lib/binary-protocol'
import type { StreamCommand, StreamEvent } from '@/workers/stream-processor.worker'

export interface WorkerStreamState {
	status: 'idle' | 'running' | 'stopped'
	latestTicks: TradeTick[]
	latestDepth: OrderBookDepth | null
	metrics: {
		tps: number
		queueSize: number
		lastLatencyMs: number
	}
}

export interface UseWorkerStreamReturn extends WorkerStreamState {
	start: (batchIntervalMs?: number) => void
	stop: () => void
	reset: () => void
	ingestTick: (tick: TradeTick) => void
	ingestDepth: (depth: OrderBookDepth) => void
}

export const useWorkerStream = (): UseWorkerStreamReturn => {
	const workerRef = useRef<Worker | null>(null)

	const [status, setStatus] = useState<'idle' | 'running' | 'stopped'>('idle')
	const [latestTicks, setLatestTicks] = useState<TradeTick[]>([])
	const [latestDepth, setLatestDepth] = useState<OrderBookDepth | null>(null)
	const [metrics, setMetrics] = useState({
		tps: 0,
		queueSize: 0,
		lastLatencyMs: 0
	})

	useEffect(() => {
		if (typeof window === 'undefined') return

		const worker = new Worker(
			new URL('../workers/stream-processor.worker.ts', import.meta.url),
			{ type: 'module' }
		)
		workerRef.current = worker

		worker.onmessage = (event: MessageEvent<StreamEvent>) => {
			const message = event.data

			switch (message.type) {
				case 'BINARY_BATCH_TICKS': {
					const decodedTicks = decodeBufferToTicks(message.buffer)
					setLatestTicks(decodedTicks)
					break
				}

				case 'BATCH_TICKS':
					setLatestTicks(message.ticks)
					break

				case 'LATEST_DEPTH':
					setLatestDepth(message.depth)
					break

				case 'METRICS':
					setMetrics(message.metrics)
					break

				case 'STATUS':
					setStatus(message.status)
					break
			}
		}

		worker.onerror = (err) => {
			console.error('StreamProcessor Worker Error:', err)
			setStatus('stopped')
		}

		return () => {
			worker.terminate()
			workerRef.current = null
		}
	}, [])

	const sendCommand = useCallback((cmd: StreamCommand) => {
		if (workerRef.current) {
			workerRef.current.postMessage(cmd)
		}
	}, [])

	const start = useCallback((batchIntervalMs?: number) => {
		sendCommand({ type: 'START', payload: { batchIntervalMs } })
	}, [sendCommand])

	const stop = useCallback(() => {
		sendCommand({ type: 'STOP' })
	}, [sendCommand])

	const reset = useCallback(() => {
		sendCommand({ type: 'RESET' })
	}, [sendCommand])

	const ingestTick = useCallback((tick: TradeTick) => {
		sendCommand({ type: 'INGEST_TICK', payload: tick })
	}, [sendCommand])

	const ingestDepth = useCallback((depth: OrderBookDepth) => {
		sendCommand({ type: 'INGEST_DEPTH', payload: depth })
	}, [sendCommand])

	return {
		status,
		latestTicks,
		latestDepth,
		metrics,
		start,
		stop,
		reset,
		ingestTick,
		ingestDepth
	}
}
