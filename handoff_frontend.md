# Sub2API 前端 Next.js 重构 · 技术规划交接书

> 文档版本：v1.0（2026-11-19）
> 适用范围：仅 `frontend/`（Vue 3）→ 全新 Next.js 前端。`backend/` 下任何文件一律不改。
> 阅读对象：承接重构的前端负责人、开发、测试、发布。
> 本文不含代码示例，只写设计决策、约束、实施步骤和验收标准。

---

## 0. 结论先行（10 条关键决策）

1. **框架形态**：Next.js **Pages Router + 静态导出（`output: 'export'`）**，产物仍写入 `backend/internal/web/dist`，继续由 Go 二进制通过 `-tags embed` 内嵌发布。部署形态（单二进制、Docker 镜像、goreleaser）完全不变。
2. **不用 App Router**：App Router 的静态导出会在 HTML 里输出大量内联可执行脚本（RSC payload），后端默认 CSP 禁止内联脚本（只放行 nonce）。安装向导模式和 legacy 模式下，后端**不会**替换 nonce 占位符，结果就是白屏。Pages Router 的导出产物只有外链脚本和 `type="application/json"` 数据块，天然满足 CSP。详见 §4.1。
3. **不用 SSR/Node 服务部署**：引入 Node 服务需要改部署拓扑。后端负责的 `__APP_CONFIG__` 注入、CSP 头、HTML 缓存失效机制也都要重做，违背“后端不动、完美匹配”。
4. **路由**：采用 Next 原生文件路由，所有页面都是纯客户端页面，不用任何数据获取函数。后端对所有前端路径统一回退到根 `index.html`，因此前端要实现一个**深链纠正启动器**（Boot）：首屏读取真实地址，再交给 Next 路由客户端跳转。构建后处理只保留根 `index.html`，避免目录与路由冲突。详见 §5.3。
5. **UI 框架（免费、可商用）**：shadcn/ui（MIT，基于 Radix UI + Tailwind CSS），配套 TanStack Table、Recharts、React Hook Form + Zod、sonner、cmdk、lucide-react。视觉语言与现有 Vue 版（青色玻璃拟态）完全不同。详见 §4.2、§6。
6. **业务逻辑复用优先**：`src/api/**`、`src/types/**`、`src/utils/**`、`src/constants/**` 大部分是纯 TypeScript，**原样移植、路径不变**，只解除少量 Vue 耦合。这样可最大限度保证与后端契约一致，也便于后续同步上游。
7. **状态**：Zustand 负责全局客户端状态（一一对应现有 9 个 Pinia store），TanStack Query 负责服务端数据缓存、轮询和取消。
8. **国际化**：i18next + react-i18next。**语言包文件格式保持 vue-i18n 原样**，包括 `{name}` 插值、`|` 复数和 `{'@'}` 转义，兼容差异由一个兼容层抹平，以便与上游语言包直接同步。
9. **浏览器存储键 100% 沿用**（`auth_token`、`refresh_token`、`theme`、`sub2api_locale` 等），用户升级后不掉登录、不丢表格偏好。
10. **五轮交付**：R1 基础设施与契约打通 → R2 公共站点、认证与安装向导 → R3 用户控制台与支付 → R4 管理后台核心资源 → R5 管理后台系统级、全量回归与切换上线。

---

## 1. 目标、边界与完成定义

### 1.1 目标
- 用 Next.js 重写前端，UI/UX 全面焕新，达到商业化 SaaS 控制台的标准（视觉、交互、可访问性、性能、稳定性、可运营）。
- **功能 100% 对等**：现有 Vue 前端能做的每一件事，新前端都能做。字段、校验、提示、权限、开关行为保持一致。
- **与后端零差异对接**：请求路径、请求头、参数、负载结构、错误处理、鉴权与刷新、跨标签行为、URL 回调地址全部保持一致。

### 1.2 明确不做
- 不改 `backend/` 下任何文件，包括 `internal/web`、CSP 默认策略、路由、DTO、配置默认值。
- 不新增或修改 API，不新增业务功能，不改任何前端 URL 路径（后端和第三方回调依赖这些路径）。
- 不改 Dockerfile 的前端构建阶段（目标是原样可用，见 §5.10）。

### 1.3 允许改动的仓库外围文件（仅切换上线时）
- 根目录 `Makefile` 里的 `FRONTEND_CRITICAL_VITEST` 测试清单（指向新的测试文件路径）。
- 根目录 `.gitignore`、`.dockerignore`（忽略 `.next/`、`out/`）。
- `frontend/audit.json`（安全扫描白名单，按新依赖重建）。
- 文档类文件（README 的前端章节、DEV_GUIDE）。

### 1.4 完成定义（DoD）
- 附录 A 中全部路由完成，并通过对应轮次的验收。
- `pnpm run build` 只产出到 `backend/internal/web/dist`，原 Dockerfile 能构建出可运行镜像。
- 在后端默认配置（CSP 开启）的三种服务模式（正常、legacy、安装向导）下，浏览器控制台零 CSP 违规、零未捕获异常。
- Vue 版与 Next 版用同一后端、同一数据做并排对比，功能对等清单（§7.2）全部勾选。
- 满足 §9 的全局质量门禁。

---

## 2. 现状分析（Vue 前端）

### 2.1 规模
| 维度 | 数据 |
|---|---|
| 源文件 | 约 963 个（`frontend/src`） |
| 页面（views） | 约 7.5 万行，约 90 个 `.vue` |
| 组件（components + features） | 约 7.6 万行，233 个 `.vue` |
| API 层 | 约 1.4 万行（用户侧 24 个模块，管理侧 35 个模块） |
| 语言包 | 中、英各约 1 万行，按领域拆分（admin 下 9 个子模块） |
| 单元测试 | 387 个 spec |
| 超大页面 | `admin/SettingsView` 13,415 行；`admin/GroupsView` 6,984 行；`user/BatchImageGuideView` 2,693 行；`admin/AccountsView` 2,635 行；`admin/RiskControlView` 2,472 行；`user/KeysView` 2,114 行；`admin/ProxiesView` 2,089 行；`admin/UsersView` 1,912 行 |

### 2.2 技术栈
Vue 3.5、Vue Router 4、Pinia、vue-i18n 11（runtime 构建，规避 CSP 的 unsafe-eval）、Axios、Tailwind 3、Chart.js、@vueuse、@tanstack/vue-virtual、vue-draggable-plus、driver.js（新手引导）、marked + DOMPurify、qrcode、xlsx + file-saver、@stripe/stripe-js、@airwallex/components-sdk、@lobehub/icons（只提取了 SVG path 数据）。构建工具 Vite 5，包管理 pnpm 9，Node 24。

### 2.3 启动流程（必须在新前端中等价复刻）
1. 在挂载前根据 `localStorage.theme` 或系统偏好给 `<html>` 加上 `dark` class，防止主题闪烁。
2. 仅在 iOS 设备上给 viewport 追加 `maximum-scale=1.0`，防止输入框聚焦时页面放大。
3. 读取 `window.__APP_CONFIG__`（后端注入的公开设置），同步写入 app store，再设置标题和 favicon。
4. 初始化 i18n，只加载当前语言包。
5. 等路由首次导航（含守卫）完成后再挂载，避免空白帧。
6. 挂载后：先查询安装状态，需要安装且当前不在 `/setup` 时跳转 `/setup`；然后强制拉取一次公开设置。

### 2.4 全局行为（App.vue）
- 标题跟随路由、站点名、语言、自定义菜单、计费模式（`/purchase` 的标题按“仅充值/仅订阅/两者”切换）变化。
- 登录后：管理员拉取合规状态；订阅功能开启时预加载订阅并开始轮询；公告的拉取规则是“新登录延迟 3 秒强制拉取、刷新页面恢复登录时普通拉取、每次路由变化节流拉取、页面重新可见时拉取”。
- 退出登录后清空订阅、公告和合规状态，并移除 `visibilitychange` 监听。
- 监听全局事件 `admin-compliance-required`（由 API 层在收到 423 时派发），弹出合规确认对话框。
- 全局挂载：导航进度条、Toast、公告弹窗、管理员合规对话框。

### 2.5 路由守卫（按执行顺序，必须逐条复刻）
1. 开始导航进度条；首次导航时从 localStorage 恢复登录态。
2. 设置文档标题。
3. 访问 `/setup` 时查询安装状态：已安装则按登录态和角色重定向；查询失败则放行。
4. **公开路由**（`requiresAuth === false`）：
   - 已登录访问 `/login`、`/register`：后端模式且非管理员时放行，否则管理员去 `/admin/dashboard`、普通用户去 `/dashboard`。
   - `/model-plaza`：公开设置未加载时先加载。`model_plaza_enabled === false`（且设置加载成功）时按登录态重定向；`model_plaza_require_auth` 为真且未登录时去登录页并携带 `redirect`；后端模式下非管理员去 `/login`。
   - 后端模式且未登录时，只放行白名单：`/login`、`/key-usage`、`/setup`、`/payment/result`、`/payment/airwallex`、`/legal*`，以及 7 个 OAuth 回调路径。存在 pending auth session 时额外放行 `/register` 和 `/email-verify`。
5. **受保护路由（默认）**：未登录时跳转 `/login?redirect=<原完整路径>`；需要管理员但当前不是时跳转 `/dashboard`；管理员首次进入管理路由时拉取合规状态，423 + `ADMIN_COMPLIANCE_ACK_REQUIRED` 时进入待确认状态。
6. 路由带支付、风控或订阅开关要求且公开设置未加载时，先加载。**只有加载成功且明确为 `false` 才拦截**，加载失败视为未知并放行（fail-open 到后端兜底）。拦截后：支付关闭时管理员去 `/admin/dashboard`、用户去 `/dashboard`；风控关闭时管理员去 `/admin/settings`、用户去 `/dashboard`；订阅关闭时同支付。
7. 简易模式（`run_mode === 'simple'`）下禁止访问 `/admin/subscriptions`、`/admin/redeem`、`/subscriptions`、`/redeem`。
8. 后端模式下管理员全放行，非管理员只能访问白名单。
9. 路由切换后滚动到顶部，浏览器前进/后退时恢复原滚动位置。动态 chunk 加载失败时自动刷新一次（10 秒内不重复，防止死循环）。

### 2.6 API 层要点（`src/api/client.ts`）
- baseURL 默认 `/api/v1`，可通过构建变量覆盖；`withCredentials: true`；超时 30 秒；JSON 请求头。
- 请求拦截：Bearer token 取自 `localStorage.auth_token`；`Accept-Language` 为当前语言；**所有 GET 请求自动附加 `timezone` 参数**（浏览器 IANA 时区）；管理侧路径（或当前页面在 `/admin` 下）附加 `X-Admin-UI-Request: 1`；用户侧白名单路径附加 `X-User-UI-Request: 1`（用于 Server-Timing）。
- 响应拦截：解包 `{code, message, data}`，`code === 0` 时只返回 `data`，否则抛出结构化错误 `{status, code, message, reason, metadata}`。
- 错误处理：
  - 404 + `Ops monitoring is disabled`：写缓存键、派发 `ops-monitoring-disabled` 事件；当前在 `/admin/ops` 时硬跳转 `/admin/settings`。
  - 423 + `ADMIN_COMPLIANCE_ACK_REQUIRED`：派发 `admin-compliance-required` 事件。
  - 401：有 refresh token 且不是登录、注册、刷新接口时，单飞刷新（基于 `navigator.locks` 跨标签互斥，无该 API 时降级）后重放原请求。刷新期间会话被其他标签切换时，返回 `AUTH_SESSION_CHANGED` 且不清理会话；刷新返回 0、429 或 5xx 时返回 `TOKEN_REFRESH_UNAVAILABLE` 且不登出；其余情况清理 4 个令牌键、设置 `sessionStorage.auth_expired`，并硬跳转 `/login`。
  - 解析 `Retry-After`（只接受整数秒）。
  - 取消请求原样抛出。
  - 网络错误统一为 `ERR_NETWORK`。
- 部分功能绕过 Axios 直接调用网关：批量生图走 `/v1/images/batches*`，用 `buildGatewayUrl`；账号测试用 fetch 读取 SSE 流式响应；版本徽章 fetch `/health`。

### 2.7 第三方与特殊集成
- 人机验证三种：Cloudflare Turnstile、阿里云验证码（`*.alicdn.com`）、腾讯天御（国内站和国际站）。
- 支付：Stripe（内嵌，以及弹窗页 `/payment/stripe-popup` 通过 `postMessage` 校验 origin）、Airwallex（生产和 demo 环境）、二维码支付、支付宝 deeplink、微信支付 OAuth 回调、支付恢复（`payment.recovery.current`）。
- 登录方式：密码、TOTP 二次验证、Passkey（WebAuthn）、LinuxDo、微信（开放平台、公众号、移动端）、钉钉（含邮箱补全）、OIDC、GitHub、Google、邮箱 OAuth。OAuth 回调令牌**通过 URL fragment（#）传递**。
- 敏感操作 Step-up：后端返回 `STEP_UP_REQUIRED` 时弹出 TOTP 验证，换取短期授权后重放原操作；用户取消时静默处理。
- 插件管理：同源 iframe 加载插件配置 UI，并通过 `postMessage` 桥接通信。
- 自定义页面 `/custom/:id`：iframe 嵌入外部页面，通过 query 传 `token`、`lang`、`theme`、`user_id`、`src_host`、`src_url`、`ui_mode`。这是对外契约，必须保持不变。
- 首页 `home_content`：URL 模式下用 iframe 加载，否则按 HTML 原样渲染（内容由管理员配置）。
- 合规文档：`docs/legal/admin-compliance.{zh,en}.md` 在构建期以原始文本导入。
- 其他：新手引导（driver.js）、IP 归属地查询（外部 fetch 并带本地缓存）、Excel 导出、拖拽排序、虚拟滚动。

---

## 3. 后端对前端的硬性契约（必须逐条遵守）

本节内容全部来自对 `backend/internal/web`、`backend/internal/server/middleware/security_headers.go`、`backend/internal/config/config.go`、`backend/cmd/server/main.go` 的阅读，是重构能否“完美匹配后端”的根本依据。

### 3.1 产物位置与嵌入
- 后端以 `//go:embed all:dist` 嵌入 `backend/internal/web/dist`，判断是否嵌入了前端的依据是 `dist/index.html` 是否存在。
- 仓库通过 `.gitignore` 只保留 `dist/.keep`。构建脚本清空 `dist` 时**必须保留 `.keep`**。
- Dockerfile 在 `/app/frontend` 下执行 `pnpm install --frozen-lockfile` 和 `pnpm run build`，然后从 `/app/backend/internal/web/dist` 拷贝产物。`docs/legal/` 会被复制到 `/app/docs/legal/`（与 frontend 同级）。CI 的 release 工作流同样执行 `pnpm run build`，并上传 dist。
- 结论：新前端最终必须位于 `frontend/` 目录，`build` 脚本名不变，产物路径不变，依赖 pnpm 和 `pnpm-lock.yaml`。

### 3.2 SPA 回退与 index.html 注入
- 后端中间件对任意非 API 路径：如果 `dist` 中存在同名文件就直接返回，**否则一律返回根 `index.html`**，并在返回前注入以下内容：
  - 在 `</head>` 前插入 `<script nonce="…">window.__APP_CONFIG__=…;</script>`；
  - 把第一个 `<title>…</title>` 替换为“站点名 - AI API Gateway”；
  - 按**字节匹配** `<link rel="icon"` 定位并替换 favicon 链接。
- 对前端的硬约束：
  - 导出的 `index.html` 必须包含字面量 `</head>`、一个 `<title>`，以及一个**以 `<link rel="icon"` 开头**的 link 标签（`rel` 必须是第一个属性，与原 Vue 版一致，默认指向 `/logo.svg`）。
  - 只有根 `index.html` 会被注入，其他 HTML 永远不会被后端以注入方式返回。
- 后端对注入后的 HTML 设置 `no-store`，设置变更时缓存失效。前端不必处理 HTML 缓存。
- 如果 `dist` 中存在与路由同名的目录，Go 的 FileServer 会把 `/admin/orders` 301 重定向到 `/admin/orders/`。因此**导出产物中不得出现任何与路由同名的目录**（见 §5.10 后处理）。
- 运维可在运行目录 `data/public/` 放置同名文件覆盖嵌入的静态文件（例如替换 `logo.svg`）。新前端应保留 `public/logo.svg` 这一文件名。

### 3.3 CSP 与 nonce（决定框架形态的关键）
- 后端默认开启 CSP：`script-src 'self' 'nonce-…'` 加白名单域名（Cloudflare、阿里云、腾讯、Stripe、Airwallex），**不允许 `unsafe-inline`，也不允许 `unsafe-eval`**；`style-src` 允许 `'unsafe-inline'`；`font-src 'self' data: fonts.gstatic.com`；`img-src 'self' data: blob: https:`；`connect-src 'self' https:` 及部分域名；`worker-src 'self' blob:`；`frame-src` 为 self 加支付、验证码域名，并动态追加自定义菜单的 iframe 源；`frame-ancestors 'none'`；`X-Frame-Options: DENY`。
- 三种服务模式：
  1. **正常模式**：返回的 index.html 中 nonce 占位符会被替换为真实 nonce。
  2. **legacy 模式**（创建带注入的前端服务失败时的回退）：**不注入、不替换 nonce**，但 CSP 依然生效。
  3. **安装向导模式**（首次运行、未配置时）：CSP 强制开启，前端服务走 legacy 路径，**不注入、不替换 nonce**。
- 对前端的硬约束：
  - 导出的 HTML 中**不得有任何内联可执行脚本**（`type="application/json"` 这类数据块不受限制）。主题初始化等“首屏前必须执行”的逻辑必须放到 `public/` 下的外链脚本文件中。
  - 运行时代码和所有依赖**不得使用 `eval`、`new Function`、字符串形式的 `setTimeout`**。
  - 不得注入内联 `<script>`，包括第三方库自动注入的（例如 next-themes 的防闪脚本、某些统计 SDK）。
  - 动态插入的外链脚本只能来自同源或 CSP 白名单域名（验证码、Stripe、Airwallex 已在白名单中）。
  - 字体不得依赖 `fonts.googleapis.com` 以外的外部样式源（推荐全部本地托管）。

### 3.4 保留路径（前端路由和静态资源都不得占用）
- 后端会绕过前端、直接交给网关或 API 处理的路径：`/api/*`、`/v1/*`、`/v1beta/*`、`/backend-api/*`、`/antigravity/*`、`/setup/*`（注意 `/setup` 本身仍是前端页面）、`/health`、`/models` 和 `/models/*`、`/responses` 和 `/responses/*`、`/chat/completions`、`/embeddings`、`/messages/count_tokens`、`/alpha/search`、`/web_search`、`/x_search`、`/tts`、`/stt`、`/realtime`、`/custom-voices*`、`/contents/generations/tasks*`、`/v3/contents/generations/tasks*`、`/images/*`、`/videos*`，以及 3 个 `/.well-known/oauth-*` 路径。
- SecurityHeaders 把以 `/images` 或 `/responses` 开头的任意路径视为 API（不下发 CSP）。
- 结论：
  - `public/` 下**禁止**出现 `images/`、`models/`、`videos/` 等目录；静态图片统一放在 `public/static/`、`public/brand/` 之类的目录。
  - 新增任何前端路由前，都要对照此清单。

### 3.5 静态资源缓存
- 后端只给 `assets/` 下“文件名以 `-` 加 8 位哈希结尾”的文件下发 `immutable` 长缓存（这是为 Vite 设计的规则）。Next 的产物位于 `/_next/static/`，**得不到长缓存**。嵌入式文件系统没有修改时间，因此也没有协商缓存。
- 影响：资源仍然正确（HTML 不缓存，资源带内容哈希），但重复访问会重新下载 JS。
- 对策（不改后端）：在 R5 实现**只缓存内容哈希静态资源的 Service Worker**（缓存优先；永不缓存 HTML 和 API），并在部署文档中给出反向代理或 CDN 对 `/_next/static/*` 设置 immutable 的推荐配置。详见 R5。

### 3.6 API 契约
- 全部保持 §2.6 的行为。新前端 API 层的移植原则是“行为逐字等价”，并用现有的 `client.spec.ts`、`tokenRefresh.spec.ts` 等测试来证明。
- 后端会按 `timezone` 参数计算默认日期范围，按 `Accept-Language` 返回本地化错误信息，按 `X-Admin-UI-Request` 区分管理端 UI 请求（用于审计和限流），这三项缺一不可。

### 3.7 浏览器存储（升级兼容）
- 附录 B 列出的所有 localStorage 和 sessionStorage 键名、值格式必须原样沿用。
- 新增键统一使用 `sub2api:` 前缀，且不得与旧键冲突。

### 3.8 不可更改的 URL
- 附录 A 中的全部路径。原因包括：后端会生成 OAuth 回调地址、支付返回地址、邮件中的验证和重置链接、MCP OAuth 授权页链接；第三方会回跳到这些地址；运营方配置的自定义菜单也指向它们。
- 查询参数语义同样不变：`redirect`、`aff`、`code`、`state`、`error`、`error_description`、fragment 中的令牌字段、支付结果页的订单参数等。

---

## 4. 技术方案与选型

### 4.1 架构决策记录：为什么是 Pages Router + 静态导出

| 候选方案 | 结论 | 关键理由 |
|---|---|---|
| App Router + 静态导出 | 否决 | 导出的 HTML 依赖内联 `self.__next_f` 脚本完成水合。正常模式下需要后处理补 nonce；安装向导模式和 legacy 模式下 nonce 不会被替换，CSP 会拦截脚本，页面无法启动 |
| Next 独立 Node 服务（SSR） | 否决 | 需要改部署拓扑（双进程或反向代理）。`__APP_CONFIG__` 注入、CSP、HTML 缓存失效都要在 Node 侧重做，与“后端不动、形态不变”冲突 |
| Pages Router + 静态导出 | **采用** | 产物只有外链脚本和 JSON 数据块，三种服务模式都满足 CSP；纯客户端页面不需要数据接口；文件路由加深链纠正即可与后端的 SPA 回退完美配合；仍然享有 Next 的文件路由、自动代码分割、链接预取、SWC 编译、`next/font` 本地字体和统一工程规范 |

> 说明：在静态导出模式下，SSR、Server Actions、Middleware、API Routes、ISR、图片优化本来就都不可用，因此 App Router 的主要优势在本项目中无法兑现。Pages Router 仍是 Next 官方长期支持的路线。

**备选兜底（仅在 R1 验证失败时启用）**：如果 Pages Router 的深链纠正在某些浏览器上出现无法规避的问题，退回“单页壳”方案：只导出根页面，页面内部挂载客户端路由库（React Router 的 data router 模式）接管全部路由，守卫和注册表设计保持不变。这个切换只影响 §5.3，其余章节不变。

### 4.2 选型表（均为免费、可商用许可证）

| 领域 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 当前稳定主版本 + React 19 + TypeScript strict | 只用 Pages Router；锁定精确版本号 |
| 样式 | Tailwind CSS v4 | 设计令牌全部用 CSS 变量；如果 R2 的兼容性测试发现微信、支付宝内置浏览器有问题，降级到 Tailwind 3.4（shadcn 两者都支持） |
| 组件 | shadcn/ui（源码拷入项目）+ Radix UI | 可访问性内建；源码可控，方便深度定制商业视觉 |
| 图标 | lucide-react；模型和厂商图标沿用现有 SVG path 数据，也可用 @lobehub/icons 的 React 版 | 不引入付费图标集 |
| 表格 | TanStack Table + TanStack Virtual | 服务端分页、排序、列显隐、列宽、批量选择、虚拟滚动 |
| 表单 | React Hook Form + Zod | 非受控输入，保证超大表单（系统设置）性能 |
| 图表 | Recharts（经 shadcn Chart 封装） | 替换 Chart.js；按需懒加载 |
| 反馈 | sonner（Toast）、Radix Dialog/AlertDialog/Sheet/Popover/Tooltip | — |
| 命令面板 | cmdk | 实现 ⌘K 全局搜索导航（商业化体验加分项） |
| 日期 | date-fns + react-day-picker | 日期区间选择、相对时间、时区展示 |
| 拖拽 | dnd-kit | 替换 vue-draggable-plus |
| 全局状态 | Zustand | 与 Pinia store 一一映射 |
| 服务端状态 | TanStack Query | 缓存、轮询、取消、失效 |
| 国际化 | i18next + react-i18next + 自研 vue-i18n 格式兼容层 | 见 §5.7 |
| 沿用 | axios、marked、DOMPurify、qrcode、xlsx、file-saver、driver.js、@stripe/stripe-js、@airwallex/components-sdk | 保证行为一致，且全部按需懒加载 |
| 字体 | `next/font/local` 托管拉丁字体（如 Inter 或 Geist）；中文使用系统字体栈 | 禁止构建期联网拉取 Google Fonts（Docker 或国内网络构建会失败） |
| 测试 | Vitest + React Testing Library + jsdom；Playwright（E2E、视觉回归、虚拟 WebAuthn）；axe-core | 与现有 Vitest 体系保持一致 |
| 质量 | ESLint（Next 推荐规则 + TS + react-hooks + jsx-a11y）、Prettier、许可证检查 | — |

### 4.3 版本与工程策略
- 继续使用 Node 24 和 pnpm 9（与 Dockerfile、CI 一致），并提交 `pnpm-lock.yaml`。
- 依赖全部锁定精确版本。新增依赖必须是 MIT、Apache-2.0、BSD 或 ISC 许可证，并通过 `pnpm audit`。
- Docker 构建基于 alpine（musl），要确认 Next 的 SWC musl 二进制会随可选依赖正确安装（R1 演练）。
- 构建时关闭 Next 遥测，由构建脚本自身设置环境变量，不改 Dockerfile。

---

## 5. 目标架构

### 5.1 目录结构（开发期位于 `frontend-next/`，R5 切换后改名为 `frontend/`）
- `pages/`：文件路由，只负责“哪个 URL 对应哪个页面组件”。另有 `_app`（全局 Provider、Boot、门禁、布局编排）、`_document`（html/head 骨架、`<title>`、favicon、主题初始化外链脚本）、`404`。
- `src/api/`、`src/types/`、`src/utils/`、`src/constants/`：**从 Vue 版原样移植，路径保持一致**（便于对照上游和复用测试）。
- `src/app/`：应用核心，包括路由注册表、门禁、Boot、标题管理、导航进度和全局事件桥。
- `src/stores/`：Zustand stores，文件名与 Pinia 版一致。
- `src/hooks/`：替代 composables（如 `useStepUp`、`useTableLoader`、`useClipboard`、`useAutoRefresh` 等，命名一一对应）。
- `src/components/ui/`：shadcn 基础组件（设计系统层）。
- `src/components/`：业务通用组件（DataTable、DateRangePicker、GroupSelector、PlatformIcon、ModelIcon、StatCard、EmptyState、ConfirmDialog、Captcha、TotpStepUpDialog 等）。
- `src/features/<domain>/`：按领域组织的页面实现，如 auth、keys、usage、payment、admin-accounts、admin-groups、admin-settings、ops、risk-control、prompt-audit、plugins、channel-monitor 等。`pages/` 中的文件只做薄封装，引用这里的实现。
- `src/i18n/`：i18n 初始化、兼容层，以及从 Vue 版移植的 `locales/`（格式不变）。
- `src/styles/`：全局样式与设计令牌。
- `public/`：`logo.svg`、`theme-init.js`（主题与 iOS viewport 初始化）、`sw.js`（R5），以及品牌静态资源（放在 `public/static/`）。
- `scripts/`：构建前代码生成（合规文档）、构建后处理（SPA 化、校验、拷贝到后端 dist）。
- `e2e/`：Playwright 用例、夹具和种子数据说明。

### 5.2 启动序列（首屏）
1. 浏览器解析 index.html：`theme-init.js` 同步执行（外链脚本，满足 CSP），设置 `dark` class 和 iOS viewport。正常模式下，后端注入的 `__APP_CONFIG__` 脚本已位于 `</head>` 前，会在 Next 的 defer 脚本之前执行。
2. `_app` 首次渲染只输出与构建期一致的启动骨架（品牌占位加加载指示），确保水合一致。
3. 客户端 effect 依次执行：
   a. 从 `__APP_CONFIG__` 同步初始化 app store（不存在则跳过，后续通过接口拉取）；
   b. 设置标题和 favicon；
   c. 初始化 i18n（加载当前语言包，设置 `<html lang>`）；
   d. 从 localStorage 恢复登录态（启动自动刷新计时器）；
   e. **深链纠正**（§5.3.3）；
   f. 门禁判定（§5.3.4），通过后才渲染目标页面；
   g. 后台查询安装状态和公开设置（与 App.vue 行为一致）。
4. 整个过程中不渲染任何受保护内容，避免闪现。

### 5.3 路由体系

#### 5.3.1 文件路由
- 附录 A 中的每个路径都对应一个 `pages/` 文件。动态路由有两个：`/legal/[documentId]`、`/custom/[id]`。
- 所有页面都**禁止**使用 `getStaticProps`、`getServerSideProps`、`getStaticPaths`，保持纯客户端，这样客户端导航只加载页面 chunk，不请求任何数据文件。
- 重定向型路由（`/`→`/home`、`/admin`→`/admin/dashboard`、`/admin/channels`→`/admin/channels/pricing`、`/admin/affiliates`→`/admin/affiliates/invites`）同样建立页面文件，由门禁统一执行替换跳转。

#### 5.3.2 路由注册表（单一事实来源）
- 一份集中的注册表描述所有路由：路径模式、布局类型（public、auth、console-user、console-admin、blank）、`requiresAuth`（**默认 true**，与 Vue 一致）、`requiresAdmin`、`requiresPayment`、`requiresRiskControl`、`requiresSubscription`、`title`、`titleKey`、`descriptionKey`、菜单归属、图标、是否在菜单中隐藏、简易模式是否受限、后端模式白名单标记。
- 侧边栏菜单、面包屑、命令面板、标题、门禁、深链纠正都从注册表读取，避免多处维护。
- 新增路由时有单元测试校验：注册表与 `pages/` 文件一一对应；任何路径都不与 §3.4 的保留路径冲突。

#### 5.3.3 深链纠正（Boot）
- 场景：用户直接访问或刷新 `/admin/users?page=2#x`，后端返回根 index.html，此时 Next 认为当前页面是 `/`（Boot 页）。
- 规则：
  - 首次挂载时读取 `window.location` 的 pathname、search 和 hash。
    - pathname 为 `/` 时替换到 `/home`；
    - 匹配注册表中的某个路由时，用 Next 路由执行 `replace` 到完整原始 URL（**必须保留 search 和 hash**，OAuth 回调的令牌在 fragment 里）；
    - 匹配不到时**不跳转**，直接在当前壳内渲染 404 页面，以防 Next 加载失败后硬刷新、再回到 Boot、形成死循环。
  - 应用内跳转统一经过一个“安全导航”封装：目标先查注册表，未知路径渲染 404；外部链接用新窗口打开。自定义菜单、公告链接等由运营配置的地址都必须走这个封装。
  - 防循环保护：用 sessionStorage 记录纠正次数和时间窗口，短时间内重复纠正时停止并展示错误页（含“清除缓存并重试”按钮）。
  - 纠正完成前一直显示启动骨架，Boot 页本身不执行任何业务请求。
- 发版后旧标签页加载不到新 chunk 时，Next 会硬导航到目标 URL，后端返回新的 index.html，再次纠正即可恢复，无需额外处理（R1 验证）。

#### 5.3.4 门禁（RouteGate）
- 位于 `_app`，在初次纠正完成后以及每次路由变化时（Next 路由事件）运行，**严格按 §2.5 的顺序**实现。所有分支都有表驱动单元测试覆盖。
- 门禁判定期间不渲染目标页面；需要重定向时使用 `replace`，未登录时携带 `redirect` 参数。
- 登录成功后按 `redirect` 返回。`redirect` 只接受站内相对路径，防止开放重定向。

#### 5.3.5 其他路由行为
- 滚动：开启 Next 的滚动恢复，新页面置顶，前进和后退时恢复位置。
- 导航进度条：监听路由开始、完成、出错事件。
- 标题：由一个集中的标题管理钩子按注册表、站点名、语言和计费模式计算，并直接写 `document.title`。不使用 `next/head` 管理标题，避免与后端注入的标题打架。
- 链接预取：控制台菜单启用预取，大型管理页面由预取在空闲时加载。

### 5.4 布局体系
| 布局 | 适用 | 要点 |
|---|---|---|
| PublicLayout | `/home`、`/model-plaza`、`/legal/*`、`/key-usage` | 营销级顶栏和页脚；页脚含法律文档、联系方式、文档链接（来自公开设置） |
| AuthLayout | 登录、注册、找回、重置、邮箱验证、MCP 授权 | 左右分栏（品牌叙事加表单），移动端单栏 |
| ConsoleLayout（用户/管理） | 所有控制台页 | 统一外壳：顶栏（站点 Logo、全局搜索 ⌘K、公告铃、语言、主题、用户菜单、“用户控制台/管理后台”切换），可折叠侧栏（分组导航、自定义菜单项），面包屑，页头（标题、描述、主操作区）；折叠状态持久化 |
| BlankLayout | OAuth 回调、支付弹窗、支付结果、安装向导 | 最小化外壳，居中状态卡片 |
- 布局在 `_app` 中按注册表选择并持久存在，路由切换时外壳不重新挂载，侧栏滚动位置保留（对应原 `sidebarScrollTop`）。

### 5.5 数据层
- **移植**：`src/api/**` 原样拷贝，改动只限于三处：
  1. 构建变量从 `import.meta.env.VITE_API_BASE_URL` 改为 `process.env.NEXT_PUBLIC_API_BASE_URL`（默认 `/api/v1`）；
  2. `client.ts` 中获取当前语言的依赖改指向新的 i18n 模块；
  3. 所有模块的顶层代码不得访问 `window`、`localStorage`（构建期预渲染会在 Node 中执行模块；浏览器 API 只能在函数调用时访问）。
- **调用方式**：页面通过 TanStack Query 调用原 API 函数（API 函数本身不变）。
  - 查询键约定为“领域 + 资源 + 参数”。
  - 4xx 不重试，网络错误和 5xx 最多重试一次。
  - 支持 AbortSignal 取消（Axios 原生支持）。
  - 轮询类页面统一使用 refetchInterval，页面不可见时暂停。轮询类页面包括：运维看板、渠道监控、批量生图任务、支付状态、订阅状态。
  - 变更成功后精确失效相关查询。
- **错误呈现**：统一使用现有 `utils/apiError` 提取文案。全局 Toast 与表单字段级错误分开处理。Step-up 取消错误静默。`AUTH_SESSION_CHANGED` 和 `TOKEN_REFRESH_UNAVAILABLE` 不提示“已退出”。
- **流式**：账号测试的 SSE 沿用 fetch + reader 读取，组件卸载时取消。
- **文件下载**：导出（xlsx）、备份下载和批量生图下载沿用原有逻辑，xlsx 动态导入。

### 5.6 状态管理（Pinia → Zustand 映射）
| 原 store | 新 store | 关键迁移点 |
|---|---|---|
| auth | auth | 令牌和用户的持久化键不变；自动刷新计时器（setInterval + 到期前定时）放在 store 内，由 `_app` 统一启停，必须兼容 React StrictMode 下 effect 双次执行（幂等）；pending auth session；run mode（simple/standard） |
| app | app | 侧栏、Toast（改由 sonner 承载，但保留 showSuccess/showError 等同名 API）、公开设置加载（去重、强制刷新、注入初始化）、版本信息、后端模式计算属性 |
| adminSettings | adminSettings | 管理员自定义菜单等，供侧栏和标题使用 |
| adminCompliance | adminCompliance | 合规状态和待确认弹窗 |
| announcements | announcements | 节流拉取、已读状态、弹窗队列 |
| onboarding | onboarding | driver.js 引导进度 |
| payment | payment | 支付配置缓存（`payment_enabled_cached`） |
| subscriptions | subscriptions | 订阅列表与轮询 |
- 跨组件全局事件（`admin-compliance-required`、`ops-monitoring-disabled`）由 `_app` 内的事件桥统一订阅，再转换为 store 动作。

### 5.7 国际化
- 语言包：从 Vue 版原样移植 `locales/en`、`locales/zh` 目录结构和文件，键名与格式完全不变，按语言动态导入。
- 兼容层：
  - 插值使用单花括号 `{name}`；
  - 处理 `a | b` 形式的复数选择（当前共 10 处，按 count/n 选择）；
  - 加载时把 vue-i18n 的字面量转义 `{'@'}`、`{'{'}`、`{'}'}`（共 18 处）还原为字面字符；
  - 关闭 i18next 的 HTML 转义（React 已负责转义）；
  - 少量含 HTML 的文案（约 27 条，主要用于新手引导）必须经过 DOMPurify 渲染。
- 语言检测与 Vue 一致：先读 localStorage 的 `sub2api_locale`，再看浏览器语言是否以 zh 开头，默认 en。切换语言时同步更新 `<html lang>`、标题、日期库 locale，并影响后续请求的 `Accept-Language`。
- 保留语言包键完整性测试（中英键集合一致），作为 `check:i18n` 脚本在 build 前执行。
- i18n 实例必须在客户端惰性创建，不能在模块顶层读取 localStorage。

### 5.8 主题、品牌与设计令牌
- 令牌层：颜色（background、foreground、muted、card、border、ring、primary、secondary、accent、destructive、success、warning、info、chart-1…8）、圆角、阴影、间距、字号、动效时长，全部用 CSS 变量定义，并提供亮色和暗色两套值。
- 品牌：站点名、Logo、副标题来自公开设置；Logo 缺失时显示站点名首字母徽标。品牌主色为编译期令牌，运营方可通过替换令牌文件换肤（本次不新增后端配置项）。
- 暗色模式：沿用 `theme` 键（`light`、`dark`，缺省跟随系统），`dark` class 加在 `<html>` 上。**不使用** next-themes 的内联防闪脚本，改由 `public/theme-init.js` 完成。
- 嵌入页面（自定义页 iframe）的主题参数沿用原约定。

### 5.9 安全规范
- 不写内联脚本、不用 eval、不用字符串定时器；`dangerouslySetInnerHTML` 只允许两类场景：
  1. 经 DOMPurify 清洗的 Markdown 或富文本（公告、合规文档、法律文档、引导文案）；
  2. 管理员配置的 `home_content` 原样渲染（与 Vue 的 v-html 行为一致，脚本不会执行），代码中必须注明风险接受理由。
- `postMessage` 收发双方必须校验 `event.origin`（Stripe 弹窗、插件 iframe），并且只接受约定的消息类型。
- iframe：自定义页和首页 iframe 模式的 `sandbox`、`allow` 属性与 Vue 版保持一致，不得放宽。
- 外部链接使用 `rel="noopener noreferrer"`。
- 令牌只存于既有的 localStorage 键，不写入 URL（OAuth 回调读取 fragment 后立即用 `replaceState` 清除 fragment，与原逻辑一致）。
- 登录后的 `redirect` 只接受以 `/` 开头且不以 `//` 开头的站内路径。
- 生产构建去掉 source map 中的源码内容，或不发布 source map（与原 Vite 默认行为保持一致）。

### 5.10 构建与发布流水线
- `package.json` 保留原脚本名：`dev`、`build`、`check:i18n`、`lint`、`lint:check`、`typecheck`、`test`、`test:run`、`test:coverage`。Makefile、CI 和 Dockerfile 都依赖这些名字。
- `build` 的步骤顺序：
  1. 语言包完整性检查；
  2. 类型检查；
  3. **构建前代码生成**：读取 `../docs/legal/*.md`，生成合规文档的 TS 模块（替代 Vite 的 `?raw` 导入，与打包器无关）；
  4. Next 生产构建（静态导出到 `out/`）；
  5. **构建后处理**：
     a. 删除 `out/` 中除根 `index.html` 外的所有 HTML 及随之变空的目录，消除目录与路由同名导致的 301；
     b. **产物校验**（任一项不满足即构建失败）：存在 `index.html`；含 `</head>`；含 `<title>`；含以 `<link rel="icon"` 开头的标签；不含内联可执行脚本（只允许带 src 的脚本和 JSON 数据块）；`public/` 产物中不含 §3.4 的保留目录名；
     c. 清空 `../backend/internal/web/dist`（保留 `.keep`）并拷贝产物。
- `next.config` 要点：
  - 只在生产构建时启用静态导出；
  - 关闭图片优化；
  - 不设置 basePath；
  - `trailingSlash` 为 false；
  - 开启 React 严格模式与滚动恢复；
  - 开发期 rewrites 仅在开发阶段生效，见 §5.11。
- 环境变量：`NEXT_PUBLIC_API_BASE_URL`（可选，等价原 `VITE_API_BASE_URL`）；开发期使用 `DEV_PROXY_TARGET`（默认 `http://localhost:8080`）和端口 3000。

### 5.11 本地开发
- 开发服务器在 3000 端口，通过开发期 rewrites 把 `/api`、`/v1`、`/v1beta`、`/setup/`、`/health` 代理到后端（对应原 Vite proxy）。
- 开发期没有 `__APP_CONFIG__` 注入，走接口拉取公开设置（原 store 已支持此路径）。
- “真相环境”以后端 `-tags embed` 构建并运行嵌入的产物为准。E2E 测试与验收只在真相环境进行，开发服务器只用于日常开发。
- 提供一键脚本：构建前端、以 embed 方式编译运行后端（使用 deploy 下的开发用 docker compose 启动 PostgreSQL 和 Redis）。

---

## 6. UI/UX 商业化设计规范（与现有 Vue 版彻底区分）

### 6.1 设计语言
- 定位：专业、可信、高信息密度的 AI 基础设施控制台（参考一线云服务和开发者平台的风格基调，但不复刻任何特定产品）。
- 与旧版的区分：旧版是青色主色、玻璃拟态、渐变光晕、大圆角卡片；新版是中性灰阶基底、单一品牌强调色、清晰描边与层级阴影、适中圆角（约 8px）、无玻璃效果、克制的动效。
- 字体：拉丁字母用本地托管无衬线体，数字使用等宽数字特性（金额、令牌数、延迟对齐）；代码和密钥使用等宽字体；中文用系统字体栈（PingFang SC、Microsoft YaHei、Noto Sans CJK）。
- 栅格与间距：4/8 点体系；控制台内容区最大宽度自适应，数据页全宽。

### 6.2 信息架构
- **用户控制台**分组：概览（仪表盘）；API（密钥、用量、批量生图、MCP）；资源（可用渠道、渠道状态、模型广场）；账单（充值/订阅、订单、我的订阅、兑换码）；增长（邀请返利）；账户（个人资料、安全）；自定义菜单。
- **管理后台**分组：概览（仪表盘、运维监控）；用户与订阅；渠道与账号（账号、分组、渠道定价、渠道监控、代理）；商业（订单看板、订单、套餐、兑换码、优惠码、返利）；内容（公告、插件）；安全合规（风控中心、提示词审计、审计日志）；系统设置。
- 菜单项的显隐严格复刻原逻辑：功能开关、简易模式、后端模式、角色、admin access key 权限（`useAdminAccessKeyPermissions`）。
- 全局：⌘K 命令面板，可搜索页面，并提供快捷动作（新建密钥、复制 API 地址、切换主题和语言）。

### 6.3 页面模式规范
- **列表页**：页头（标题、说明、主按钮）→ 筛选条（关键字搜索带防抖、组合筛选、日期区间、重置、已选筛选标签）→ 数据表（列显隐和列宽持久化，沿用原存储键；行选择后显示批量操作栏；行内操作菜单；空态；骨架屏）→ 分页（页大小选项来自公开设置的 `table_page_size_options`，默认值来自 `table_default_page_size`，用户偏好沿用 `table-page-size` 键）。
- **详情和编辑**：简单实体用右侧抽屉（Sheet），复杂实体用全屏对话框或分步表单；危险操作用二次确认（AlertDialog，需要时输入名称确认）；敏感操作走 Step-up。
- **设置页**：左侧分区导航加右侧分节表单。每节独立显示“未保存”标记，离开前提示，页底有粘性保存栏。保存负载结构与原实现完全一致（见 §7.3）。
- **仪表盘**：KPI 卡（数值、环比、迷你趋势）、趋势图、分布图（模型、分组、端点）、最近用量。统一时间范围选择，时区显示与 `server_timezone` 一致。
- **状态全覆盖**：加载（骨架屏）、空（插画加引导动作）、错误（可重试）、无权限、功能未开启（说明加管理员入口）、离线和网络错误提示。

### 6.4 交互与反馈
- 所有异步按钮都有加载态，并防止重复提交；复制操作给出 Toast 反馈；长任务显示进度（导出、批量操作）。
- 表单：失焦和提交时校验；错误就近显示；后端返回的字段级错误映射回字段。
- 键盘：全局快捷键（⌘K，`/` 聚焦搜索，Esc 关闭）；表格支持键盘导航。

### 6.5 响应式与多端
- 断点：360、768、1024、1280、1536。
- 用户控制台与公共页：移动端可完整操作，支付、充值、密钥复制是重点。
- 管理后台：1280 以上最佳；768 至 1280 可用（表格横向滚动，非关键列自动隐藏）；手机端保证可查看和执行基础操作。
- 内置浏览器：微信、支付宝、钉钉内置浏览器必须通过登录、支付、回调全流程测试。

### 6.6 可访问性
- 目标 WCAG 2.1 AA：对比度达标；焦点可见；所有交互元素可用键盘操作；对话框焦点陷阱；表单标签关联；图标按钮带 aria-label；动效尊重 `prefers-reduced-motion`。

### 6.7 文案与本地化
- 不得硬编码中文或英文，全部走 i18n 键。新 UI 新增的文案键同步加到中英两份语言包，并通过完整性测试。
- 金额、数字、日期按当前语言格式化；货币符号沿用原 `payment/currency` 逻辑。

---

## 7. 迁移方法论（保证功能对等）

### 7.1 分层复用策略
| 层 | 策略 |
|---|---|
| api / types / constants / utils | 原样移植，路径不变，只解除 Vue 耦合。已知需要处理的模块：`api/client.ts`（i18n 依赖）、`utils/format.ts`、`utils/featureFlags.ts`、`utils/ipGeoLookup.ts`、`constants/platforms.ts`、`constants/platformCatalog.ts` |
| 纯逻辑测试 | 移植原 spec（api、utils、constants 下的纯 TS 测试），无需或只需极少修改即可通过，作为契约等价的证据 |
| composables | 按同名改写为 hooks，逻辑逐行对照 |
| stores | 按同名改写为 Zustand，公开 API（状态名、动作名）尽量保持一致 |
| 组件与页面 | 按新设计重写；以原 `.vue` 文件作为“需求说明书”，逐项抽取功能点 |

### 7.2 功能对等清单（每个页面一份，作为验收依据）
从原 `.vue` 文件中逐项抽取以下内容，每项在新实现中勾选并附测试用例编号：
- 调用的 API 及参数（含默认值、分页、排序、筛选字段）；
- 展示字段和格式化规则；
- 用户可执行的操作及其确认、Step-up 要求；
- 表单字段、校验规则、默认值、联动逻辑；
- 功能开关和权限分支（管理员、简易模式、后端模式、admin access key 权限、平台类型差异）；
- 错误码到文案的映射；
- 本地持久化键；
- 轮询、刷新逻辑。

原有的组件 spec 测试（387 个）是重要的行为参考：每个原 spec 中的断言场景都应在新的 RTL 或 E2E 测试中有对应用例。

### 7.3 超大页面拆分原则
- **系统设置（13.4k 行）**：按分区拆成独立的 feature 模块。建议分区包括：站点与品牌、注册与登录、第三方登录、验证码、邮件与模板、支付、订阅与计费、默认配额与分组、网关与调度、模型与定价策略、OpenAI 快速策略、风控、通知、MCP、插件、备份与数据管理、管理员 API Key、运维与监控、合规。
  - 数据流：只调用一次读取接口拿到完整设置对象；各分区只编辑自己的字段；保存时**以完整原对象为基底合并改动**后提交，保证未展示和未知字段原样回传，防止误清空。原有的归一化与净化函数（如 normalize/sanitize 系列、`appendAuthSourceDefaultsToUpdateRequest` 等）必须原样复用。
  - 保存前后做脏检查。离开时提示未保存。
- **分组管理（7k 行）**、**账号管理（2.6k 行加 account 子组件）**：列表、筛选、批量操作、编辑抽屉（按平台类型动态切换表单段）、OAuth 授权子流程（OpenAI、Gemini、Antigravity、Grok 等各自独立的 hook）、测试弹窗（SSE）、导入导出、定时测试面板，全部按子模块拆分。
- 拆分以后每个文件控制在约 400 行以内；表单 schema 与 UI 分离。

### 7.4 上游同步策略（长期运营必备）
- 本项目源自上游开源项目，后端可能持续合入上游更新。每次合入后执行“契约同步检查”：对比上游 `frontend/src/api`、`types`、`constants`、`utils`、`i18n/locales`、`router/index.ts` 的变更。前四者可直接按文件同步（路径一致）；语言包可直接同步（格式一致）；路由与页面变更则人工评估后，在新 UI 中实现。
- 在仓库中维护一份“上游前端基线提交号”，记录已同步到哪个版本。

---

## 8. 分轮实施计划与验收（共 5 轮）

> 每轮结束都要产出：可运行的嵌入式构建、自动化测试报告、对等清单勾选结果、截图或录屏（亮色和暗色、桌面和移动）、遗留问题清单。上一轮验收通过后才能进入下一轮。
> 测试环境：使用 deploy 下的 docker compose 启动 PostgreSQL 和 Redis，后端以 `-tags embed` 构建（嵌入新前端），并准备种子数据：管理员、普通用户、开启 TOTP 的用户、各平台账号若干、分组、套餐、订单、公告等。Vue 版同时部署一份，用于并排对比。

### 第 1 轮：基础设施与后端契约打通

**目标**：搭好全部骨架，并在真实后端上证明架构可行。这是风险最高的一轮，完成后其余工作都只是“填页面”。

**范围**
1. 工程初始化：`frontend-next/`、TS strict、ESLint、Prettier、Vitest、Playwright、目录结构、提交钩子。
2. 构建流水线：§5.10 全部步骤，包括构建前代码生成、构建后 SPA 化、产物校验、拷贝到后端 dist。
3. 设计系统：令牌（亮色和暗色）、字体，以及 shadcn 基础组件全集（Button、Input、Textarea、Select、Combobox、Checkbox、Switch、RadioGroup、Dialog、AlertDialog、Sheet、Popover、Tooltip、DropdownMenu、Tabs、Accordion、Badge、Card、Skeleton、Separator、ScrollArea、Table、Pagination、Toast、Progress、Avatar、Calendar），以及业务通用组件第一批（DataTable 封装、DateRangePicker、SearchInput、EmptyState、ConfirmDialog、StatCard、PageHeader、FormField、CopyButton、StatusBadge）。
4. 外壳：四种布局，以及顶栏和侧栏（菜单数据来自注册表，含功能开关、自定义菜单项的显隐逻辑）、主题切换、语言切换、导航进度条、⌘K 骨架。
5. 核心：API 层与 types、utils、constants 的移植；全部 stores；i18n 兼容层；`theme-init.js`；Boot 深链纠正；路由注册表（**附录 A 中全部路由先建占位页**，占位页展示路由元信息）；门禁；标题管理；全局事件桥。
6. 最小可用登录：账号密码登录、TOTP 二次验证弹窗、退出，用于验证令牌流程（完整 UI 在 R2 完成）。
7. 构建演练：在临时分支上把 `frontend-next` 放到 `frontend` 的位置，用**原 Dockerfile** 构建镜像，验证 musl 环境、lockfile 和 docs/legal 路径。

**测试验收**
- 自动化
  - 移植的纯 TS spec 全部通过，至少包括 `client.spec.ts`、`tokenRefresh.spec.ts`、`keys.bulkUpdate.spec.ts`、语言包完整性测试，以及 utils 和 constants 下的现有测试。
  - 门禁表驱动测试：覆盖 §2.5 的每个分支（公开和受保护；已登录访问登录页；模型广场三种开关；后端模式白名单和 pending session；管理员和非管理员；三类功能开关“加载成功且为 false 才拦截”与“加载失败放行”；简易模式受限路径；`/setup` 已安装和未安装）。
  - 注册表测试：与 `pages/` 一一对应；无保留路径冲突；所有 `titleKey` 在两种语言中都存在。
  - 构建产物校验脚本通过（§5.10 第 5 步 b 项各条）。
  - Playwright（真相环境）：
    - 遍历附录 A 全部路由，**直接访问和刷新**都能落到正确的占位页，URL 不被改写，search 和 hash 完整保留；
    - 浏览器后退和前进正确；未知路径显示 404，且不发生刷新循环；
    - 控制台零 CSP 违规、零错误。
- 手工验收
  1. 正常模式：首屏标题和 favicon 立即显示站点配置（来自注入），无闪烁；暗色偏好用户首屏无白闪。
  2. **安装向导模式**：清空数据目录后首次启动，访问任意路径都能进入 `/setup` 占位页，控制台无 CSP 违规（证明没有内联脚本）。
  3. **升级兼容**：先在 Vue 版登录，并设置暗色、英文、表格页大小；切换为 Next 版二进制后刷新，登录态、主题、语言、页大小全部保留。
  4. 令牌刷新：把 access token 改成过期值后发起请求，能静默刷新并重放；两个标签同时触发时只刷新一次；refresh token 失效时跳转登录页并提示会话过期。
  5. 请求头和参数：抓包确认 Authorization、Accept-Language、GET 请求的 timezone、管理端的 `X-Admin-UI-Request` 都与 Vue 版一致。
  6. 原 Dockerfile 构建成功，镜像启动后功能同上。
- 通过标准：以上全部通过。若深链纠正在任何主流浏览器上无法稳定工作，本轮内切换到 §4.1 的兜底方案，并重新验收。

### 第 2 轮：公共站点、认证体系、安装向导

**范围（页面）**：`/home`（营销首页；`home_content` 的 iframe 和 HTML 两种模式；精简首页开关）、`/login`、`/register`、`/email-verify`、`/forgot-password`、`/reset-password`、`/auth/callback`、`/auth/linuxdo/callback`、`/auth/wechat/callback`、`/auth/dingtalk/callback`、`/auth/dingtalk/email-completion`、`/auth/oidc/callback`、`/key-usage`、`/legal/[documentId]`、`/model-plaza`、`/setup`、`/oauth/mcp/authorize`、404 和通用错误页。

**关键技术点**
- 登录：密码、TOTP、Passkey（WebAuthn 发起与断言）、三种验证码组件（按公开设置择一；脚本动态加载，域名在 CSP 白名单内）、全部第三方登录按钮（按开关显示；微信区分开放平台、公众号、移动端）、登录协议同意（`sub2api_login_agreement_consent` 加版本号）、后端模式下的行为、`auth_expired` 提示、`redirect` 回跳。
- 注册：邀请码、优惠码、邮箱后缀白名单（含通配）和域名配额策略、邮箱验证码、推广码（URL 中的 `aff` 写入 `affiliate_referral_code` 和 `oauth_aff_code`）、`register_data` 暂存。
- OAuth 回调：读取 query 和 fragment，读取后清除 fragment；pending OAuth 的“创建账号或绑定已有账号”流程；钉钉邮箱补全；邮箱 OAuth 的 pending provider；错误态展示和返回登录入口。
- 安装向导：多步骤（数据库、Redis、管理员、站点等，字段与原向导完全一致），只调用 `/setup/*` 接口；完成后按原逻辑跳转。
- 模型广场：公开展示，按开关和强制登录控制，筛选和搜索，模型与厂商图标。
- 法律文档：渲染构建期生成的 Markdown（DOMPurify）。

**测试验收**
- 自动化：
  - 各表单的校验单测；
  - 回调页解析单测：用 fragment 和 query 的各种组合，覆盖 legacy 格式；
  - Playwright E2E：
    - 注册（含邮箱验证码，测试 SMTP 用本地邮件捕获服务）→ 登录 → 退出；
    - TOTP 登录；
    - Passkey 注册与登录（Playwright 虚拟认证器）；
    - Turnstile 使用官方测试 sitekey；
    - 找回和重置密码（从邮件链接进入）；
    - 各 OAuth 回调：构造回调 URL 直接访问，验证令牌写入、fragment 清除、跳转；
    - 后端模式开启后的访问白名单；
    - 全新数据库走完安装向导；
    - MCP 授权同意页（需要登录、拒绝、同意）。
- 手工：
  - 微信内置浏览器完成微信登录；
  - 钉钉内置浏览器完成钉钉登录；
  - 中英文切换覆盖所有页面；
  - 360px 宽度下所有页面可用；
  - Lighthouse 检测 `/home` 和 `/login`；
  - axe 扫描无严重问题。
- 通过标准：
  - 对等清单 100% 勾选；
  - 上述 E2E 全部通过；
  - `/home`、`/login` 的 Lighthouse 性能 ≥ 90（桌面）、可访问性 ≥ 95；
  - 首屏 JS（gzip）≤ 200KB。

### 第 3 轮：用户控制台与商业化支付链路

**范围（页面）**：`/dashboard`、`/keys`、`/usage`、`/redeem`、`/affiliate`、`/available-channels`、`/monitor`、`/subscriptions`、`/purchase`、`/orders`、`/payment/qrcode`、`/payment/result`、`/payment/stripe`、`/payment/airwallex`、`/payment/stripe-popup`、`/auth/wechat/payment/callback`、`/profile`、`/settings/mcp`、`/batch-image`（含使用指南）、`/custom/[id]`。另有全局组件：公告铃与公告弹窗、新手引导、订阅进度迷你组件、余额和配额提醒。

**关键技术点**
- 密钥：创建、编辑、删除、启用与停用；分组选择（含容量与倍率徽标）；额度、过期、IP 白名单等字段；批量更新（复用 `keys.bulkUpdate` 逻辑）；CC Switch 导入 deeplink（尊重 `hide_ccs_import_button`）；Codex 配置生成；列设置持久化（沿用原键）；密钥掩码与复制。
- 用量：多维筛选、日期区间（含服务器时区）、统计卡与趋势图、明细表、错误请求详情（受 `allow_user_view_error_requests` 控制）、导出 Excel、平台用量拆分。
- 渠道状态：v1 和 v2 两种模式（按 `channel_monitor_mode`），时间线、可用性矩阵、排名，按开关隐藏吞吐、配额和排名。
- 充值和订阅：计费模式（仅充值、仅订阅、两者）决定标题与布局；金额输入与赠送规则（`rechargeBonus`）；套餐卡；支付方式选择（按可见方式来源配置）；支付提供方差异：
  - Stripe 有内嵌和弹窗两种形态，弹窗使用 postMessage 握手并校验 origin；
  - Airwallex 区分生产和 demo 环境；
  - 二维码支付包括轮询状态和支付宝 deeplink；
  - 微信 JSAPI 支付先走 OAuth 回调获取 openid。
- 支付恢复（`payment.recovery.current`），结果页按订单轮询，订单列表。
- 个人资料：头像、基本信息、修改密码、TOTP 启用与停用、Passkey 管理、第三方身份绑定与解绑、余额提醒设置、用户自定义属性表单。
- 批量生图：通过网关 `/v1/images/batches*` 调用（使用用户 API Key，按原逻辑）；任务列表、子任务展开、取消、下载、轮询。
- 自定义页：iframe 嵌入，并按原约定拼接 query 参数（token、lang、theme、user_id、src_host、src_url、ui_mode）。
- 公告：按 §2.4 的拉取规则；弹窗队列与已读状态。新手引导：driver.js 步骤与原 `Guide/steps.ts` 一致，但样式改为新设计。

**测试验收**
- 自动化：
  - 支付流程单测：金额校验、赠送计算、方式过滤、恢复逻辑；
  - Playwright E2E：
    - 密钥全生命周期；
    - 用量筛选与导出（校验下载的文件可解析）；
    - 兑换码兑换；
    - Stripe 测试模式下完成一次充值（测试卡，含 3DS 场景）和一次订阅购买，结果页状态正确、余额和订阅更新；
    - Airwallex demo 环境完成一次支付；
    - 二维码支付的状态轮询到成功（使用后端测试或沙箱渠道）；
    - 支付中途关闭页面后能恢复；
    - 简易模式下 `/redeem`、`/subscriptions` 被拦截；
    - 订阅功能关闭时 `/subscriptions` 被拦截，且不再轮询订阅接口。
- 手工：
  - 手机端（iOS Safari、Android Chrome）完成充值；
  - 微信内置浏览器完成微信支付链路；
  - 支付宝内置浏览器完成支付宝跳转；
  - 公告首登 3 秒弹出；
  - 新手引导走完；
  - 暗色模式全页面检查。
- 通过标准：
  - 对等清单 100% 勾选；
  - 支付相关 E2E 零失败（连续 3 次运行稳定）；
  - 控制台页面路由切换后可交互时间 ≤ 300ms（本地环境）；
  - 无内存泄漏（轮询页停留 10 分钟，内存稳定）。

### 第 4 轮：管理后台（一）核心运营资源

**范围（页面）**：`/admin/dashboard`、`/admin/users`、`/admin/groups`、`/admin/accounts`、`/admin/channels/pricing`、`/admin/channels/monitor`、`/admin/subscriptions`、`/admin/proxies`、`/admin/redeem`、`/admin/promo-codes`、`/admin/announcements`、`/admin/usage`、`/admin/affiliates/invites`、`/admin/affiliates/rebates`、`/admin/affiliates/transfers`、`/admin/orders/dashboard`、`/admin/orders`、`/admin/orders/plans`。另有全局组件：管理员合规确认对话框（423，内嵌合规文档）、Step-up TOTP 对话框、admin access key 权限控制。

**关键技术点**
- 用户：列表（用量排序持久化）、余额与并发调整、角色与状态、自定义属性配置、平台配额、批量操作、错误请求详情。
- 分组：拆分实现（§7.3）。覆盖复合分组、模型白名单（复用 `useModelWhitelist` 逻辑）、倍率与定价、调度阈值、平台配额、复制分组（沿用原复制键前缀）、列设置。
- 账号：按平台动态表单；各平台 OAuth 授权子流程；重新授权；测试弹窗（SSE 流式输出，可中断）；统计弹窗；定时测试面板；导入导出（Step-up）；批量操作栏；筛选和排序持久化；自动刷新（沿用 `account-auto-refresh`）；配额重置、OpenAI 推荐关系等专用单元格；IP 归属地批量查询。
- 渠道定价与渠道监控（含监控模板、v2 设置面板、趋势图、排名）。
- 代理：列表、批量导入（格式校验）、到期提醒、连通性测试。
- 订单看板与套餐编辑；返利的邀请、返还、转账与线下提现对话框。
- 所有危险操作二次确认；需要 Step-up 的操作统一由 `useStepUp` 等价 hook 包裹。

**测试验收**
- 自动化：
  - 每个资源的 CRUD E2E；
  - Step-up：后端要求 Step-up 时弹窗、输入 TOTP、自动重放；取消时静默；
  - 423 合规：未确认时任意管理接口触发弹窗，确认后恢复；
  - 账号测试 SSE：收到流式输出、可中断、错误展示；
  - 分组和账号表单：各平台类型的字段可见性快照测试（与原实现对照表一致）；
  - 列设置和筛选持久化键与 Vue 版一致（升级后保留）。
- 性能：账号和用户列表在 1 万条数据下，服务端分页切页 ≤ 500ms；本地虚拟滚动列表滚动帧率稳定（≥ 50fps）。
- 手工：
  - 管理员 access key 受限权限下，菜单与操作正确隐藏或禁用；
  - 简易模式下管理端受限页拦截；
  - 1280px 与 768px 布局检查。
- 通过标准：对等清单 100% 勾选（逐字段核对分组与账号表单）；E2E 全绿；无 P0/P1 缺陷遗留。

### 第 5 轮：管理后台（二）系统级、全量回归与切换上线

**范围（页面）**：`/admin/settings`（全部分区，含邮件模板编辑器与预览、SMTP 测试、管理员 API Key、过载冷却、OpenAI 快速策略用户选择器、备份与数据管理、图片存储配置）、`/admin/ops`（运维看板：吞吐、错误、切换率、并发、令牌统计、告警规则与事件、系统日志、请求和错误详情、运行时设置、邮件通知；运维关闭时的跳转逻辑）、`/admin/audit-logs`、`/admin/risk-control`、`/admin/prompt-audit`、`/admin/plugins`（iframe 桥接协议与原实现一致）。另有：版本徽章与更新检查（`/health`）、自定义菜单项管理联动。

**关键技术点**
- 设置页：一次读取、分区编辑、合并保存（§7.3）。每个分区保存后用快照测试比对提交负载，确保与 Vue 版对同一操作产生的负载**逐字段一致**。
- 运维看板：图表懒加载；自动刷新且页面不可见时暂停；收到 `ops-monitoring-disabled` 时的处理。
- 插件：iframe 加载、消息桥接（校验 origin 与消息类型）、高度自适应。
- 静态资源缓存优化：实现只作用于 `/_next/static/` 的 Service Worker（缓存优先；新版本激活后清理旧缓存；HTML、API 和网关路径一律不拦截；提供紧急注销开关）。同时补充部署文档中反向代理的缓存配置。

**全量回归与上线准备**
- 全部 Playwright E2E 套件、单测、视觉回归（关键页面亮色和暗色、桌面和移动基线截图）。
- 安全检查：产物无内联脚本；依赖审计；许可证检查；postMessage 和 iframe 审查；`redirect` 开放重定向测试；XSS 输入测试（公告、自定义菜单名、用户名等展示位）。
- 三种后端服务模式再验证（正常、legacy、安装向导）。
- 浏览器矩阵：Chrome、Edge、Firefox、Safari 最近两个大版本；iOS Safari 16.4 及以上；Android Chrome；微信、支付宝、钉钉内置浏览器。
- **切换**：
  1. 将 Vue 版 `frontend/` 打标签留档，然后从主线移除；
  2. 把 `frontend-next/` 改名为 `frontend/`；
  3. 更新根 Makefile 的 `FRONTEND_CRITICAL_VITEST` 为新测试路径（纯 TS 测试路径保持原样）；
  4. 更新 `.gitignore`、`.dockerignore`，重建 `audit.json`；
  5. CI（backend-ci、security-scan、release）全绿；
  6. 原 Dockerfile 构建镜像，goreleaser 做一次 dry-run；
  7. 预发布环境灰度运行 48 小时。
- **回滚**：回滚方式为发布上一版镜像或二进制（前端随二进制发布，回滚即整体回滚）。由于存储键完全兼容，新旧版本互切不影响用户登录态。

**测试验收**
- 自动化：全部套件通过；设置负载快照测试全部一致；Service Worker 测试（首次访问后再次访问时 JS 命中缓存；发新版后加载新资源；HTML 永不被缓存；注销开关生效）。
- 手工：
  - 运营人员按对等总清单走查全站；
  - 预发布环境用真实配置连续运行 48 小时，无 P0/P1 缺陷，错误监控无新增异常；
  - 安装向导从零部署走通。
- 通过标准：§1.4 的 DoD 全部满足，§9 的质量门禁全部达标，切换后的 CI 与镜像构建成功，回滚演练成功一次。

---

## 9. 全局质量门禁

| 类别 | 门禁 |
|---|---|
| 正确性 | 对等清单 100%；E2E 全绿且连续 3 次运行稳定；零 P0/P1 |
| 契约 | 产物校验脚本通过；三种服务模式零 CSP 违规；请求头和参数与 Vue 版抓包一致；存储键一致 |
| 类型与规范 | TS strict 零错误；ESLint 零错误；不使用 `any`（移植文件中原有的除外，并列出清单） |
| 测试 | 移植的纯逻辑测试 100% 通过；新 hooks 和 stores 覆盖率 ≥ 80%；门禁分支覆盖 100% |
| 性能 | 公共页 LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1；首屏 JS（gzip）≤ 200KB；图表、xlsx、支付 SDK、driver.js、Markdown 均按需加载 |
| 可访问性 | axe 零 serious/critical；关键流程可纯键盘完成 |
| 兼容 | §8 第 5 轮的浏览器矩阵全部通过 |
| 安全 | 依赖审计无高危（或已登记豁免）；许可证合规；无内联脚本或 eval；postMessage 校验 origin |
| 国际化 | 中英键完整；无硬编码文案；360px 下中英文均不溢出 |

---

## 10. 风险登记与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Pages Router 深链纠正在个别浏览器或场景下异常（如 query、hash 处理，水合时自动 replace） | 架构级 | R1 首周完成穷举验证；准备 §4.1 的兜底方案（单页壳加客户端路由），切换成本限定在路由层 |
| 依赖或库引入内联脚本或 eval，违反 CSP | 页面白屏 | 构建产物校验；R1 起所有 E2E 在后端 CSP 下运行；新依赖准入检查 |
| 规模大（约 15 万行 Vue） | 进度 | 逻辑层原样移植；页面按对等清单推进；超大页面拆分并行；每轮严格验收，不积压 |
| 设置页提交负载与原实现不一致，导致误清空配置 | 生产事故 | 合并保存策略；逐分区负载快照对比测试 |
| 静态资源无长缓存 | 重复访问变慢 | Service Worker 缓存哈希资源；部署文档给出反向代理配置 |
| Tailwind v4 在旧内核内置浏览器上兼容性不足 | 部分移动用户样式异常 | R2 内置浏览器实测；不满足时降级到 Tailwind 3.4 |
| 构建期模块访问浏览器 API 导致构建失败 | 构建失败 | 移植规范禁止模块顶层访问浏览器 API；预渲染只渲染启动骨架 |
| React 严格模式下 effect 双执行导致重复轮询或重复刷新令牌 | 资源浪费或竞态 | 计时器与轮询集中管理并保证幂等；令牌刷新沿用跨标签锁与单飞 |
| 上游持续演进，前端契约漂移 | 功能缺失 | §7.4 同步机制；api、types、语言包路径与格式保持一致 |
| 第三方支付或验证码沙箱不可用 | 验收受阻 | 尽早申请测试账号与测试密钥；无沙箱的渠道使用后端测试渠道或人工验收 |
| SEO | 与现状相同（SPA） | 公共页标题和描述运行时设置；本次不引入 SSR（如需 SEO，应在后续单独评估，且需要后端配合） |

---

## 附录 A：路由映射总表

> “访问”列：公开 = `requiresAuth: false`；登录 = 需要登录；管理 = 需要管理员。“附加”列：支付 = `requiresPayment`；风控 = `requiresRiskControl`；订阅 = `requiresSubscription`；简易受限 = 简易模式下禁止访问；后端白名单 = 后端模式下未登录也可访问。

| URL | 访问 | 附加 | 布局 | 轮次 |
|---|---|---|---|---|
| `/` | 公开 | 重定向 `/home`（Boot 页） | — | R1 |
| `/setup` | 公开 | 安装状态检查；后端白名单 | Blank | R2 |
| `/home` | 公开 | — | Public | R2 |
| `/login` | 公开 | 已登录时重定向；后端白名单 | Auth | R1 简版 / R2 |
| `/register` | 公开 | pending session 时在后端白名单内 | Auth | R2 |
| `/email-verify` | 公开 | 同上 | Auth | R2 |
| `/forgot-password` | 公开 | — | Auth | R2 |
| `/reset-password` | 公开 | — | Auth | R2 |
| `/auth/callback` | 公开 | 后端白名单 | Blank | R2 |
| `/auth/linuxdo/callback` | 公开 | 后端白名单 | Blank | R2 |
| `/auth/wechat/callback` | 公开 | 后端白名单 | Blank | R2 |
| `/auth/dingtalk/callback` | 公开 | 后端白名单 | Blank | R2 |
| `/auth/dingtalk/email-completion` | 公开 | 后端白名单 | Blank | R2 |
| `/auth/oidc/callback` | 公开 | 后端白名单 | Blank | R2 |
| `/auth/wechat/payment/callback` | 公开 | 后端白名单 | Blank | R3 |
| `/key-usage` | 公开 | 后端白名单 | Public | R2 |
| `/legal/[documentId]` | 公开 | 后端白名单 | Public | R2 |
| `/model-plaza` | 公开 | 启用开关、强制登录开关、后端模式 | Public | R2 |
| `/oauth/mcp/authorize` | 登录 | — | Auth | R2 |
| `/dashboard` | 登录 | — | Console-用户 | R3 |
| `/keys` | 登录 | — | Console-用户 | R3 |
| `/batch-image` | 登录 | 页面内访问判断（对应 `useBatchImageAccess`）；原页面为使用指南页 `BatchImageGuideView` | Console-用户 | R3 |
| `/usage` | 登录 | — | Console-用户 | R3 |
| `/redeem` | 登录 | 简易受限 | Console-用户 | R3 |
| `/affiliate` | 登录 | 按开关显示菜单 | Console-用户 | R3 |
| `/available-channels` | 登录 | 按开关显示菜单 | Console-用户 | R3 |
| `/monitor` | 登录 | 按开关显示菜单 | Console-用户 | R3 |
| `/settings/mcp` | 登录 | 按开关显示菜单 | Console-用户 | R3 |
| `/profile` | 登录 | — | Console-用户 | R3 |
| `/subscriptions` | 登录 | 订阅；简易受限 | Console-用户 | R3 |
| `/purchase` | 登录 | 支付 | Console-用户 | R3 |
| `/orders` | 登录 | 支付 | Console-用户 | R3 |
| `/payment/qrcode` | 登录 | 支付 | Blank | R3 |
| `/payment/result` | 公开 | 后端白名单 | Blank | R3 |
| `/payment/stripe` | 公开 | — | Blank | R3 |
| `/payment/airwallex` | 公开 | 后端白名单 | Blank | R3 |
| `/payment/stripe-popup` | 公开 | — | Blank | R3 |
| `/custom/[id]` | 登录 | — | Console-用户 | R3 |
| `/admin` | 管理 | 重定向 `/admin/dashboard` | — | R4 |
| `/admin/dashboard` | 管理 | — | Console-管理 | R4 |
| `/admin/users` | 管理 | — | Console-管理 | R4 |
| `/admin/groups` | 管理 | — | Console-管理 | R4 |
| `/admin/accounts` | 管理 | — | Console-管理 | R4 |
| `/admin/channels` | 管理 | 重定向 `/admin/channels/pricing` | — | R4 |
| `/admin/channels/pricing` | 管理 | — | Console-管理 | R4 |
| `/admin/channels/monitor` | 管理 | — | Console-管理 | R4 |
| `/admin/subscriptions` | 管理 | 简易受限 | Console-管理 | R4 |
| `/admin/proxies` | 管理 | — | Console-管理 | R4 |
| `/admin/redeem` | 管理 | 简易受限 | Console-管理 | R4 |
| `/admin/promo-codes` | 管理 | — | Console-管理 | R4 |
| `/admin/announcements` | 管理 | — | Console-管理 | R4 |
| `/admin/usage` | 管理 | — | Console-管理 | R4 |
| `/admin/affiliates` | 管理 | 重定向 `/admin/affiliates/invites` | — | R4 |
| `/admin/affiliates/invites` | 管理 | — | Console-管理 | R4 |
| `/admin/affiliates/rebates` | 管理 | — | Console-管理 | R4 |
| `/admin/affiliates/transfers` | 管理 | — | Console-管理 | R4 |
| `/admin/orders/dashboard` | 管理 | 支付 | Console-管理 | R4 |
| `/admin/orders` | 管理 | 支付 | Console-管理 | R4 |
| `/admin/orders/plans` | 管理 | 支付 | Console-管理 | R4 |
| `/admin/settings` | 管理 | — | Console-管理 | R5 |
| `/admin/ops` | 管理 | 运维关闭时跳转设置页 | Console-管理 | R5 |
| `/admin/audit-logs` | 管理 | — | Console-管理 | R5 |
| `/admin/risk-control` | 管理 | 风控 | Console-管理 | R5 |
| `/admin/prompt-audit` | 管理 | 风控 | Console-管理 | R5 |
| `/admin/plugins` | 管理 | 按开关显示菜单 | Console-管理 | R5 |
| 其他任意路径 | — | 404 | Public | R1 |

> 注：“按开关显示菜单”指原侧边栏会根据公开设置（如 `affiliate_enabled`、`available_channels_enabled`、`channel_monitor_enabled`、`mcp_enabled`、`plugin_management_enabled` 等）决定菜单是否显示。页面本身的直达行为以原实现为准，实施时逐页核对 `AppSidebar.vue` 与对应页面。

## 附录 B：必须沿用的浏览器存储键

- **鉴权**：`auth_token`、`refresh_token`、`auth_user`、`token_expires_at`、`pending_auth_session`、`auth_expired`（sessionStorage）、`register_data`、`email_oauth_pending_provider`、`oauth_aff_code`、`affiliate_referral_code`、`sub2api_login_agreement_consent`。
- **偏好**：`theme`、`sub2api_locale`、`table-page-size`、`table-page-size-source`。
- **表格与筛选**：`account-hidden-columns`、`account-hidden-columns-version`、`account-filter-values`、`account-table-sort`、`account-auto-refresh`、`api-key-hidden-columns`、`api-key-column-settings-version`、`group-hidden-columns`、`group-column-settings-version`、`user-hidden-columns`、`user-column-settings-version`、`user-filter-values`、`subscription-hidden-columns`、`subscription-user-column-mode`、`usage-hidden-columns`、`usage-hidden-columns-version`、`usage-error-hidden-columns`、`user-usage-hidden-columns`、`user-usage-error-hidden-columns`、`admin-users-usage-sort`、`channel-status-auto-refresh`。
- **缓存与流程**：`ops_monitoring_enabled_cached`、`payment_enabled_cached`、`payment.recovery.current`、`sub2api:ip-geo-cache:v1`、`chunk_reload_attempted`（sessionStorage，可由新的防循环键替代），以及复制功能使用的 `sub2api:admin:group-duplicate:*`、`sub2api:admin:channel-monitor-duplicate:*`。
- 以上清单由脚本扫描得出，实施时还需以全文搜索 `localStorage`、`sessionStorage` 的结果为准，并在 R1 固化成常量模块与测试。

## 附录 C：前端必须识别的后端错误码与全局事件

- **鉴权**：401（刷新流程）、`TOKEN_EXPIRED`、`INVALID_TOKEN`、`TOKEN_REVOKED` 等（统一走 401 分支）。前端自定义码：`AUTH_SESSION_CHANGED`、`TOKEN_REFRESH_UNAVAILABLE`、`TOKEN_REFRESH_FAILED`、`ERR_NETWORK`、`OPS_DISABLED`。
- **Step-up**：`STEP_UP_REQUIRED`、`STEP_UP_TOTP_NOT_ENABLED`、`STEP_UP_ADMIN_API_KEY_FORBIDDEN`；前端取消码 `STEP_UP_CANCELLED`。
- **合规**：HTTP 423 加 `ADMIN_COMPLIANCE_ACK_REQUIRED`，对应事件 `admin-compliance-required`。
- **运维**：404 加消息 `Ops monitoring is disabled`，对应事件 `ops-monitoring-disabled`。
- **限流**：`Retry-After`，前端字段为 `retry_after_seconds`。
- 各业务页面的专用错误码（`reason`、`metadata`）以原页面和 `utils/apiError.ts`、`utils/authError.ts`、`utils/errorCategory.ts` 为准，随页面迁移逐一核对。

## 附录 D：Vue → React 依赖映射

| Vue 生态 | 新前端 |
|---|---|
| vue / vue-router | React 19 / Next.js Pages Router + 路由注册表 + 门禁 |
| pinia | Zustand（加 TanStack Query 负责服务端状态） |
| vue-i18n | i18next + react-i18next + vue-i18n 格式兼容层 |
| @vueuse/core | 自研 hooks（或按需使用小型 React hooks 库） |
| @tanstack/vue-virtual | @tanstack/react-virtual |
| vue-chartjs + chart.js | Recharts（shadcn Chart） |
| vue-draggable-plus | dnd-kit |
| 自研 Tailwind 组件（BaseDialog、Select、Toggle、DataTable…） | shadcn/ui + Radix + TanStack Table |
| Toast（自研） | sonner |
| driver.js、marked、DOMPurify、qrcode、xlsx、file-saver、axios、Stripe、Airwallex | 沿用（按需懒加载） |
| Vite `?raw` 导入 Markdown | 构建前代码生成 |
| Vite dev proxy 与 index 注入插件 | Next 开发期 rewrites（开发期不注入，走接口拉取） |
| vue-tsc | tsc（类型检查） |
