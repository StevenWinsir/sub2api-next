// Next.js 配置 —— Pages Router + 静态导出（交接书 §4.1 / §5.10）
const isProd = process.env.NODE_ENV === 'production'
const devProxyTarget = process.env.DEV_PROXY_TARGET || 'http://localhost:8080'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 只在生产构建时启用静态导出；开发期需要 rewrites
  ...(isProd ? { output: 'export' } : {}),
  images: { unoptimized: true },
  trailingSlash: false,
  reactStrictMode: true,
  // 不发布 source map（与原 Vite 默认行为一致）
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  // 开发期代理，对应原 Vite proxy；生产构建不生效
  ...(isProd
    ? {}
    : {
        async rewrites() {
          return [
            { source: '/api/:path*', destination: `${devProxyTarget}/api/:path*` },
            { source: '/v1/:path*', destination: `${devProxyTarget}/v1/:path*` },
            { source: '/v1beta/:path*', destination: `${devProxyTarget}/v1beta/:path*` },
            { source: '/setup/:path*', destination: `${devProxyTarget}/setup/:path*` },
            { source: '/health', destination: `${devProxyTarget}/health` }
          ]
        }
      })
}

export default nextConfig
