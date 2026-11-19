import { Html, Head, Main, NextScript } from 'next/document'

/**
 * HTML 骨架。后端对根 index.html 做字节级注入，因此这里有硬约束（交接书 §3.2 / §3.3）：
 *  - 必须有字面量 </head>、一个 <title>，以及一个以 `<link rel="icon"` 开头的 link（rel 必须是第一个属性）；
 *  - 不得有任何内联可执行脚本：主题初始化放在 public/theme-init.js（外链）。
 */
export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        {/* eslint-disable-next-line @next/next/no-title-in-document-head -- 后端按字节匹配并替换第一个 <title> */}
        <title>Sub2API - AI API Gateway</title>
        {/* 同步外链脚本：在首次绘制前设置 dark class（CSP 不允许内联脚本） */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
