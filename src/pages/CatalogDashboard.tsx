import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Package, Layers3, Boxes, IndianRupee } from 'lucide-react'
import { DashboardDateFilter } from '@/components/DashboardDateFilter'
import { KPICard } from '@/components/KPICard'
import { useDashboardDateRange } from '@/hooks/useDashboardDateRange'
import { useModuleDashboardData } from '@/hooks/useModuleDashboards'
import { downloadDashboardCsv } from '@/lib/dashboardCsv'
import { formatCurrency } from '@/lib/utils'

export default function CatalogDashboard() {
  const [range, setRange] = useDashboardDateRange()
  const { data, isLoading, error } = useModuleDashboardData(range)

  const exportCsv = () => {
    if (!data) return
    downloadDashboardCsv('catalog-dashboard.csv', [
      {
        title: 'Top Products',
        headers: ['Product', 'Quantity Ordered', 'Product Revenue'],
        rows: data.products.map(product => [product.name, product.quantity, product.revenue]),
      },
      {
        title: 'Category Sales',
        headers: ['Category', 'Orders', 'Quantity Ordered', 'Revenue'],
        rows: data.categories.map(category => [
          category.name,
          category.orders,
          category.quantity,
          category.revenue,
        ]),
      },
    ])
  }

  return (
    <div className="min-h-screen space-y-5 bg-gray-50 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Catalog Dashboard</h1>
          <p className="mt-1 text-xs text-gray-500">Most ordered products and category sales</p>
        </div>
        {data && (
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      <DashboardDateFilter range={range} onChange={setRange} />

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Could not load catalog dashboard: {error.message}</p>}

      {data && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KPICard label="Product Units" value={data.totalProductUnits.toLocaleString('en-IN')} icon={Package} color="#3b82f6" />
          <KPICard label="Products Ordered" value={data.uniqueProducts.toLocaleString('en-IN')} icon={Boxes} color="#8b5cf6" />
          <KPICard label="Categories with Sales" value={data.categories.length.toLocaleString('en-IN')} icon={Layers3} color="#0ea5e9" />
          <KPICard label="Product Revenue" value={formatCurrency(data.totalProductRevenue)} icon={IndianRupee} color="#10b981" />
        </div>
      )}

      {isLoading && !data ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">Loading catalog analytics…</div>
      ) : data && (
        <>
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-800">Top 10 Most Ordered Products</h2>
            {data.products.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">No product sales in this date range.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr><th className="px-5 py-3 text-left">#</th><th className="px-5 py-3 text-left">Product</th><th className="px-5 py-3 text-right">Quantity Ordered</th><th className="px-5 py-3 text-right">Product Revenue</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.products.map((product, index) => (
                      <tr key={product.id}>
                        <td className="px-5 py-3 text-gray-400">{index + 1}</td>
                        <td className="px-5 py-3 font-medium text-gray-800">{product.name}</td>
                        <td className="px-5 py-3 text-right">{product.quantity.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-right font-semibold">{formatCurrency(product.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white">
            <h2 className="border-b border-gray-100 px-5 py-3.5 text-sm font-semibold text-gray-800">Bestselling Categories</h2>
            {data.categories.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">No category sales in this date range.</p>
            ) : (
              <div className="p-4">
                <ResponsiveContainer width="100%" height={Math.max(240, data.categories.slice(0, 10).length * 42)}>
                  <BarChart data={data.categories.slice(0, 10)} layout="vertical" margin={{ left: 12, right: 24 }}>
                    <CartesianGrid stroke="#f0f0f0" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={value => formatCurrency(Number(value ?? 0))} />
                    <Bar dataKey="revenue" name="Category Revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-gray-500"><tr><th className="py-2 text-left">Category</th><th className="py-2 text-right">Orders</th><th className="py-2 text-right">Units</th><th className="py-2 text-right">Revenue</th></tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.categories.map(category => (
                        <tr key={category.id}>
                          <td className="py-2 font-medium text-gray-800">{category.name}</td>
                          <td className="py-2 text-right">{category.orders.toLocaleString('en-IN')}</td>
                          <td className="py-2 text-right">{category.quantity.toLocaleString('en-IN')}</td>
                          <td className="py-2 text-right font-semibold">{formatCurrency(category.revenue)}</td>
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
