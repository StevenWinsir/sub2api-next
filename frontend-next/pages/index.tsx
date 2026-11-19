/**
 * Boot 页（`/`）。后端对所有前端路径回退到根 index.html，因此任何深链首屏都落在这里；
 * 真正的纠正逻辑在 src/app/AppRoot.tsx（读取 window.location 后 router.replace 到完整原始 URL）。
 */
export default function BootPage() {
  return null
}
