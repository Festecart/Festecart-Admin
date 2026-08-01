import { useQuery } from '@tanstack/react-query'
import {
  db, collection, getDocs, query, where, orderBy, Timestamp,
} from '@/lib/firebase'
import type {
  DateRange, AnalyticsData,
  RevenueByDay, RevenueByMonth, SalesByGeo, SalesByCategory, TopProduct,
  StatusCount, PaymentCount, CouponUsageSummary, CustomerDetail,
} from '@/types/analytics'

// ── Normalize geo strings ─────────────────────────────────────────

function normalizeGeo(s: unknown): string {
  if (!s) return 'Unknown'
  return String(s).trim().toLowerCase()
}

// ── Pure aggregation function (exported for testing) ─────────────

export function aggregateOrders(
  orders: Record<string, any>[],
  productCategoryMap: Map<string, string>,
): AnalyticsData {
  let totalRevenue = 0
  let totalOrders = orders.length
  let cancelledOrders = 0
  let codOrders = 0
  let prepaidOrders = 0

  const revenueByDayMap  = new Map<string, RevenueByDay>()
  const revenueByMonthMap = new Map<string, RevenueByMonth>()
  const byPincode  = new Map<string, SalesByGeo>()
  const byCity     = new Map<string, SalesByGeo>()
  const byState    = new Map<string, SalesByGeo>()
  const byCategory = new Map<string, SalesByCategory>()
  const byProduct  = new Map<string, TopProduct>()
  const byStatus   = new Map<string, StatusCount>()
  const byPayment  = new Map<string, PaymentCount>()
  const byCoupon   = new Map<string, CouponUsageSummary>()

  const customerSet     = new Set<string>()       // uid or guest_email
  const firstOrderMap   = new Map<string, number>() // customer → earliest order ts
  // customer detail accumulator
  type CustAcc = { name: string; email: string; orders: number; spent: number; lastTs: number }
  const customerMap = new Map<string, CustAcc>()

  for (const order of orders) {
    const status = order.status ?? 'pending'

    // Status breakdown
    const sc = byStatus.get(status) ?? { status, count: 0 }
    sc.count++
    byStatus.set(status, sc)

    // Cancelled
    if (status === 'cancelled') {
      cancelledOrders++
      continue // exclude cancelled from revenue metrics
    }

    const total: number = order.total ?? 0
    totalRevenue += total

    // Payment method
    const method: string = order.payment_method ?? 'cod'
    const pm = byPayment.get(method) ?? { method, count: 0, revenue: 0 }
    pm.count++
    pm.revenue += total
    byPayment.set(method, pm)
    if (method === 'cod') codOrders++
    else prepaidOrders++

    // Customer deduplication
    const customerId: string = order.user_id ? `uid:${order.user_id}` : `email:${(order.guest_email ?? '').toLowerCase()}`
    if (customerId && customerId !== 'uid:null' && customerId !== 'email:') {
      customerSet.add(customerId)
      const orderTs: number = order.created_at?.toMillis?.() ?? Date.now()
      const existing = firstOrderMap.get(customerId)
      if (existing === undefined || orderTs < existing) {
        firstOrderMap.set(customerId, orderTs)
      }
      // Build customer detail
      const name  = order.customer_name  ?? order.shipping_address?.name ?? 'Guest'
      const email = order.guest_email    ?? order.customer_email          ?? ''
      const acc   = customerMap.get(customerId) ?? { name, email, orders: 0, spent: 0, lastTs: 0 }
      acc.orders++
      acc.spent   += total
      if (orderTs > acc.lastTs) { acc.lastTs = orderTs; acc.name = name || acc.name; acc.email = email || acc.email }
      customerMap.set(customerId, acc)
    }

    // Time series
    const d = order.created_at?.toDate?.() ?? new Date()
    const dateKey  = d.toISOString().slice(0, 10)
    const monthKey = d.toISOString().slice(0, 7)

    const rbd = revenueByDayMap.get(dateKey) ?? { date: dateKey, revenue: 0, orders: 0 }
    rbd.revenue += total; rbd.orders++
    revenueByDayMap.set(dateKey, rbd)

    const rbm = revenueByMonthMap.get(monthKey) ?? { month: monthKey, revenue: 0, orders: 0 }
    rbm.revenue += total; rbm.orders++
    revenueByMonthMap.set(monthKey, rbm)

    // Geographic
    const addr = order.shipping_address ?? {}
    const pincode = normalizeGeo(addr.pincode)
    const city    = normalizeGeo(addr.city)
    const state   = normalizeGeo(addr.state)

    const pp = byPincode.get(pincode) ?? { name: pincode, revenue: 0, orders: 0 }
    pp.revenue += total; pp.orders++
    byPincode.set(pincode, pp)

    const cp = byCity.get(city) ?? { name: city, revenue: 0, orders: 0 }
    cp.revenue += total; cp.orders++
    byCity.set(city, cp)

    const sp = byState.get(state) ?? { name: state, revenue: 0, orders: 0 }
    sp.revenue += total; sp.orders++
    byState.set(state, sp)

    // Catalog
    for (const item of (order.items ?? [])) {
      const pid      = item.product_id ?? ''
      const category = productCategoryMap.get(pid) ?? 'Uncategorized'
      const itemRev  = (item.price ?? 0) * (item.quantity ?? 1)
      const itemQty  = item.quantity ?? 1

      const bc = byCategory.get(category) ?? { category, revenue: 0, orders: 0, units: 0 }
      bc.revenue += itemRev; bc.orders++; bc.units += itemQty
      byCategory.set(category, bc)

      const bp = byProduct.get(pid) ?? { productId: pid, name: item.name ?? pid, units: 0, revenue: 0 }
      bp.units += itemQty; bp.revenue += itemRev
      byProduct.set(pid, bp)
    }

    // Coupon
    if (order.coupon_code) {
      const code = String(order.coupon_code).toUpperCase()
      const cu = byCoupon.get(code) ?? { code, uses: 0, totalDiscount: 0 }
      cu.uses++
      cu.totalDiscount += (order.coupon_discount ?? 0)
      byCoupon.set(code, cu)
    }
  }

  // New vs returning: a customer is "new" if their first order falls within the
  // aggregated order set (we can only classify within the fetched window)
  const rangeStart = orders.length ? (orders[orders.length - 1]?.created_at?.toMillis?.() ?? 0) : 0
  let newCustomers = 0, returningCustomers = 0
  for (const [, firstTs] of firstOrderMap.entries()) {
    if (firstTs >= rangeStart) newCustomers++
    else returningCustomers++
  }

  // Build customer list with new/returning flag
  const customerList: CustomerDetail[] = Array.from(customerMap.entries()).map(([cid, acc]) => {
    const firstTs = firstOrderMap.get(cid) ?? 0
    return {
      id: cid,
      name:  acc.name  || 'Guest',
      email: acc.email || '—',
      orders: acc.orders,
      totalSpent: acc.spent,
      isNew: firstTs >= rangeStart,
      lastOrderDate: acc.lastTs ? new Date(acc.lastTs).toISOString().slice(0, 10) : '',
    }
  }).sort((a, b) => b.totalSpent - a.totalSpent)

  const totalCustomers = customerSet.size
  const averageOrderValue = (totalOrders - cancelledOrders) > 0
    ? Math.round(totalRevenue / (totalOrders - cancelledOrders))
    : 0
  const cancellationRate = totalOrders > 0
    ? Math.round((cancelledOrders / totalOrders) * 100)
    : 0

  return {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    totalCustomers,
    newCustomers,
    returningCustomers,
    cancelledOrders,
    cancellationRate,
    codOrders,
    prepaidOrders,
    revenueByDay:     Array.from(revenueByDayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    revenueByMonth:   Array.from(revenueByMonthMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
    salesByPincode:   Array.from(byPincode.values()).sort((a, b) => b.orders - a.orders).slice(0, 15),
    salesByCity:      Array.from(byCity.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 20),
    salesByState:     Array.from(byState.values()).sort((a, b) => b.revenue - a.revenue),
    salesByCategory:  Array.from(byCategory.values()).sort((a, b) => b.revenue - a.revenue),
    topProducts:      Array.from(byProduct.values()).sort((a, b) => b.units - a.units).slice(0, 10),
    statusBreakdown:  Array.from(byStatus.values()),
    paymentBreakdown: Array.from(byPayment.values()),
    couponUsage:      Array.from(byCoupon.values()).sort((a, b) => b.uses - a.uses),
    customerList,
  }
}

// ── useAnalytics hook ─────────────────────────────────────────────

export function useAnalytics(range: DateRange) {
  return useQuery({
    queryKey: ['analytics', range.from.toISOString(), range.to.toISOString()],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<AnalyticsData> => {
      const [ordersSnap, productsSnap] = await Promise.all([
        getDocs(
          query(
            collection(db, 'orders'),
            where('created_at', '>=', Timestamp.fromDate(range.from)),
            where('created_at', '<=', Timestamp.fromDate(range.to)),
            orderBy('created_at', 'desc'),
          )
        ),
        getDocs(collection(db, 'products')),
      ])

      // Build product → category map
      const productCategoryMap = new Map<string, string>()
      for (const d of productsSnap.docs) {
        const data = d.data()
        productCategoryMap.set(d.id, data.category_name ?? data.category ?? 'Uncategorized')
      }

      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      return aggregateOrders(orders, productCategoryMap)
    },
  })
}
