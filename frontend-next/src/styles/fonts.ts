import localFont from 'next/font/local'

/** 拉丁字体本地托管（构建期不联网拉取 Google Fonts）。中文使用系统字体栈。 */
export const Inter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  display: 'swap',
  weight: '100 900'
})
