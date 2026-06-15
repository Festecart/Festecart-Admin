import { Link } from 'react-router-dom'
import { ShoppingBag, Clock, Truck, TrendingUp, Calendar, ArrowRight, RefreshCw } from 'lucide-react'
import { useDashboardStats, useRecentOrders } from '@/hooks/useOrders'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDateShort } from '@/lib/utils'

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useDashboardStats()
  const { data: recent, isLoading: ordersLoading } = useRecentOrders()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welcome back — here's what's happening today</p>
        </div>
        <button
          onClick={() => refetchStats()}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={ShoppingBag} label="Today's Orders" value={stats?.todayOrders ?? 0} color="bg-blue-500" />
          <StatCard icon={Clock} label="Pending (Confirmed)" value={stats?.pendingOrders ?? 0} color="bg-amber-500" />
          <StatCard icon={Truck} label="In Transit" value={stats?.inTransitOrders ?? 0} color="bg-orange-500" />
          <StatCard icon={TrendingUp} label="Today's Revenue" value={formatCurrency(stats?.todayRevenue ?? 0)} color="bg-green-500" />
          <StatCard icon={Calendar} label="Month Revenue" value={formatCurrency(stats?.monthRevenue ?? 0)} color="bg-red-600" />
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Orders</h2>
          <Link to="/orders" className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {ordersLoading ? (
          <div className="p-8 text-center text-gray-400">Loading orders…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Order</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Customer</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Items</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(recent ?? []).map(order => (
                  <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-medium text-gray-900">{order.order_number}</td>
                    <td className="px-5 py-3 text-gray-600">{order.guest_name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{order.items?.length ?? 0}</td>
                    <td className="px-5 py-3 font-medium">{formatCurrency(order.total)}</td>
                    <td className="px-5 py-3"><StatusBadge status={order.status} /></td>
                    <td className="px-5 py-3 text-gray-500">{formatDateShort(order.created_at)}</td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/orders/${order.id}`}
                        className="text-red-600 hover:text-red-700 font-medium text-xs"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {(recent ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-gray-400">No orders yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
