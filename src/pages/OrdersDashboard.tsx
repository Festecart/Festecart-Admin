import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, ShoppingBag, Users, UserRoundCheck, IndianRupee, UserPlus } from 'lucide-react'
import { DashboardDateFilter } from '@/components/DashboardDateFilter'
import { KPICard } from '@/components/KPICard'
import { useDashboardDateRange } from '@/hooks/useDashboardDateRange'
import { useOrdersDashboardData } from '@/hooks/useModuleDashboards'
import { downloadDashboardCsv } from '@/lib/dashboardCsv'
import { formatCurrency } from '@/lib/utils'
import { useState } from 'react'

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function formatMonth(value: string) {
  const date = new Date(`${value}-01T00:00:00`)
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

export default function OrdersDashboard() {
  const [range, setRange] = useDashboardDateRange()
  const [trendMode, setTrendMode] = useState<'daily' | 'monthly'>('daily')
  const { data, isLoading, error } = useOrdersDashboardData(range)
  const trends = trendMode === 'daily'
    ? data?.orderTrends ?? []
    : (data?.monthlyOrderTrends ?? []).map(({ month, orders, revenue }) => ({
        date: month,
        orders,
        revenue,
      }))

  const exportCsv = () => {
    if (!data) return
    downloadDashboardCsv('orders-dashboard.csv', [
      {
        title: 'Top Customers',
        headers: ['Customer', 'Phone', 'Email', 'New or Returning', 'Orders in Range', 'Lifetime Orders', 'Lifetime Repeat', 'Spending in Range', 'Lifetime Spending', 'Last Order (Lifetime)'],
        rows: data.customers.map(customer => [
          customer.name,
          customer.phone,
          customer.email,
          customer.isNewInRange ? 'New' : 'Returning',
          customer.orders,
          customer.lifetimeOrderCount,
          customer.isLifetimeRepeat ? 'Yes' : 'No',
          customer.purchaseValue,
          customer.lifetimePurchaseValue,
          customer.lifetimeLastOrderDate,
        ]),
      },
      trendMode === 'daily'
        ? {
            title: 'Daily Order Trends',
            headers: ['Date', 'Orders', 'Revenue'],
            rows: data.orderTrends.map(trend => [trend.date, trend.orders, trend.revenue]),
          }
        : {
            title: 'Monthly Order Trends',
            headers: ['Month', 'Orders', 'Revenue'],
            rows: data.monthlyOrderTrends.map(trend => [trend.month, trend.orders, trend.revenue]),
          },
    ])
  }

  return (
    <div className="min-h-screen space-y-5 bg-gray-50 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orders Dashboard</h1>
          <p className="mt-1 text-xs text-gray-500">Customer rankings, repeat orders, and order trends</p>
        </div>
        {data && (
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      <DashboardDateFilter range={range} onChange={setRange} />

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load orders dashboard: {error.message}</p>}

      {data && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <KPICard label="Orders" value={data.totalOrders.toLocaleString('en-IN')} icon={ShoppingBag} color="#3b82f6" />
          <KPICard label="Revenue" value={formatCurrency(data.totalRevenue)} icon={IndianRupee} color="#10b981" />
          <KPICard label="Customers" value={data.totalCustomers.toLocaleString('en-IN')} icon={Users} color="#0ea5e9" />
          <KPICard label="Repeat Orders in Range" value={data.repeatCustomersInRange.toLocaleString('en-IN')} subLabel="Customers with 2+ non-cancelled orders in this range" icon={UserRoundCheck} color="#8b5cf6" />
          <KPICard label="Lifetime Repeat Customers" value={data.lifetimeRepeatCustomers.toLocaleString('en-IN')} subLabel="Customers with 2+ non-cancelled lifetime orders" icon={UserRoundCheck} color="#6366f1" />
          <KPICard label="New Customers" value={data.newCustomers.toLocaleString('en-IN')} subLabel={`${data.returningCustomers.toLocaleString('en-IN')} returning customers in this range`} icon={UserPlus} color="#f59e0b" />
        </div>
      )}

      {isLoading && !data ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">Loading order analytics…</div>
      ) : data && (
        <>
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-gray-800">Order Trends</h2>
              <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5">
                {(['daily', 'monthly'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={trendMode === mode}
                    onClick={() => setTrendMode(mode)}
                    className={`rounded-md px-2.5 py-1 text-xs capitalize ${trendMode === mode ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            {trends.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">No orders in this date range.</p>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={trends}>
                    <defs>
                      <linearGradient id="ordersTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={value => trendMode === 'daily' ? formatDay(String(value)) : formatMonth(String(value))} tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip labelFormatter={label => trendMode === 'daily' ? formatDay(String(label)) : formatMonth(String(label))} />
                    <Area type="monotone" dataKey="orders" name="Orders" stroke="#3b82f6" fill="url(#ordersTrend)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-800">Top 10 Customers by Orders</h2>
            {data.customers.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">No customers in this date range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-5 py-3 text-left">#</th>
                      <th className="px-5 py-3 text-left">Customer / Contact</th>
                      <th className="px-5 py-3 text-center">New / Returning</th>
                      <th className="px-5 py-3 text-center">Lifetime Repeat</th>
                      <th className="px-5 py-3 text-right">Orders in Range</th>
                      <th className="px-5 py-3 text-right">Lifetime Orders</th>
                      <th className="px-5 py-3 text-right">Spend in Range</th>
                      <th className="px-5 py-3 text-right">Lifetime Spend</th>
                      <th className="px-5 py-3 text-right">Last Order (Lifetime)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.customers.map((customer, index) => (
                      <tr key={customer.id}>
                        <td className="px-5 py-3 text-gray-400">{index + 1}</td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-800">{customer.name}</p>
                          {(customer.phone || customer.email) && (
                            <p className="mt-0.5 text-xs text-gray-500">
                              {[customer.phone, customer.email].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${customer.isNewInRange ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                            {customer.isNewInRange ? 'New' : 'Returning'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${customer.isLifetimeRepeat ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                            {customer.isLifetimeRepeat ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">{customer.orders.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-right">{customer.lifetimeOrderCount.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-right font-semibold">{formatCurrency(customer.purchaseValue)}</td>
                        <td className="px-5 py-3 text-right font-semibold">{formatCurrency(customer.lifetimePurchaseValue)}</td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">{customer.lifetimeLastOrderDate || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
