# Sub2API Frontend (Next.js)

Sub2API 前端的 Next.js 重构（全新 UI，后端零改动）。技术规划见仓库根目录 [`handoff_frontend.md`](../handoff_frontend.md)。

> 当前处于 **第 2 轮：公共站点、认证体系、安装向导**（第 1 轮基础设施已合并）。目录为 `frontend-next/`，R5 切换上线时改名为 `frontend/`。

## 架构要点

| 决策                      | 说明                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages Router + 静态导出   | 产物只有外链脚本和 `type="application/json"` 数据块，在后端默认 CSP（无 `unsafe-inline` / `unsafe-eval`）下的三种服务模式（正常 / legacy / 安装向导）都能启动                   |
| **必须使用 webpack 构建** | Next 16 默认的 Turbopack 会在 HTML 里内联 `<script>`（`globalThis.TURBOPACK.push(...)`），违反 CSP。因此 `build` / `dev` 脚本都带 `--webpack`；`postbuild` 的产物校验会拦截回退 |
| 深链纠正 (Boot)           | 后端对所有前端路径回退到根 `index.html`，首屏落在 `pages/index.tsx`，`AppRoot` 读取真实地址后 `router.replace` 到完整原始 URL（保留 search / hash）                             |
| 路由注册表                | `src/core/routes.ts` 是路由元信息的单一事实来源（菜单、面包屑、命令面板、标题、门禁、深链纠正都读它）                                                                           |
| 门禁                      | `src/core/gate.ts`，严格按 Vue 版 `router.beforeEach` 的顺序实现，纯函数 + 依赖注入，表驱动测试覆盖全部分支                                                                     |
| 契约层原样移植            | `src/api`、`src/types`、`src/utils`、`src/constants`、`src/i18n/locales` 与 Vue 版路径一致，仅解除 Vue 耦合（`import.meta.env` → `process.env.NEXT_PUBLIC_*`、响应式 → 订阅）   |
| 状态                      | Zustand（与 9 个 Pinia store 一一对应）+ TanStack Query                                                                                                                         |
| i18n                      | i18next + vue-i18n 格式兼容层（`{name}` 插值、`a \| b` 复数、`{'@'}` 转义），语言包格式不变；新增文案在独立命名空间 `ui`                                                        |
| UI                        | Tailwind CSS v4 + shadcn/ui 风格组件（Radix）+ lucide；令牌在 `src/styles/globals.css`，亮 / 暗两套                                                                             |

> 说明：`src/core` 对应交接书里的 `src/app`——Next 会把 `src/app` 当作 App Router 目录并报错，所以改名。

## 常用命令

```bash
pnpm install --frozen-lockfile
pnpm dev                # 3000 端口，/api /v1 /setup /health 代理到 DEV_PROXY_TARGET（默认 http://localhost:8080）
pnpm run lint:check
pnpm run typecheck
pnpm run test:run
pnpm run build:verify   # 导出到 out/ 并校验产物契约（不触碰后端目录）
pnpm run build          # 完整构建，并把产物写入 ../backend/internal/web/dist（保留 .keep）
pnpm run e2e            # Playwright，对接 e2e/contract-server.mjs（后端行为的模拟）
```

本地没有 Playwright 浏览器时可用已安装的 Chrome：`E2E_CHANNEL=chrome pnpm run e2e`。
对接真实后端：`E2E_BASE_URL=http://localhost:8080 pnpm run e2e`（需要种子数据，见 `e2e/`）。

## 产物契约（`scripts/postbuild.mjs` 校验，任一项不满足即构建失败）

- 根 `index.html` 含字面量 `</head>`、一个 `<title>`、以 `<link rel="icon"` 开头的 link（后端按字节匹配注入）；
- 不含内联可执行脚本（只允许带 `src` 的脚本和 JSON 数据块），不含 `eval` / `new Function`；
- 除根 `index.html` 外不保留任何 HTML（避免与路由同名的目录触发 Go FileServer 的 301）；
- 产物顶层不得出现后端保留路径名（`images`、`models`、`videos` …）。

## 目录

```
pages/            文件路由（薄封装）+ _app / _document / 404
src/core/         路由注册表、门禁、Boot、标题、导航、事件桥、启动序列
src/stores/       Zustand stores
src/hooks/        通用 hooks
src/components/   ui/（设计系统层）、layout/（四种布局 + 顶栏 + 侧栏 + ⌘K）、业务通用组件
src/features/     按领域组织的页面实现（R1 仅最小登录）
src/i18n/         i18next 初始化、兼容层、从 Vue 版移植的 locales
scripts/          gen-legal（合规文档生成）、postbuild（SPA 化 + 校验 + 拷贝）
e2e/              Playwright 用例与契约模拟服务
```

## 与 Vue 版的已知差异（R1）

- `formatBytes.spec.ts` 测试的是 `views/admin/ops` 下的格式化工具，属于运维看板页面，随 R5 一并移植，R1 未带。
- 管理员合规确认对话框、公告弹窗、新手引导在后续轮次实现（R1 只接好 store 与事件桥）。
- `useBatchImageAccess` 对应的菜单显隐在 R3 接入（R1 菜单固定显示批量生图入口）。

## 第 2 轮交付（公共站点 / 认证 / 安装向导）

页面：`/home`（自定义 HTML / iframe / 精简 / 默认营销页）、`/login`（密码 · TOTP · Passkey · 三种验证码 · 全部第三方登录 · 协议同意）、`/register`、`/email-verify`、`/forgot-password`、`/reset-password`、`/auth/callback` 及其别名 `/auth/oauth/callback`（后端 GitHub / Google 回跳地址）、LinuxDo / 微信 / 钉钉 / OIDC 回调与钉钉补邮箱、`/key-usage`、`/legal/[documentId]`、`/model-plaza`、`/setup`、`/oauth/mcp/authorize`、通用错误边界。`/auth/wechat/payment/callback` 属于第 3 轮（支付链路）。

要点：

- **OAuth 回调引擎**：`src/features/auth/oauth/usePendingOAuthFlow.ts` 一份状态机服务 LinuxDo / OIDC / 微信 / 钉钉；纯解析逻辑在 `pending.ts`（fragment / query / legacy 格式，表驱动单测）。令牌读取后立即用 `replaceState` 清除 fragment。
- **验证码**：Turnstile / 腾讯天御（国内 + 国际站）/ 阿里云逐条移植自 Vue 版，按公开设置三选一，**按需懒加载**。
- **Step-up**：`hooks/useStepUp` + `TotpStepUpDialog`（MCP 管理员范围授权使用）。
- **语言包分块**：`locales/*/core.ts`（首屏）+ `console.ts`（`admin.*`，控制台布局渲染前加载）。公共页代码不得引用 `admin.*` 键（`localeScopes.spec.ts` 守护）。只加载当前语言。
- **首屏 JS 预算**：公共页不进入主包的内容 —— 控制台外壳（含 Radix 菜单 / ⌘K）、TanStack Query（`core/QueryProvider`，随控制台外壳加载）、`TooltipProvider`、协议 / TOTP 弹窗、验证码组件、marked + DOMPurify 全部按需加载；公共布局使用轻量主题 / 语言切换。需要 Tooltip / Query 的公共页请自行包裹 `TooltipProvider` / `QueryProvider`。
- 实测（gzip，现代浏览器，不含 nomodule polyfills）：`/home` ≈ 194KB，`/login` ≈ 202KB（目标 ≤ 200KB，`/login` 略超，后续可再把 sonner 按需化）。
- **E2E**：`e2e/public-auth.e2e.ts`（契约模拟服务）。Passkey（虚拟认证器）、Turnstile 官方测试 sitekey、邮件捕获服务、微信 / 钉钉内置浏览器属于真实后端联调与手工验收项。
