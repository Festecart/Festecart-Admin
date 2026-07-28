import { useState, useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  BarChart2, RefreshCw, Download, IndianRupee, ShoppingBag,
  TrendingUp, Users, XCircle, Truck, CreditCard, Tag,
  Package, MapPin, AlertCircle,
} from 'lucide-react'
import { useAnalytics } from '@/hooks/useAnalytics'
import type { DateRange, AnalyticsData } from '@/types/analytics'

// ── Design tokens ─────────────────────────────────────────────────

const C = {
  indigo:  '#6366f1',
  blue:    '#3b82f6',
  green:   '#10b981',
  amber:   '#f59e0b',
  red:     '#ef4444',
  purple:  '#8b5cf6',
  orange:  '#f97316',
  teal:    '#14b8a6',
  sky:     '#0ea5e9',
}

const STATUS_COLOR: Record<string, string> = {
  pending:          C.amber,
  confirmed:        C.blue,
  shipped:          C.purple,
  out_for_delivery: C.orange,
  delivered:        C.green,
  cancelled:        C.red,
}

// ── Formatters ────────────────────────────────────────────────────

function fmtINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN')
}

function fmtCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`
  if (n >= 1_00_000)   return `₹${(n / 1_00_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(1)}K`
  return '₹' + n.toLocaleString('en-IN')
}

function fmtPct(n: number): string { return n.toFixed(1) + '%' }

function fmtDate(d: string): string {
  // yyyy-MM-dd → DD MMM
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function fmtMonth(m: string): string {
  const dt = new Date(m + '-01T00:00:00')
  return dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

// ── CSV export ────────────────────────────────────────────────────

function escapeCSV(v: unknown): string {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

function buildCSVSection(title: string, headers: string[], rows: (string | number)[][]): string {
  const lines: string[] = [
    escapeCSV(title),
    headers.map(escapeCSV).join(','),
    ...rows.map(r => r.map(escapeCSV).join(',')),
    '',
  ]
  return lines.join('\n')
}

function exportCSV(data: AnalyticsData, range: DateRange) {
  const from = range.from.toISOString().slice(0, 10)
  const to   = range.to.toISOString().slice(0, 10)

  const sections: string[] = []

  // ── Summary KPIs ──
  sections.push(buildCSVSection('SUMMARY', ['Metric', 'Value'], [
    ['Date Range', `${from} to ${to}`],
    ['Total Revenue (₹)', data.totalRevenue],
    ['Total Orders', data.totalOrders],
    ['Average Order Value (₹)', data.averageOrderValue],
    ['Total Customers', data.totalCustomers],
    ['New Customers', data.newCustomers],
    ['Returning Customers', data.returningCustomers],
    ['Cancelled Orders', data.cancelledOrders],
    ['Cancellation Rate (%)', data.cancellationRate],
    ['COD Orders', data.codOrders],
    ['Prepaid Orders', data.prepaidOrders],
  ]))

  // ── Revenue by Day ──
  if (data.revenueByDay.length > 0) {
    sections.push(buildCSVSection('REVENUE BY DAY', ['Date', 'Revenue (₹)', 'Orders'],
      data.revenueByDay.map(r => [r.date, r.revenue, r.orders])
    ))
  }

  // ── Revenue by Month ──
  if (data.revenueByMonth.length > 0) {
    sections.push(buildCSVSection('REVENUE BY MONTH', ['Month', 'Revenue (₹)', 'Orders'],
      data.revenueByMonth.map(r => [r.month, r.revenue, r.orders])
    ))
  }

  // ── Order Status Breakdown ──
  if (data.statusBreakdown.length > 0) {
    sections.push(buildCSVSection('ORDER STATUS BREAKDOWN', ['Status', 'Count', 'Percentage (%)'],
      data.statusBreakdown.map(s => [
        s.status,
        s.count,
        data.totalOrders > 0 ? ((s.count / data.totalOrders) * 100).toFixed(1) : '0',
      ])
    ))
  }

  // ── Payment Methods ──
  if (data.paymentBreakdown.length > 0) {
    sections.push(buildCSVSection('PAYMENT METHOD BREAKDOWN', ['Method', 'Count', 'Revenue (₹)'],
      data.paymentBreakdown.map(p => [p.method, p.count, p.revenue])
    ))
  }

  // ── Sales by State ──
  if (data.salesByState.length > 0) {
    sections.push(buildCSVSection('SALES BY STATE', ['State', 'Revenue (₹)', 'Orders'],
      data.salesByState.map(s => [s.name, s.revenue, s.orders])
    ))
  }

  // ── Sales by City ──
  if (data.salesByCity.length > 0) {
    sections.push(buildCSVSection('SALES BY CITY', ['City', 'Revenue (₹)', 'Orders'],
      data.salesByCity.map(s => [s.name, s.revenue, s.orders])
    ))
  }

  // ── Sales by Pincode ──
  if (data.salesByPincode.length > 0) {
    sections.push(buildCSVSection('SALES BY PINCODE', ['Pincode', 'Orders', 'Revenue (₹)'],
      data.salesByPincode.map(s => [s.name, s.orders, s.revenue])
    ))
  }

  // ── Sales by Category ──
  if (data.salesByCategory.length > 0) {
    sections.push(buildCSVSection('SALES BY CATEGORY', ['Category', 'Revenue (₹)', 'Orders', 'Units Sold'],
      data.salesByCategory.map(c => [c.category, c.revenue, c.orders, c.units])
    ))
  }

  // ── Top Products ──
  if (data.topProducts.length > 0) {
    sections.push(buildCSVSection('TOP PRODUCTS', ['Rank', 'Product', 'Units Sold', 'Revenue (₹)'],
      data.topProducts.map((p, i) => [i + 1, p.name || p.productId, p.units, p.revenue])
    ))
  }

  // ── Coupon Usage ──
  if (data.couponUsage.length > 0) {
    sections.push(buildCSVSection('COUPON USAGE', ['Coupon Code', 'Uses', 'Total Discount (₹)'],
      data.couponUsage.map(c => [c.code, c.uses, c.totalDiscount])
    ))
  }

  const csv  = sections.join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `festecart-analytics-${from}-to-${to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Date range ────────────────────────────────────────────────────

type Preset = 'today' | '7d' | '30d' | '90d' | 'month' | 'last_month' | 'custom'

function getRange(preset: Preset): DateRange {
  const now   = new Date()
  const start = (d: Date) => { d.setHours(0, 0, 0, 0); return d }
  const end   = (d: Date) => { d.setHours(23, 59, 59, 999); return d }
  if (preset === 'today')      { return { from: start(new Date()), to: end(new Date()) } }
  if (preset === '7d')         { const f = start(new Date()); f.setDate(f.getDate() - 6); return { from: f, to: end(new Date()) } }
  if (preset === '30d')        { const f = start(new Date()); f.setDate(f.getDate() - 29); return { from: f, to: end(new Date()) } }
  if (preset === '90d')        { const f = start(new Date()); f.setDate(f.getDate() - 89); return { from: f, to: end(new Date()) } }
  if (preset === 'month')      { return { from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0), to: end(new Date()) } }
  if (preset === 'last_month') { return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0), to: end(new Date(now.getFullYear(), now.getMonth(), 0)) } }
  const f = start(new Date()); f.setDate(f.getDate() - 29); return { from: f, to: end(new Date()) }
}

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'today',      label: 'Today'      },
  { value: '7d',         label: '7D'         },
  { value: '30d',        label: '30D'        },
  { value: '90d',        label: '90D'        },
  { value: 'month',      label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom',     label: 'Custom'     },
]

// ── Shared UI helpers ─────────────────────────────────────────────

function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className}`} />
}

function ChartCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Empty({ msg = 'No data available for the selected period.' }: { msg?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
      <BarChart2 size={28} className="opacity-30" />
      <p className="text-xs text-center max-w-[180px]">{msg}</p>
    </div>
  )
}

function AnaTooltip({ active, payload, label, currency = false }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[120px]">
      <p className="font-semibold text-gray-700 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-bold text-gray-900">{currency || p.dataKey === 'revenue' ? fmtINR(p.value) : p.value.toLocaleString('en-IN')}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────

function KPI({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + '18' }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 font-medium leading-none mb-1 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function KPISkel() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => <Sk key={i} className="h-20" />)}
    </div>
  )
}

// ── Revenue chart ─────────────────────────────────────────────────

function RevenueChart({ data }: { data: AnalyticsData }) {
  const [view, setView] = useState<'daily' | 'monthly'>('daily')
  const chartData: Record<string, unknown>[] = view === 'daily' ? data.revenueByDay : data.revenueByMonth
  const empty = chartData.length === 0

  return (
    <ChartCard
      title="Revenue Overview"
      action={
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
          {(['daily', 'monthly'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-2.5 py-1 transition-colors capitalize ${view === v ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {v === 'daily' ? 'Daily' : 'Monthly'}
            </button>
          ))}
        </div>
      }
    >
      {empty ? <Empty /> : (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.indigo} stopOpacity={0.15} />
                <stop offset="95%" stopColor={C.indigo} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey={view === 'daily' ? 'date' : 'month'}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickFormatter={view === 'daily' ? fmtDate : fmtMonth}
              tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={fmtCompact}
              tickLine={false} axisLine={false} width={52} />
            <Tooltip content={<AnaTooltip currency />} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke={C.indigo}
              strokeWidth={2} fill="url(#revGrad)" dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  )
}

// ── Donut chart helper ────────────────────────────────────────────

function DonutLegend({ items }: { items: { label: string; value: number; color: string; pct: number }[] }) {
  return (
    <div className="space-y-1.5 mt-3">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-2 text-xs">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.color }} />
          <span className="text-gray-600 flex-1 truncate capitalize">{it.label}</span>
          <span className="font-semibold text-gray-800">{it.value.toLocaleString('en-IN')}</span>
          <span className="text-gray-400 w-9 text-right">{fmtPct(it.pct)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Status breakdown ──────────────────────────────────────────────

function StatusChart({ data }: { data: AnalyticsData }) {
  const items = data.statusBreakdown.map(s => ({
    label: s.status.replace(/_/g, ' '),
    value: s.count,
    color: STATUS_COLOR[s.status] ?? C.sky,
    pct: data.totalOrders > 0 ? (s.count / data.totalOrders) * 100 : 0,
  }))
  const empty = items.length === 0
  return (
    <ChartCard title="Order Status">
      {empty ? <Empty /> : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={items} dataKey="value" nameKey="label"
                cx="50%" cy="50%" outerRadius={72} innerRadius={44} paddingAngle={2}>
                {items.map((it, i) => <Cell key={i} fill={it.color} />)}
              </Pie>
              <Tooltip formatter={((v: number, name: string) => [v.toLocaleString('en-IN'), name]) as any} />
            </PieChart>
          </ResponsiveContainer>
          <DonutLegend items={items} />
        </>
      )}
    </ChartCard>
  )
}

// ── Payment breakdown ─────────────────────────────────────────────

function PaymentChart({ data }: { data: AnalyticsData }) {
  const total  = data.codOrders + data.prepaidOrders
  const items  = data.paymentBreakdown.map((p) => ({
    label: p.method === 'cod' ? 'Cash on Delivery' : p.method.toUpperCase(),
    value: p.count,
    color: p.method === 'cod' ? C.amber : C.green,
    pct: total > 0 ? (p.count / total) * 100 : 0,
  }))
  const empty = items.length === 0
  return (
    <ChartCard title="Payment Methods">
      {empty ? <Empty /> : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={items} dataKey="value" nameKey="label"
                cx="50%" cy="50%" outerRadius={72} innerRadius={44} paddingAngle={2}>
                {items.map((it, i) => <Cell key={i} fill={it.color} />)}
              </Pie>
              <Tooltip formatter={((v: number, name: string) => [v.toLocaleString('en-IN'), name]) as any} />
            </PieChart>
          </ResponsiveContainer>
          <DonutLegend items={items} />
        </>
      )}
    </ChartCard>
  )
}

// ── Geographic section ────────────────────────────────────────────

function GeoSection({ data }: { data: AnalyticsData }) {
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* States */}
        <ChartCard title="Sales by State">
          {data.salesByState.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(180, data.salesByState.length * 30)}>
              <BarChart data={data.salesByState} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={fmtCompact} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }}
                  width={90} tickLine={false} axisLine={false}
                  tickFormatter={v => v ? v.charAt(0).toUpperCase() + v.slice(1) : v} />
                <Tooltip content={<AnaTooltip currency />} />
                <Bar dataKey="revenue" name="Revenue" fill={C.indigo} radius={[0, 3, 3, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Cities */}
        <ChartCard title="Top Cities by Revenue">
          {data.salesByCity.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={Math.max(180, Math.min(data.salesByCity.length, 10) * 30)}>
              <BarChart data={data.salesByCity.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }}
                  tickFormatter={fmtCompact} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }}
                  width={80} tickLine={false} axisLine={false}
                  tickFormatter={v => v ? v.charAt(0).toUpperCase() + v.slice(1) : v} />
                <Tooltip content={<AnaTooltip currency />} />
                <Bar dataKey="revenue" name="Revenue" fill={C.teal} radius={[0, 3, 3, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Pincodes table */}
      <ChartCard title="Top Pincodes by Orders">
        {data.salesByPincode.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500">#</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500">Pincode</th>
                  <th className="py-2 px-3 text-right text-xs font-semibold text-gray-500">Orders</th>
                  <th className="py-2 px-3 text-right text-xs font-semibold text-gray-500">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.salesByPincode.map((p, i) => (
                  <tr key={p.name} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-3 text-xs text-gray-400">{i + 1}</td>
                    <td className="py-2 px-3 font-mono font-medium text-gray-800">{p.name}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{p.orders.toLocaleString('en-IN')}</td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900">{fmtINR(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}

// ── Catalog section ───────────────────────────────────────────────

function CatalogSection({ data }: { data: AnalyticsData }) {
  const maxUnits = Math.max(1, ...data.topProducts.map(p => p.units))

  return (
    <div className="space-y-4">
      <ChartCard title="Sales by Category">
        {data.salesByCategory.length === 0 ? <Empty /> : (
          <ResponsiveContainer width="100%" height={Math.max(160, data.salesByCategory.length * 32)}>
            <BarChart data={data.salesByCategory} layout="vertical" margin={{ left: 0, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickFormatter={fmtCompact} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 10, fill: '#6b7280' }}
                width={110} tickLine={false} axisLine={false} />
              <Tooltip content={<AnaTooltip currency />} />
              <Bar dataKey="revenue" name="Revenue" fill={C.purple} radius={[0, 3, 3, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="Top 10 Products by Units Sold">
        {data.topProducts.length === 0 ? <Empty /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500">#</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500">Product</th>
                  <th className="py-2 px-3 text-right text-xs font-semibold text-gray-500">Units</th>
                  <th className="py-2 px-3 text-right text-xs font-semibold text-gray-500">Revenue</th>
                  <th className="py-2 px-3 text-left text-xs font-semibold text-gray-500 w-24 hidden sm:table-cell">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.topProducts.map((p, i) => (
                  <tr key={p.productId} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-xs text-gray-400">{i + 1}</td>
                    <td className="py-2.5 px-3 font-medium text-gray-900 max-w-[200px] truncate">{p.name || p.productId}</td>
                    <td className="py-2.5 px-3 text-right text-gray-700">{p.units.toLocaleString('en-IN')}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-gray-900">{fmtINR(p.revenue)}</td>
                    <td className="py-2.5 px-3 hidden sm:table-cell">
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-20">
                        <div className="h-full rounded-full" style={{ width: `${(p.units / maxUnits) * 100}%`, background: C.indigo }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  )
}

// ── Coupon section ────────────────────────────────────────────────

function CouponSection({ data }: { data: AnalyticsData }) {
  const ordersWithCoupon    = data.couponUsage.reduce((s, c) => s + c.uses, 0)
  const ordersWithoutCoupon = data.totalOrders - ordersWithCoupon
  const totalDiscount       = data.couponUsage.reduce((s, c) => s + c.totalDiscount, 0)

  const pieData = [
    { name: 'With Coupon',    value: ordersWithCoupon,    color: C.indigo },
    { name: 'Without Coupon', value: ordersWithoutCoupon, color: '#e5e7eb' },
  ].filter(d => d.value > 0)

  return (
    <ChartCard title="Coupon Performance" action={
      data.couponUsage.length > 0 ? (
        <span className="text-xs text-gray-500">Total discount: <strong className="text-gray-900">{fmtINR(totalDiscount)}</strong></span>
      ) : undefined
    }>
      {data.couponUsage.length === 0 ? (
        <Empty msg="No coupon usage in this period." />
      ) : (
        <div className="grid sm:grid-cols-2 gap-6 items-start">
          <div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={2}>
                  {pieData.map((it, i) => <Cell key={i} fill={it.color} />)}
                </Pie>
                <Tooltip formatter={((v: number, name: string) => [v.toLocaleString('en-IN'), name]) as any} />
              </PieChart>
            </ResponsiveContainer>
            <DonutLegend items={pieData.map(d => ({
              label: d.name, value: d.value, color: d.color,
              pct: data.totalOrders > 0 ? (d.value / data.totalOrders) * 100 : 0,
            }))} />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600 mb-2">Top Coupons</p>
            {data.couponUsage.slice(0, 6).map(cu => (
              <div key={cu.code} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono font-semibold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded truncate">{cu.code}</span>
                <span className="text-gray-500">{cu.uses} uses</span>
                <span className="text-green-700 font-semibold shrink-0">{fmtINR(cu.totalDiscount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartCard>
  )
}

// ── Customer section ──────────────────────────────────────────────

function CustomerSection({ data }: { data: AnalyticsData }) {
  const total = data.newCustomers + data.returningCustomers || 1
  const pieData = [
    { name: 'New',       value: data.newCustomers,       color: C.indigo },
    { name: 'Returning', value: data.returningCustomers, color: C.blue   },
  ].filter(d => d.value > 0)

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <ChartCard title="Customer Segments">
        {pieData.length === 0 ? <Empty /> : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name"
                  cx="50%" cy="50%" outerRadius={65} innerRadius={40} paddingAngle={2}>
                  {pieData.map((it, i) => <Cell key={i} fill={it.color} />)}
                </Pie>
                <Tooltip formatter={((v: number, name: string) => [v.toLocaleString('en-IN'), name]) as any} />
              </PieChart>
            </ResponsiveContainer>
            <DonutLegend items={pieData.map(d => ({
              label: d.name, value: d.value, color: d.color,
              pct: total > 0 ? (d.value / total) * 100 : 0,
            }))} />
          </>
        )}
      </ChartCard>
      <div className="space-y-3">
        {[
          { label: 'Total Customers', value: data.totalCustomers, icon: Users, color: C.indigo },
          { label: 'New Customers',   value: data.newCustomers,   icon: Users, color: C.green },
          { label: 'Returning',       value: data.returningCustomers, icon: Users, color: C.blue },
        ].map(kpi => (
          <KPI key={kpi.label} label={kpi.label} value={kpi.value.toLocaleString('en-IN')} icon={kpi.icon} color={kpi.color} />
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────

export default function Analytics() {
  const [preset,     setPreset]     = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const range = useMemo((): DateRange => {
    if (preset === 'custom' && customFrom && customTo) {
      return { from: new Date(customFrom + 'T00:00:00'), to: new Date(customTo + 'T23:59:59') }
    }
    return getRange(preset)
  }, [preset, customFrom, customTo])

  const { data, isLoading, error, refetch } = useAnalytics(range)

  return (
    <div className="p-4 sm:p-6 space-y-5 bg-gray-50 min-h-screen">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart2 size={20} className="text-gray-700" />
            <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Revenue, orders, customers &amp; regional performance</p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <button onClick={() => exportCSV(data, range)}
              className="flex items-center gap-1.5 text-xs border border-gray-300 text-gray-600 px-3 py-2 rounded-lg hover:bg-white transition-colors">
              <Download size={13} /> Export CSV
            </button>
          )}
          <button onClick={() => refetch()} disabled={isLoading}
            className="flex items-center gap-1.5 text-xs border border-gray-300 text-gray-600 px-3 py-2 rounded-lg hover:bg-white transition-colors">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Date range ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
        <div className="flex flex-wrap gap-1.5 items-center">
          {PRESETS.map(p => (
            <button key={p.value} onClick={() => setPreset(p.value)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${preset === p.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 ml-1">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-900" />
              <span className="text-gray-400 text-xs">–</span>
              <input type="date" value={customTo} min={customFrom || undefined} onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-900" />
            </div>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} />
            <span>Failed to load analytics: {(error as Error).message}</span>
          </div>
          <button onClick={() => refetch()} className="text-xs text-red-600 underline hover:text-red-800 shrink-0">Retry</button>
        </div>
      )}

      {/* ── KPIs ── */}
      {isLoading && !data ? <KPISkel /> : data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPI label="Total Revenue"     value={fmtINR(data.totalRevenue)}      icon={IndianRupee} color={C.indigo} />
          <KPI label="Total Orders"      value={data.totalOrders}               icon={ShoppingBag} color={C.blue} />
          <KPI label="Avg Order Value"   value={fmtINR(data.averageOrderValue)} icon={TrendingUp}  color={C.green} />
          <KPI label="Total Customers"   value={data.totalCustomers}            icon={Users}       color={C.sky} />
          <KPI label="New Customers"     value={data.newCustomers}              icon={Users}       color={C.purple} sub={`${data.returningCustomers} returning`} />
          <KPI label="Cancelled Orders"  value={data.cancelledOrders}           icon={XCircle}     color={C.red}    sub={`${data.cancellationRate}% rate`} />
          <KPI label="COD Orders"        value={data.codOrders}                 icon={Truck}       color={C.amber} />
          <KPI label="Prepaid Orders"    value={data.prepaidOrders}             icon={CreditCard}  color={C.teal} />
        </div>
      )}

      {/* ── Revenue chart (full width) ── */}
      {isLoading && !data ? <Sk className="h-80" /> : data && <RevenueChart data={data} />}

      {/* ── Orders & Payment ── */}
      {isLoading && !data ? (
        <div className="grid sm:grid-cols-2 gap-4"><Sk className="h-64" /><Sk className="h-64" /></div>
      ) : data && (
        <div className="grid sm:grid-cols-2 gap-4">
          <StatusChart data={data} />
          <PaymentChart data={data} />
        </div>
      )}

      {/* ── Customers ── */}
      {isLoading && !data ? <Sk className="h-48" /> : data && <CustomerSection data={data} />}

      {/* ── Geographic ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <MapPin size={14} /> Geographic Performance
        </h2>
        {isLoading && !data ? <Sk className="h-64" /> : data && <GeoSection data={data} />}
      </div>

      {/* ── Catalog ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Package size={14} /> Catalog Performance
        </h2>
        {isLoading && !data ? <Sk className="h-64" /> : data && <CatalogSection data={data} />}
      </div>

      {/* ── Coupons ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
          <Tag size={14} /> Coupon Analytics
        </h2>
        {isLoading && !data ? <Sk className="h-40" /> : data && <CouponSection data={data} />}
      </div>

    </div>
  )
}
