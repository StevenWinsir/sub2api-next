import dynamic from 'next/dynamic'
import { BootSkeleton } from '@/components/BootScreens'

/**
 * 控制台外壳按需加载：侧栏、顶栏、⌘K 命令面板、下拉菜单等（Radix 菜单 / Popper / cmdk）体量较大，
 * 公共页（/home、/login 等）不需要，拆出主包以满足首屏 JS 预算。
 */
export const ConsoleLayoutLazy = dynamic(() => import('./ConsoleLayout').then((m) => m.ConsoleLayout), {
  ssr: false,
  loading: () => <BootSkeleton inline />
})
