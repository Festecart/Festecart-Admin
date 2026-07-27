import type { KPICardProps } from '@/types/analytics'
import { TrendingUp, TrendingDown } from 'lucide-react'

export function KPICard({ label, value, subLabel, trend, icon: Icon, color }: KPICardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium mb-0.5 truncate">{label}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{value}</p>
        {subLabel && <p className="text-xs text-gray-400 mt-0.5">{subLabel}</p>}
        {trend !== undefined && (
          <div className={`inline-flex items-center gap-1 text-xs font-medium mt-1 ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {trend >= 0
              ? <TrendingUp size={12} />
              : <TrendingDown size={12} />
            }
            {Math.abs(trend)}% vs prior period
          </div>
        )}
      </div>
    </div>
  )
}
