import React from 'react'
import { cn } from '@/lib/utils'

export interface PanelCardProps {
  title?: React.ReactNode
  headerRight?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  noPadding?: boolean
}

export const PanelCard = ({
  title,
  headerRight,
  children,
  className,
  bodyClassName,
  noPadding = false
}: PanelCardProps) => {
  return (
    <section
      className={cn(
        'contain-panel flex flex-col rounded-2xl border border-zinc-200/80 bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-colors dark:border-zinc-800/80 dark:bg-zinc-900/90',
        className
      )}
    >
      {(title || headerRight) && (
        <header className='flex items-center justify-between px-4 pt-3.5 pb-2'>
          {title && (
            <h2 className='text-[13px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100'>
              {title}
            </h2>
          )}
          {headerRight && (
            <div className='flex items-center gap-2'>{headerRight}</div>
          )}
        </header>
      )}

      <div className={cn('flex-1', noPadding ? 'p-0' : 'px-4 pb-4', bodyClassName)}>
        {children}
      </div>
    </section>
  )
}

