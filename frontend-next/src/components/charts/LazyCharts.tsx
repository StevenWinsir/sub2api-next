import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const fallback = () => <Skeleton className="h-56 w-full" />

export const LazyTrendAreaChart = dynamic(() => import('./Charts').then((m) => m.TrendAreaChart), {
  ssr: false,
  loading: fallback
})
export const LazyDonutChart = dynamic(() => import('./Charts').then((m) => m.DonutChart), {
  ssr: false,
  loading: fallback
})
export const LazySimpleBarChart = dynamic(() => import('./Charts').then((m) => m.SimpleBarChart), {
  ssr: false,
  loading: fallback
})

export { CHART_COLORS } from './chartColors'
