import { useMemo, useState } from 'react'
import {
  BadgePercent, CalendarDays, Check, Copy, IndianRupee, Loader2, Package,
  RefreshCw, ShoppingBag, Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAffiliateOrders, useAffiliateProfile } from '@/hooks/useAffiliate'
import type { AffiliateOrder } from '@/types/affiliate'
import { formatCurrency, formatDateShort } from '@/lib/utils'

function localDateKey(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function ProductTable({ orders, loading, error }: {
  orders: AffiliateOrder[]
  loading: boolean
  error: boolean
}) {
  const products = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; quantity: number; orders: number }>()
    for (const order of orders) {
      const orderProducts = new Set<string>()
      for (const item of order.products) {
        const id = item.product_id || item.name || 'unknown'
        const row = rows.get(id) ?? { id, name: item.name || 'Unnamed product', quantity: 0, orders: 0 }
        row.quantity += Number(item.quantity) || 0
        orderProducts.add(id)
        rows.set(id, row)
      }
      for (const id of orderProducts) {
        const row = rows.get(id)
        if (row) row.orders += 1
      }
    }
    return [...rows.values()].sort((a, b) => b.quantity - a.quantity)
  }, [orders])

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="font-semibold text-gray-900">Products ordered</h2>
        <p className="mt-1 text-sm text-gray-500">Items sold through your coupon after removing cancelled orders.</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-400" /></div>
      ) : error ? (
        <p className="px-5 py-10 text-center text-sm text-red-600">Product analytics could not be loaded.</p>
      ) : products.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">No products found for this date filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 text-left font-semibold">Product</th>
                <th className="px-5 py-3 text-right font-semibold">Qty ordered</th>
                <th className="px-5 py-3 text-right font-semibold">Orders</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map(product => (
                <tr key={product.id}>
                  <td className="px-5 py-3 font-medium text-gray-800">{product.name}</td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">{product.quantity.toLocaleString('en-IN')}</td>
                  <td className="px-5 py-3 text-right text-gray-600">{product.orders.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value, hint, icon: Icon, tone }: {
  label: string
  value: string
  hint: string
  icon: typeof ShoppingBag
  tone: string
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
        </div>
        <span className={`rounded-xl p-3 ${tone}`}><Icon size={19} /></span>
      </div>
      <p className="mt-2 text-xs text-gray-500">{hint}</p>
    </div>
  )
}

export default function AffiliateDashboard() {
  const { affiliateId } = useAuth()
  const profileQuery = useAffiliateProfile(affiliateId ?? undefined)
  const ordersQuery = useAffiliateOrders(affiliateId ?? undefined)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [specificDate, setSpecificDate] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const validRange = !fromDate || !toDate || fromDate <= toDate
  const isRefreshing = profileQuery.isFetching || ordersQuery.isFetching

  const handleCopyCode = async () => {
    setCopyError(null)
    setCodeCopied(false)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profileQuery.data?.coupon_code ?? '')
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = profileQuery.data?.coupon_code ?? ''
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        let copied = false
        try {
          textarea.select()
          copied = document.execCommand('copy')
        } finally {
          document.body.removeChild(textarea)
        }
        if (!copied) throw new Error('Clipboard access is unavailable.')
      }
      setCodeCopied(true)
    } catch (copyFailure) {
      setCopyError(copyFailure instanceof Error ? copyFailure.message : 'Clipboard access is unavailable.')
    }
  }

  const handleRefresh = async () => {
    setRefreshError(null)
    try {
      const results = await Promise.all([profileQuery.refetch(), ordersQuery.refetch()])
      const failedResult = results.find(result => result.error)
      if (failedResult?.error) {
        setRefreshError(failedResult.error instanceof Error ? failedResult.error.message : 'Could not refresh affiliate data.')
      }
    } catch (refreshFailure) {
      setRefreshError(refreshFailure instanceof Error ? refreshFailure.message : 'Could not refresh affiliate data.')
    }
  }

  const orders = useMemo(() => {
    if (!validRange) return []
    return (ordersQuery.data ?? [])
      .filter(order => order.status.toLowerCase() !== 'cancelled')
      .filter(order => {
        const date = localDateKey(order.created_at)
        if (!date) return false
        if (specificDate) return date === specificDate
        return (!fromDate || date >= fromDate) && (!toDate || date <= toDate)
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [fromDate, ordersQuery.data, specificDate, toDate, validRange])

  const quantity = orders.reduce((total, order) => total + order.product_quantity, 0)
  const commission = orders.reduce((total, order) => total + order.commission_earned, 0)
  const customers = new Set(orders.map(order => order.customer_id || order.customer_email || order.order_id)).size
  const profile = profileQuery.data

  if (profileQuery.isLoading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>
  }

  if (!profile) {
    return (
      <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">
        Affiliate account details could not be loaded. Please contact the administrator.
      </div>
    )
  }

  const commissionLabel = profile.commission_type === 'flat'
    ? `${formatCurrency(profile.commission_value)} per eligible order`
    : `${profile.commission_value}% of product subtotal`

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
      <header className="overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950 via-indigo-900 to-indigo-700 text-white shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-6 p-6 sm:p-8">
          <div>
            <p className="text-sm font-medium text-indigo-200">Affiliate dashboard</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Welcome, {profile.name}</h1>
            <p className="mt-2 text-sm text-indigo-100">Track the orders and commission generated by your coupon.</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-sm font-semibold">
                <BadgePercent size={16} /> {profile.coupon_code}
              </span>
              <button type="button" onClick={() => void handleCopyCode()}
                aria-label={codeCopied ? 'Coupon code copied' : 'Copy coupon code'}
                title={codeCopied ? 'Coupon code copied' : 'Copy coupon code'}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70">
                {codeCopied ? <Check size={16} /> : <Copy size={16} />}
                <span>{codeCopied ? 'Copied' : 'Copy coupon'}</span>
              </button>
              <span className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm">{commissionLabel}</span>
            </div>
            {copyError && <p role="alert" className="mt-2 text-sm text-red-100">Copy failed: {copyError}</p>}
            {codeCopied && <p role="status" className="mt-2 text-sm text-indigo-100">Coupon code copied to clipboard.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void handleRefresh()} disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <div className="rounded-xl border border-white/15 bg-black/10 px-4 py-3 text-sm text-indigo-100">
              {profile.email}
            </div>
          </div>
        </div>
      </header>

      {refreshError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Could not refresh affiliate data: {refreshError}
        </p>
      )}
      {profileQuery.error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Affiliate account details could not be refreshed. Showing the last loaded data.
        </p>
      )}

      <section aria-label="Filter affiliate orders" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
          <CalendarDays size={17} className="text-violet-600" /> Filter order dates
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-600">From</span>
            <input type="date" value={fromDate} max={toDate || undefined} disabled={!!specificDate}
              onChange={event => setFromDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-100" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-600">To</span>
            <input type="date" value={toDate} min={fromDate || undefined} disabled={!!specificDate}
              onChange={event => setToDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-gray-100" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-600">Specific date</span>
            <input type="date" value={specificDate}
              onChange={event => {
                setSpecificDate(event.target.value)
                if (event.target.value) {
                  setFromDate('')
                  setToDate('')
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
          </label>
        </div>
        {!validRange && <p role="alert" className="mt-3 text-sm text-red-600">The start date must be on or before the end date.</p>}
        {(fromDate || toDate || specificDate) && (
          <button type="button" onClick={() => { setFromDate(''); setToDate(''); setSpecificDate('') }}
            className="mt-3 text-sm font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900">
            Clear date filter
          </button>
        )}
      </section>

      {ordersQuery.error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Unable to load affiliate orders. Please refresh or contact the administrator.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Orders" value={ordersQuery.isLoading ? '—' : ordersQuery.error ? 'Unavailable' : orders.length.toLocaleString('en-IN')}
          hint="Cancelled orders excluded" icon={ShoppingBag} tone="bg-blue-50 text-blue-700" />
        <Metric label="Products ordered" value={ordersQuery.isLoading ? '—' : ordersQuery.error ? 'Unavailable' : quantity.toLocaleString('en-IN')}
          hint="Total product units sold" icon={Package} tone="bg-violet-50 text-violet-700" />
        <Metric label="Customers" value={ordersQuery.isLoading ? '—' : ordersQuery.error ? 'Unavailable' : customers.toLocaleString('en-IN')}
          hint="Distinct customers in this period" icon={Users} tone="bg-amber-50 text-amber-700" />
        <Metric label="Commission earned" value={ordersQuery.isLoading ? '—' : ordersQuery.error ? 'Unavailable' : formatCurrency(commission)}
          hint="Based on eligible orders in this period" icon={IndianRupee} tone="bg-emerald-50 text-emerald-700" />
      </div>

      <ProductTable orders={orders} loading={ordersQuery.isLoading} error={!!ordersQuery.error} />

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Orders using {profile.coupon_code}</h2>
          <p className="mt-1 text-sm text-gray-500">Customer and commission details for each eligible order.</p>
        </div>
        {ordersQuery.isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
        ) : ordersQuery.error ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">Orders could not be loaded.</p>
        ) : orders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">No non-cancelled orders found for this coupon and date filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Order</th>
                  <th className="px-5 py-3 text-left font-semibold">Customer</th>
                  <th className="px-5 py-3 text-left font-semibold">Products &amp; quantity</th>
                  <th className="px-5 py-3 text-left font-semibold">Date</th>
                  <th className="px-5 py-3 text-right font-semibold">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(order => (
                  <tr key={order.order_id} className="align-top hover:bg-violet-50/30">
                    <td className="px-5 py-4 font-semibold text-gray-900">{order.order_number}</td>
                    <td className="max-w-[250px] px-5 py-4">
                      <p className="font-medium text-gray-900">{order.customer_name || 'Customer'}</p>
                      <p className="mt-1 break-all text-xs text-gray-500">{order.customer_phone || '—'}</p>
                      <p className="break-all text-xs text-gray-500">{order.customer_email || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <ul className="space-y-1 text-gray-700">
                        {order.products.map((product, index) => (
                          <li key={`${product.product_id || product.name}-${index}`}>
                            {product.name} <span className="text-gray-500">× {product.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-gray-600">{formatDateShort(order.created_at)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-emerald-700">{formatCurrency(order.commission_earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-gray-400">Commissions are calculated on product quantities or item subtotal, excluding shipping. Cancelled orders do not count.</p>
    </div>
  )
}
