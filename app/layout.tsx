import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

export const metadata: Metadata = {
  title: 'QuantumPulse | High-Frequency Rendering Lab',
  description: 'Pure Frontend High-Frequency Financial Terminal & Rendering Lab'
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang='en'
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className='min-h-full flex flex-col selection:bg-emerald-500/20 selection:text-emerald-700 dark:selection:text-emerald-300'>
        {children}
      </body>
    </html>
  )
}
