import type { AppProps } from 'next/app'
import Head from 'next/head'
import { Inter } from '@/styles/fonts'
import { AppRoot } from '@/core/AppRoot'
import '@/styles/globals.css'

export default function App(props: AppProps) {
  return (
    <div className={Inter.variable}>
      <Head>
        {/* 覆盖 Next 默认 viewport（与 Vue 版一致）；theme-init.js 会在 iOS 上追加 maximum-scale */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>
      <AppRoot {...props} />
    </div>
  )
}
