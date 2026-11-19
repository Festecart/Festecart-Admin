import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, Download, MapPin, Truck } from 'lucide-react'
import { DashboardDateFilter } from '@/components/DashboardDateFilter'
import { KPICard } from '@/components/KPICard'
import { useDashboardDateRange } from '@/hooks/useDashboardDateRange'
import { useShippingDashboardData } from '@/hooks/useModuleDashboards'
import { downloadDashboardCsv } from '@/lib/dashboardCsv'

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function ShippingDashboard() {
  const [range, setRange] = useDashboardDateRange()
  const { data, isLoading, error } = useShippingDashboardData(range)

  const exportCsv = () => {
    if (!data) return
    downloadDashboardCsv('shipping-dashboard.csv', [
      {
        title: 'Successfully Delivered Orders by Pincode',
        headers: ['Pincode', 'Delivered Orders'],
        rows: data.pincodes.map(item => [item.pincode, item.deliveredOrders]),
      },
      {
        title: 'Delivery Trends',
        headers: ['Delivery Date', 'Delivered Orders'],
        rows: data.deliveryTrends.map(item => [item.date, item.deliveredOrders]),
      },
    ])
  }

  return (
    <div className="min-h-screen space-y-5 bg-gray-50 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Shipping Dashboard</h1>
          <p className="mt-1 text-xs text-gray-500">Delivered orders by destination and delivery trends</p>
        </div>
        {data && (
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      <DashboardDateFilter range={range} onChange={setRange} />

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load shipping dashboard: {error.message}</p>}

      {data && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <KPICard label="Delivered Orders" value={data.deliveredOrders.toLocaleString('en-IN')} subLabel="Within selected delivery date range" icon={CheckCircle2} color="#10b981" />
          <KPICard label="Pending Shipments" value={data.pendingShipments.toLocaleString('en-IN')} subLabel="Currently shipped or out for delivery" icon={Truck} color="#f59e0b" />
          <KPICard label="Delivered Pincodes" value={data.uniqueDeliveredPincodes.toLocaleString('en-IN')} icon={MapPin} color="#3b82f6" />
        </div>
      )}

      {isLoading && !data ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">Loading shipping analytics…</div>
      ) : data && (
        <>
          <section className="rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-800">Delivery Trends</h2>
            {data.deliveryTrends.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">No successfully delivered orders in this date range.</p>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data.deliveryTrends}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={label => formatDay(String(label))} />
                    <Line type="monotone" dataKey="deliveredOrders" name="Delivered Orders" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-800">Top 10 Pincodes by Successfully Delivered Orders</h2>
            {data.pincodes.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">No successfully delivered orders in this date range.</p>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={Math.max(240, data.pincodes.length * 38)}>
                  <BarChart data={data.pincodes} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="pincode" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="deliveredOrders" name="Delivered Orders" fill="#10b981" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-500"><tr><th className="py-2 text-left">#</th><th className="py-2 text-left">Pincode</th><th className="py-2 text-right">Delivered Orders</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.pincodes.map((item, index) => (
                        <tr key={item.pincode}>
                          <td className="py-2 text-gray-400">{index + 1}</td>
                          <td className="py-2 font-mono font-medium text-gray-800">{item.pincode}</td>
                          <td className="py-2 text-right font-semibold">{item.deliveredOrders.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
