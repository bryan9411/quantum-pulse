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
  title: 'QuantumPulse | 高頻渲染實驗室',
  description: '純前端高頻金融交易終端與渲染效能實驗室'
}

// 在第一次繪製前套用使用者上次選擇的主題（沒有選過則跟隨系統），避免閃爍
const themeInitScript = `(function(){try{var t=localStorage.getItem('qp-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang='zh-Hant'
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className='min-h-full flex flex-col selection:bg-emerald-500/20 selection:text-emerald-700 dark:selection:text-emerald-300'>
        {children}
      </body>
    </html>
  )
}
