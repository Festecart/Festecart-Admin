import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, X, Plus } from 'lucide-react'
import { useOrders, isOrderPaid } from '@/hooks/useOrders'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

const STATUS_OPTIONS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all',              label: 'All Statuses'     },
  { value: 'confirmed',        label: 'Confirmed'        },
  { value: 'shipped',          label: 'Shipped'          },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered',        label: 'Delivered'        },
  { value: 'cancelled',        label: 'Cancelled'        },
]

function customerName(order: Order): string {
  return order.guest_name?.trim() || order.shipping_address?.name?.trim() || '—'
}
function customerPhone(order: Order): string {
  return order.guest_phone?.trim() || order.shipping_address?.phone?.trim() || '—'
}

export default function Orders() {
  const navigate = useNavigate()
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState<OrderStatus | 'all'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo,   setDateTo]   = useState('')

  const { data: orders, isLoading } = useOrders({
    status, search,
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
  })

  const clearFilters = () => { setSearch(''); setStatus('all'); setDateFrom(''); setDateTo('') }
  const hasFilters   = !!(search || status !== 'all' || dateFrom || dateTo)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? 'Loading…' : `${orders?.length ?? 0} orders`}
          </p>
        </div>
        <Link to="/orders/add"
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
          <Plus size={15} /> Add Order
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search order #, customer name, phone…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>
          <select value={status} onChange={e => setStatus(e.target.value as OrderStatus | 'all')}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white text-gray-700 min-w-[160px]">
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors">
              <X size={12} /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading orders…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Order No','Order Date','Customer Name','Phone','Items','Total','Payment Method','Payment Status','Order Status'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(orders ?? []).map(order => (
                  <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Link to={`/orders/${order.id}`} onClick={e => e.stopPropagation()}
                        className="font-semibold text-red-600 hover:text-red-700 hover:underline">
                        {order.order_number}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDateShort(order.created_at)}</td>
                    <td className="px-5 py-3 text-gray-800 font-medium">{customerName(order)}</td>
                    <td className="px-5 py-3 text-gray-500">{customerPhone(order)}</td>
                    <td className="px-5 py-3 text-gray-500 text-center">{order.items?.length ?? 0}</td>
                    <td className="px-5 py-3 font-semibold whitespace-nowrap">{formatCurrency(order.total)}</td>
                    <td className="px-5 py-3 text-gray-600 text-xs font-medium">
                      {order.payment_method === 'cod' ? 'COD' : 'Online Payment'}
                    </td>
                    <td className="px-5 py-3">
                      {isOrderPaid(order)
                        ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-800"><span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />Paid</span>
                        : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                  </tr>
                ))}
                {(orders ?? []).length === 0 && (
                  <tr><td colSpan={9} className="px-5 py-12 text-center text-gray-400">No orders match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
