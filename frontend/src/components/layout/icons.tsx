import * as React from 'react'
import {
  Activity,
  AppWindow,
  Bell,
  BadgePercent,
  BarChart3,
  CreditCard,
  FolderTree,
  Gauge,
  Gift,
  Globe,
  Images,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  Network,
  Package,
  Plug,
  Puzzle,
  Receipt,
  ScanSearch,
  ScrollText,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Tags,
  Ticket,
  UserRound,
  Users,
  Wallet
} from 'lucide-react'

/** 注册表里的图标名 → lucide 组件（显式映射，避免整包引入 lucide）。 */
const ICONS: Record<string, LucideIcon> = {
  Activity,
  AppWindow,
  Bell,
  BadgePercent,
  BarChart3,
  CreditCard,
  FolderTree,
  Gauge,
  Gift,
  Globe,
  Images,
  KeyRound,
  LayoutDashboard,
  Network,
  Package,
  Plug,
  Puzzle,
  Receipt,
  ScanSearch,
  ScrollText,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Tags,
  Ticket,
  UserRound,
  Users,
  Wallet
}

export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? AppWindow
}

/** 按名称渲染图标（避免在渲染期动态创建组件）。 */
export function DynamicIcon({ name, ...props }: { name: string } & React.ComponentProps<LucideIcon>) {
  const Icon = ICONS[name] ?? AppWindow
  return <Icon {...props} />
}
