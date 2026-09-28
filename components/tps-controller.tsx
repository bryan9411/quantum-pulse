'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export interface TpsControllerProps {
	currentTps: number
	isRunning: boolean
	onTpsChange: (tps: number) => void
	onToggle: (running: boolean) => void
	min?: number
	max?: number
}

const TPS_PRESETS = [
	{ label: '10', value: 10 },
	{ label: '100', value: 100 },
	{ label: '1000', value: 1000 },
	{ label: '2000', value: 2000 },
] as const

export const TpsController = ({
	currentTps,
	isRunning,
	onTpsChange,
	onToggle,
	min = 1,
	max = 2000,
}: TpsControllerProps) => {
	const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const val = Number(e.target.value)
		onTpsChange(val)
	}

	const handleToggle = () => {
		onToggle(!isRunning)
	}

	const renderTpsPresets = () => {
		return TPS_PRESETS.map((preset) => {
			const isActive = currentTps === preset.value
			return (
				<button
					key={preset.value}
					type='button'
					onClick={() => onTpsChange(preset.value)}
					className={cn(
						'py-1 text-center text-xs font-mono rounded-full border transition-all',
						isActive
							? 'border-zinc-900 bg-zinc-900 text-white font-medium shadow-xs dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
							: 'border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900'
					)}
				>
					{preset.label}
				</button>
			)
		})
	}

	return (
		<div className='flex flex-col gap-3 p-4 rounded-xl border border-zinc-200/80 bg-white shadow-xs transition-all dark:border-zinc-800 dark:bg-zinc-950'>
			<div className='flex items-center justify-between'>
				<span className='text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-200'>
					TPS Rate Controller
				</span>

				<div className='flex items-center gap-2'>
					<span className='font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400'>
						{currentTps.toLocaleString()} TPS
					</span>

					<button
						type='button'
						onClick={handleToggle}
						title={isRunning ? '暫停注入' : '開始注入'}
						className={cn(
							'flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors',
							isRunning
								? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400'
								: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
						)}
					>
						<span
							className='w-1.5 h-1.5 rounded-full'
							style={{ backgroundColor: isRunning ? '#10b981' : '#a1a1aa' }}
						/>
						{isRunning ? 'Running' : 'Paused'}
					</button>
				</div>
			</div>

			<div className='flex items-center py-1'>
				<input
					type='range'
					min={min}
					max={max}
					value={currentTps}
					onChange={handleSliderChange}
					className='h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-sky-500 dark:bg-zinc-800 dark:accent-sky-400'
				/>
			</div>

			<div className='grid grid-cols-4 gap-2 pt-1'>
				{renderTpsPresets()}
			</div>
		</div>
	)
}
