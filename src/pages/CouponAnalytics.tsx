import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, CalendarDays, ChevronRight, CircleDollarSign,
  Loader2, Package, RefreshCw, ShoppingBag, Users,
} from 'lucide-react'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { useCoupons } from '@/hooks/useCoupons'
import { useCouponOrders } from '@/hooks/useOrders'
import { useAffiliateOrders, useAffiliateProfile } from '@/hooks/useAffiliate'
import type { CouponListRow } from '@/types/coupon'
import type { Order } from '@/types'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { app } from '@/lib/firebase'

function localDateKey(dateString: string): string {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function customerFor(order: Order) {
  const billingAddress = typeof order.billing_address === 'object' ? order.billing_address : null
  return {
    name: order.guest_name || order.shipping_address?.name || billingAddress?.name || 'Customer',
    phone: order.guest_phone || order.shipping_address?.phone || billingAddress?.phone || '—',
    email: order.guest_email || order.customer_email || '—',
  }
}

function couponDiscount(order: Order): number | null {
  const amount = order.coupon_discount
  return amount != null && Number.isFinite(amount) ? amount : null
}

function CouponCard({ coupon }: { coupon: CouponListRow }) {
  return (
    <Link
      to={`/coupons/analytics/${coupon.id}`}
      className="group flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 transition hover:border-gray-400 hover:shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700">
          <BarChart3 size={20} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-gray-900">{coupon.code}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${coupon.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {coupon.is_active ? 'Active' : 'Inactive'}
            </span>
            {coupon.affiliate_id && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                Affiliate
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {coupon.total_uses} recorded {coupon.total_uses === 1 ? 'use' : 'uses'}
            <span className="mx-2 text-gray-300">·</span>
            Valid through {coupon.valid_to || '—'}
          </p>
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-gray-700" />
    </Link>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: typeof ShoppingBag
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <span className="rounded-lg bg-gray-100 p-2.5 text-gray-600">
          <Icon size={19} />
        </span>
      </div>
      <p className="mt-2 text-xs text-gray-500">{detail}</p>
    </div>
  )
}

export default function CouponAnalytics() {
  const { couponId } = useParams<{ couponId: string }>()
  const navigate = useNavigate()
  const { data: coupons, isLoading: couponsLoading, error: couponsError } = useCoupons()
  const selectedCoupon = coupons?.find(coupon => coupon.id === couponId)
  const {
    data: couponOrders,
    isLoading: ordersLoading,
    error: ordersError,
    refetch,
    isFetching,
  } = useCouponOrders(selectedCoupon?.code ?? '')
  const affiliateProfileQuery = useAffiliateProfile(selectedCoupon?.affiliate_id ?? undefined)
  const affiliateOrdersQuery = useAffiliateOrders(selectedCoupon?.affiliate_id ?? undefined)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [specificDate, setSpecificDate] = useState('')
  const [rebuildingAnalytics, setRebuildingAnalytics] = useState(false)
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null)
  const [rebuildError, setRebuildError] = useState<string | null>(null)

  const validRange = !fromDate || !toDate || fromDate <= toDate
  const filteredOrders = useMemo(() => {
    if (!validRange) return []
    return (couponOrders ?? [])
      .filter(order => order.status !== 'cancelled')
      .filter(order => {
        const orderDate = localDateKey(order.created_at)
        if (!orderDate) return false
        if (specificDate) return orderDate === specificDate
        return (!fromDate || orderDate >= fromDate) && (!toDate || orderDate <= toDate)
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [couponOrders, fromDate, specificDate, toDate, validRange])

  const productRows = useMemo(() => {
    const products = new Map<string, { id: string; name: string; quantity: number; orders: number }>()
    for (const order of filteredOrders) {
      const productsInOrder = new Set<string>()
      for (const item of order.items ?? []) {
        const id = item.product_id || item.name || 'unknown'
        const product = products.get(id) ?? {
          id,
          name: item.name || 'Unnamed product',
          quantity: 0,
          orders: 0,
        }
        product.quantity += Number(item.quantity) || 0
        productsInOrder.add(id)
        products.set(id, product)
      }
      for (const id of productsInOrder) {
        const product = products.get(id)
        if (product) product.orders += 1
      }
    }
    return [...products.values()].sort((a, b) => b.quantity - a.quantity)
  }, [filteredOrders])

  const totalUnits = productRows.reduce((sum, product) => sum + product.quantity, 0)
  const totalDiscount = filteredOrders.reduce((sum, order) => sum + (couponDiscount(order) ?? 0), 0)
  const recordedDiscountOrders = filteredOrders.filter(order => couponDiscount(order) !== null).length
  const affiliateLedger = new Map((affiliateOrdersQuery.data ?? []).map(order => [order.order_id, order]))
  const commissionDue = filteredOrders.reduce(
    (sum, order) => sum + (affiliateLedger.get(order.id)?.commission_earned ?? 0),
    0,
  )
  const commissionSyncPending = filteredOrders.filter(order => !affiliateLedger.has(order.id)).length

  const rebuildAffiliateAnalytics = async () => {
    const couponIdToSync = selectedCoupon?.id
    if (!couponIdToSync || !selectedCoupon?.affiliate_id) return
    setRebuildingAnalytics(true)
    setRebuildMessage(null)
    setRebuildError(null)
    try {
      const rebuild = httpsCallable<
        { coupon_id: string },
        { orders_processed: number }
      >(getFunctions(app, 'us-central1'), 'rebuildAffiliateCouponAnalytics')
      const result = await rebuild({ coupon_id: couponIdToSync })
      await Promise.all([affiliateOrdersQuery.refetch(), refetch()])
      const count = result.data.orders_processed
      setRebuildMessage(`Synced commission records for ${count} ${count === 1 ? 'order' : 'orders'}.`)
    } catch (error) {
      setRebuildError(error instanceof Error ? error.message : 'Could not sync affiliate commissions.')
    } finally {
      setRebuildingAnalytics(false)
    }
  }

  if (!couponId) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link to="/coupons" className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
              <ArrowLeft size={16} /> Back to Coupons
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Coupon Analytics</h1>
            <p className="mt-1 text-sm text-gray-500">Choose a coupon to review its orders, product quantities, and discounts.</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            {coupons?.length ?? 0} {coupons?.length === 1 ? 'coupon' : 'coupons'}
          </div>
        </div>

        {couponsLoading && (
          <div className="flex justify-center py-20">
            <Loader2 size={28} className="animate-spin text-gray-400" />
          </div>
        )}
        {couponsError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Failed to load coupons: {(couponsError as Error).message}
          </div>
        )}
        {!couponsLoading && !couponsError && !coupons?.length && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
            <BarChart3 size={28} className="mx-auto text-gray-300" />
            <p className="mt-3 font-medium text-gray-700">No coupons to analyze</p>
            <p className="mt-1 text-sm text-gray-500">Create a coupon to see its order analytics here.</p>
            <button
              onClick={() => navigate('/coupons/add')}
              className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Create a coupon
            </button>
          </div>
        )}
        {!couponsLoading && !couponsError && !!coupons?.length && (
          <div className="grid gap-3 md:grid-cols-2">
            {coupons.map(coupon => <CouponCard key={coupon.id} coupon={coupon} />)}
          </div>
        )}
      </div>
    )
  }

  if (couponsLoading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (couponsError) {
    return (
      <div className="m-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load coupon: {(couponsError as Error).message}
      </div>
    )
  }

  if (!selectedCoupon) {
    return (
      <div className="space-y-4 p-6">
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This coupon could not be found. It may have been deleted.
        </p>
        <Link to="/coupons/analytics" className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900">
          <ArrowLeft size={16} /> View all coupons
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/coupons/analytics" className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft size={16} /> All Coupons
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Coupon Analytics</h1>
            <span className="rounded-md bg-gray-100 px-2.5 py-1 font-mono text-sm font-semibold text-gray-700">{selectedCoupon.code}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Non-cancelled orders and the products purchased using this coupon.</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Loader2 size={15} className={isFetching ? 'animate-spin' : 'hidden'} />
          {isFetching ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <section aria-label="Filter orders" className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-800">
          <CalendarDays size={17} className="text-gray-500" /> Filter by order date
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-600">From</span>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              disabled={!!specificDate}
              onChange={event => setFromDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-100 disabled:bg-gray-100"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-600">To</span>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              disabled={!!specificDate}
              onChange={event => setToDate(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-100 disabled:bg-gray-100"
            />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="font-medium text-gray-600">Specific date</span>
            <input
              type="date"
              value={specificDate}
              onChange={event => {
                setSpecificDate(event.target.value)
                if (event.target.value) {
                  setFromDate('')
                  setToDate('')
                }
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-800 outline-none focus:border-gray-500 focus:ring-2 focus:ring-gray-100"
            />
          </label>
        </div>
        {!validRange && <p role="alert" className="mt-3 text-sm text-red-600">The start date must be on or before the end date.</p>}
        {(fromDate || toDate || specificDate) && (
          <button
            type="button"
            onClick={() => {
              setFromDate('')
              setToDate('')
              setSpecificDate('')
            }}
            className="mt-3 text-sm font-medium text-gray-600 underline decoration-gray-300 underline-offset-2 hover:text-gray-900"
          >
            Clear date filter
          </button>
        )}
      </section>

      {ordersError && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Failed to load orders for {selectedCoupon.code}: {(ordersError as Error).message}
        </div>
      )}

      {selectedCoupon.affiliate_id && (
        <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-indigo-50 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-violet-100 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Affiliate partner</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">
                {affiliateProfileQuery.data?.name ?? (affiliateProfileQuery.isLoading ? 'Loading affiliate…' : 'Affiliate')}
              </h2>
              <p className="mt-1 text-sm text-gray-500">Commission terms and contact details for this coupon.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void rebuildAffiliateAnalytics()}
                disabled={rebuildingAnalytics}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw size={15} className={rebuildingAnalytics ? 'animate-spin' : ''} />
                {rebuildingAnalytics ? 'Syncing orders…' : 'Sync commission records'}
              </button>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">Affiliate coupon</span>
            </div>
          </div>
          {affiliateProfileQuery.error ? (
            <p role="alert" className="px-5 py-4 text-sm text-red-700">Affiliate details could not be loaded: {(affiliateProfileQuery.error as Error).message}</p>
          ) : affiliateProfileQuery.isLoading ? (
            <div className="flex items-center gap-2 px-5 py-5 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading affiliate details…</div>
          ) : affiliateProfileQuery.data && (
            <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
              <div><p className="text-xs font-medium uppercase tracking-wide text-gray-400">Email</p><p className="mt-1 break-all text-sm font-medium text-gray-800">{affiliateProfileQuery.data.email}</p></div>
              <div><p className="text-xs font-medium uppercase tracking-wide text-gray-400">Phone number</p><p className="mt-1 text-sm font-medium text-gray-800">{affiliateProfileQuery.data.phone}</p></div>
              <div><p className="text-xs font-medium uppercase tracking-wide text-gray-400">Commission rate</p><p className="mt-1 text-sm font-medium text-gray-800">{affiliateProfileQuery.data.commission_type === 'flat' ? `${formatCurrency(affiliateProfileQuery.data.commission_value)} per eligible order` : `${affiliateProfileQuery.data.commission_value}% of product subtotal`}</p></div>
              <div><p className="text-xs font-medium uppercase tracking-wide text-gray-400">Commission ledger</p><p className="mt-1 text-sm font-medium text-gray-800">{affiliateOrdersQuery.isLoading ? 'Updating…' : `${affiliateOrdersQuery.data?.length ?? 0} orders tracked`}</p></div>
            </div>
          )}
        </section>
      )}

      {rebuildMessage && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {rebuildMessage}
        </p>
      )}
      {rebuildError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Affiliate commission sync failed: {rebuildError}
        </p>
      )}

      {affiliateOrdersQuery.error && selectedCoupon.affiliate_id && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Affiliate commission data could not be loaded: {(affiliateOrdersQuery.error as Error).message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Orders" value={ordersLoading ? '—' : filteredOrders.length.toLocaleString('en-IN')} detail="Cancelled orders excluded" icon={ShoppingBag} />
        <MetricCard label="Products ordered" value={ordersLoading ? '—' : totalUnits.toLocaleString('en-IN')} detail={`${productRows.length} unique ${productRows.length === 1 ? 'product' : 'products'}`} icon={Package} />
        <MetricCard label="Coupon discounts" value={ordersLoading ? '—' : formatCurrency(totalDiscount)} detail={`${recordedDiscountOrders} orders with a recorded discount`} icon={CircleDollarSign} />
        <MetricCard label="Customers" value={ordersLoading ? '—' : new Set(filteredOrders.map(order => order.user_id || customerFor(order).email || order.id)).size.toLocaleString('en-IN')} detail="Based on distinct customer accounts or emails" icon={Users} />
        {selectedCoupon.affiliate_id && (
          <MetricCard
            label="Commission to pay"
            value={affiliateOrdersQuery.isLoading ? '—' : affiliateOrdersQuery.error ? 'Unavailable' : formatCurrency(commissionDue)}
            detail={affiliateOrdersQuery.error ? 'Commission ledger unavailable' : commissionSyncPending ? `${commissionSyncPending} order(s) awaiting commission sync` : 'Cancelled orders excluded'}
            icon={CircleDollarSign}
          />
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Products ordered</h2>
          <p className="mt-1 text-sm text-gray-500">Quantity and number of orders for each product in the filtered period.</p>
        </div>
        {ordersLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 size={18} className="animate-spin" /> Loading coupon orders...
          </div>
        ) : ordersError ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">Product analytics are unavailable because the orders could not be loaded.</div>
        ) : productRows.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">No products found for the selected date filter.</div>
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
                {productRows.map(product => (
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

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Orders using {selectedCoupon.code}</h2>
          <p className="mt-1 text-sm text-gray-500">Customer contact details and coupon discount recorded against each order.</p>
        </div>
        {ordersLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 size={18} className="animate-spin" /> Loading coupon orders...
          </div>
        ) : ordersError ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">Orders could not be loaded.</div>
        ) : filteredOrders.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-500">No non-cancelled orders found for this coupon and date filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-left font-semibold">Order</th>
                  <th className="px-5 py-3 text-left font-semibold">Customer</th>
                  <th className="px-5 py-3 text-left font-semibold">Products &amp; quantity</th>
                  <th className="px-5 py-3 text-left font-semibold">Order date</th>
                  <th className="px-5 py-3 text-right font-semibold">Coupon amount</th>
                  {selectedCoupon.affiliate_id && <th className="px-5 py-3 text-right font-semibold">Commission</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.map(order => {
                  const customer = customerFor(order)
                  const discount = couponDiscount(order)
                  return (
                    <tr key={order.id} className="align-top hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <Link to={`/orders/${order.id}`} className="font-semibold text-blue-700 hover:underline">
                          {order.order_number || order.id}
                        </Link>
                      </td>
                      <td className="max-w-[250px] px-5 py-4">
                        <p className="font-medium text-gray-900">{customer.name}</p>
                        <p className="mt-1 break-all text-xs text-gray-500">{customer.phone}</p>
                        <p className="break-all text-xs text-gray-500">{customer.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        <ul className="space-y-1 text-gray-700">
                          {(order.items ?? []).map((item, index) => (
                            <li key={`${item.product_id || item.name}-${index}`}>
                              <span>{item.name || 'Unnamed product'}</span>
                              <span className="ml-2 text-gray-500">× {Number(item.quantity) || 0}</span>
                            </li>
                          ))}
                          {!order.items?.length && <li className="text-gray-400">No product items recorded</li>}
                        </ul>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-gray-600">{formatDateShort(order.created_at)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-gray-900">
                        {discount === null ? <span className="font-normal text-gray-400">Not recorded</span> : formatCurrency(discount)}
                      </td>
                      {selectedCoupon.affiliate_id && (
                        <td className="whitespace-nowrap px-5 py-4 text-right font-semibold text-emerald-700">
                              {affiliateOrdersQuery.error ? 'Unavailable' : affiliateOrdersQuery.isLoading ? '…' : affiliateLedger.has(order.id)
                            ? formatCurrency(affiliateLedger.get(order.id)!.commission_earned)
                            : 'Awaiting sync'}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-gray-400">
        Order timestamps use the browser’s local timezone. Coupon discount totals include only discount amounts recorded on the orders.
      </p>
    </div>
  )
}
