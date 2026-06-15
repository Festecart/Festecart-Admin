import { CheckCircle, Circle, XCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

const STEPS: { status: OrderStatus; label: string; tsKey: keyof Order }[] = [
  { status: 'confirmed', label: 'Order Confirmed', tsKey: 'confirmed_at' },
  { status: 'shipped', label: 'Shipped', tsKey: 'shipped_at' },
  { status: 'out_for_delivery', label: 'Out for Delivery', tsKey: 'out_for_delivery_at' },
  { status: 'delivered', label: 'Delivered', tsKey: 'delivered_at' },
]

const STATUS_ORDER: OrderStatus[] = ['confirmed', 'shipped', 'out_for_delivery', 'delivered']

export function OrderTimeline({ order }: { order: Order }) {
  const isCancelled = order.status === 'cancelled'
  const currentIdx = STATUS_ORDER.indexOf(order.status)

  return (
    <div className="relative">
      {isCancelled && (
        <div className="flex items-center gap-3 p-3 bg-red-50 rounded-lg mb-4">
          <XCircle className="text-red-600 shrink-0" size={20} />
          <div>
            <p className="font-medium text-red-800">Order Cancelled</p>
            <p className="text-sm text-red-600">{formatDate(order.cancelled_at)}</p>
          </div>
        </div>
      )}
      <div className="space-y-0">
        {STEPS.map((step, idx) => {
          const done = !isCancelled && currentIdx >= idx
          const ts = order[step.tsKey] as string | null

          return (
            <div key={step.status} className="flex gap-3">
              {/* icon + line */}
              <div className="flex flex-col items-center">
                <div className={`rounded-full p-0.5 ${done ? 'text-green-600' : 'text-gray-300'}`}>
                  {done
                    ? <CheckCircle size={20} />
                    : <Circle size={20} />
                  }
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`w-0.5 h-8 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
              {/* text */}
              <div className="pb-4">
                <p className={`text-sm font-medium ${done ? 'text-gray-900' : 'text-gray-400'}`}>{step.label}</p>
                {done && ts && <p className="text-xs text-gray-500">{formatDate(ts)}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
