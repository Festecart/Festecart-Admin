import { cn } from '@/lib/utils'
import type { OrderStatus } from '@/types'

const config: Record<OrderStatus, { label: string; dot: string }> = {
  confirmed:        { label: 'Confirmed',        dot: 'bg-gray-400' },
  shipped:          { label: 'Shipped',           dot: 'bg-gray-600' },
  out_for_delivery: { label: 'Out for Delivery',  dot: 'bg-gray-800' },
  delivered:        { label: 'Delivered',         dot: 'bg-black' },
  cancelled:        { label: 'Cancelled',         dot: 'bg-gray-300' },
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  const c = config[status] ?? { label: status, dot: 'bg-gray-400' }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-800">
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />
      {c.label}
    </span>
  )
}
