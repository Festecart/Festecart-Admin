import { Link } from 'react-router-dom'
import { Truck, CheckCircle2, RefreshCw } from 'lucide-react'
import { useActiveShipments, useUpdateOrderStatus } from '@/hooks/useOrders'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useState } from 'react'
import type { Order } from '@/types'

function customerName(order: Order)  { return order.guest_name?.trim()  || order.shipping_address?.name?.trim()  || '—' }
function customerPhone(order: Order) { return order.guest_phone?.trim() || order.shipping_address?.phone?.trim() || '—' }

export default function Shipments() {
  const { data: shipments, isLoading, refetch } = useActiveShipments()
  const updateStatus = useUpdateOrderStatus()
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const markDelivered = async (orderId: string) => {
    setUpdatingId(orderId)
    try { await updateStatus.mutateAsync({ orderId, status: 'delivered' }) }
    finally { setUpdatingId(null) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Truck size={22} /> Active Shipments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Orders currently shipped or out for delivery</p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading shipments…</div>
        ) : (shipments ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <Truck size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No active shipments</p>
            <p className="text-sm text-gray-400 mt-1">Shipped and out-for-delivery orders appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Order #','Customer','Phone','Total','Courier','Tracking #','Shipped At','Status',''].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(shipments ?? []).map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900 whitespace-nowrap">
                      <Link to={`/orders/${order.id}`} className="hover:text-red-600">{order.order_number}</Link>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{customerName(order)}</td>
                    <td className="px-5 py-3 text-gray-500">{customerPhone(order)}</td>
                    <td className="px-5 py-3 font-medium whitespace-nowrap">{formatCurrency(order.total)}</td>
                    <td className="px-5 py-3 text-gray-600">{order.courier_name ?? '—'}</td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-700">{order.tracking_number ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(order.shipped_at)}</td>
                    <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-5 py-3">
                      <button onClick={() => markDelivered(order.id)} disabled={updatingId === order.id}
                        className="flex items-center gap-1.5 text-xs font-medium text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        <CheckCircle2 size={13} />
                        {updatingId === order.id ? 'Updating…' : 'Mark Delivered'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
