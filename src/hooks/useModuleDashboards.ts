import { useQuery } from '@tanstack/react-query'
import { useOrders } from '@/hooks/useOrders'
import {
  db, collection, getDocs, query, where, orderBy, Timestamp,
} from '@/lib/firebase'
import type { Order } from '@/types'
import type {
  DashboardCategory,
  DashboardCustomer,
  DashboardDateRange,
  DashboardOrderTrend,
  DashboardProduct,
  DeliveryTrend,
  ModuleDashboardData,
  OrdersDashboardCustomer,
  OrdersDashboardData,
  ShippingDashboardData,
} from '@/types/moduleDashboards'

interface OrderRecord {
  id: string
  data: Record<string, unknown>
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function money(value: unknown): number {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function orderDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate()
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizedPincode(value: unknown): string {
  return text(value)
}

function customerIdentity(order: Record<string, unknown>, id: string): string {
  const uid = text(order.user_id)
  if (uid) return `uid:${uid}`

  const email = (text(order.guest_email) || text(order.customer_email)).toLowerCase()
  if (email) return `email:${email}`

  const address = record(order.shipping_address)
  const phone = (text(order.guest_phone) || text(address?.phone)).replace(/[^\d+]/g, '')
  return phone ? `phone:${phone}` : `order:${id}`
}

function aggregateModuleDashboards(
  orders: OrderRecord[],
  categoryIdByProductId: Map<string, string>,
  categoryNamesById: Map<string, string>,
): ModuleDashboardData {
  const customers = new Map<string, DashboardCustomer>()
  const trends = new Map<string, DashboardOrderTrend>()
  const monthlyTrends = new Map<string, { month: string; orders: number; revenue: number }>()
  const products = new Map<string, DashboardProduct>()
  const categories = new Map<string, DashboardCategory>()
  let totalOrders = 0
  let totalRevenue = 0

  for (const { id, data } of orders) {
    if (data.status === 'cancelled') continue

    totalOrders++
    const orderTotal = money(data.total)
    totalRevenue += orderTotal

    const customerId = customerIdentity(data, id)
    const address = record(data.shipping_address)
    const customerName = text(data.guest_name) || text(address?.name) || 'Guest'
    const email = (text(data.guest_email) || text(data.customer_email)).toLowerCase()
    const phone = (text(data.guest_phone) || text(address?.phone)).replace(/[^\d+]/g, '')
    const customer = customers.get(customerId) ?? {
      id: customerId,
      name: customerName,
      email,
      phone,
      orders: 0,
      purchaseValue: 0,
      lastOrderDate: '',
    }
    customer.orders++
    customer.purchaseValue += orderTotal
    if (customer.name === 'Guest' && customerName !== 'Guest') customer.name = customerName
    if (!customer.email && email) customer.email = email
    if (!customer.phone && phone) customer.phone = phone
    customers.set(customerId, customer)

    const createdAt = orderDate(data.created_at)
    if (createdAt) {
      const key = dateKey(createdAt)
      const trend = trends.get(key) ?? { date: key, orders: 0, revenue: 0 }
      trend.orders++
      trend.revenue += orderTotal
      trends.set(key, trend)
      const month = key.slice(0, 7)
      const monthlyTrend = monthlyTrends.get(month) ?? { month, orders: 0, revenue: 0 }
      monthlyTrend.orders++
      monthlyTrend.revenue += orderTotal
      monthlyTrends.set(month, monthlyTrend)
      if (key > customer.lastOrderDate) customer.lastOrderDate = key
    }

    const seenCategoryIds = new Set<string>()
    const items = Array.isArray(data.items) ? data.items : []
    for (const rawItem of items) {
      const item = record(rawItem)
      if (!item) continue
      const productId = text(item.product_id)
      if (!productId) continue
      const quantity = Math.max(0, money(item.quantity ?? 1))
      const itemRevenue = money(item.price) * quantity
      const product = products.get(productId) ?? {
        id: productId,
        name: text(item.name) || productId,
        quantity: 0,
        revenue: 0,
      }
      product.quantity += quantity
      product.revenue += itemRevenue
      products.set(productId, product)

      const categoryId = categoryIdByProductId.get(productId) ?? ''
      const categoryName = categoryNamesById.get(categoryId) ?? 'Uncategorized'
      const categoryKey = categoryId || 'uncategorized'
      const category = categories.get(categoryKey) ?? {
        id: categoryKey,
        name: categoryName,
        orders: 0,
        quantity: 0,
        revenue: 0,
      }
      category.quantity += quantity
      category.revenue += itemRevenue
      if (!seenCategoryIds.has(categoryKey)) {
        category.orders++
        seenCategoryIds.add(categoryKey)
      }
      categories.set(categoryKey, category)
    }
  }

  const allCustomers = Array.from(customers.values()).sort(
    (a, b) => b.orders - a.orders || b.purchaseValue - a.purchaseValue,
  )

  const productList = Array.from(products.values())
  return {
    totalOrders,
    totalRevenue,
    totalCustomers: allCustomers.length,
    totalProductUnits: productList.reduce((sum, product) => sum + product.quantity, 0),
    totalProductRevenue: productList.reduce((sum, product) => sum + product.revenue, 0),
    uniqueProducts: productList.length,
    customers: allCustomers.slice(0, 10),
    allCustomers,
    orderTrends: Array.from(trends.values()).sort((a, b) => a.date.localeCompare(b.date)),
    monthlyOrderTrends: Array.from(monthlyTrends.values()).sort((a, b) => a.month.localeCompare(b.month)),
    products: productList
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 10),
    categories: Array.from(categories.values())
      .sort((a, b) => b.revenue - a.revenue),
  }
}

export function useModuleDashboardData(range: DashboardDateRange, withCatalog = true) {
  return useQuery({
    queryKey: ['module-dashboard-data', withCatalog, range.from.toISOString(), range.to.toISOString()],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<ModuleDashboardData> => {
      const [ordersSnapshot, catalogSnapshots] = await Promise.all([
        getDocs(query(
          collection(db, 'orders'),
          where('created_at', '>=', Timestamp.fromDate(range.from)),
          where('created_at', '<=', Timestamp.fromDate(range.to)),
          orderBy('created_at', 'desc'),
        )),
        withCatalog
          ? Promise.all([
              getDocs(collection(db, 'products')),
              getDocs(collection(db, 'categories')),
            ])
          : Promise.resolve(null),
      ])

      const categoryNamesById = new Map<string, string>()
      const categoryIdByProductId = new Map<string, string>()
      if (catalogSnapshots) {
        const [productsSnapshot, categoriesSnapshot] = catalogSnapshots
        for (const category of categoriesSnapshot.docs) {
          categoryNamesById.set(category.id, text(category.data().name) || 'Uncategorized')
        }
        for (const product of productsSnapshot.docs) {
          categoryIdByProductId.set(product.id, text(product.data().category_id))
        }
      }

      const orders = ordersSnapshot.docs.map(document => ({
        id: document.id,
        data: document.data(),
      }))
      return aggregateModuleDashboards(orders, categoryIdByProductId, categoryNamesById)
    },
  })
}

interface LifetimeCustomerSummary {
  orderCount: number
  purchaseValue: number
  firstOrderTimestamp: number
  lastOrderTimestamp: number
  name: string
  email: string
  phone: string
}

function getCustomerOrderFields(order: Order): Record<string, unknown> {
  return {
    user_id: order.user_id,
    guest_email: order.guest_email,
    customer_email: order.customer_email,
    guest_phone: order.guest_phone,
    shipping_address: order.shipping_address,
  }
}

function addLifetimeCustomerMetrics(
  data: ModuleDashboardData,
  orders: Order[],
  range: DashboardDateRange,
): OrdersDashboardData {
  const lifetimeCustomers = new Map<string, LifetimeCustomerSummary>()

  for (const order of orders) {
    if (order.status === 'cancelled') continue
    const customerId = customerIdentity(getCustomerOrderFields(order), order.id)
    const timestamp = orderDate(order.created_at)?.getTime() ?? 0
    const name = text(order.guest_name) || text(order.shipping_address?.name)
    const email = (text(order.guest_email) || text(order.customer_email)).toLowerCase()
    const phone = (text(order.guest_phone) || text(order.shipping_address?.phone)).replace(/[^\d+]/g, '')
    const summary = lifetimeCustomers.get(customerId) ?? {
      orderCount: 0,
      purchaseValue: 0,
      firstOrderTimestamp: timestamp,
      lastOrderTimestamp: timestamp,
      name,
      email,
      phone,
    }

    summary.orderCount++
    summary.purchaseValue += money(order.total)
    if (timestamp > 0 && (summary.firstOrderTimestamp === 0 || timestamp < summary.firstOrderTimestamp)) {
      summary.firstOrderTimestamp = timestamp
    }
    if (timestamp >= summary.lastOrderTimestamp) {
      summary.lastOrderTimestamp = timestamp
      if (name) summary.name = name
    }
    if (email) summary.email = email
    if (phone) summary.phone = phone
    lifetimeCustomers.set(customerId, summary)
  }

  const allCustomers: OrdersDashboardCustomer[] = data.allCustomers.map(customer => {
    const lifetime = lifetimeCustomers.get(customer.id)
    const lifetimeOrderCount = lifetime?.orderCount ?? customer.orders
    const lastOrder = lifetime?.lastOrderTimestamp
      ? new Date(lifetime.lastOrderTimestamp)
      : null
    const firstOrderTimestamp = lifetime?.firstOrderTimestamp ?? 0
    return {
      ...customer,
      name: customer.name === 'Guest' ? lifetime?.name || customer.name : customer.name,
      email: customer.email || lifetime?.email || '',
      phone: customer.phone || lifetime?.phone || '',
      lifetimeOrderCount,
      lifetimePurchaseValue: lifetime?.purchaseValue ?? customer.purchaseValue,
      lifetimeLastOrderDate: lastOrder ? dateKey(lastOrder) : customer.lastOrderDate,
      isLifetimeRepeat: lifetimeOrderCount >= 2,
      isNewInRange: firstOrderTimestamp >= range.from.getTime() &&
        firstOrderTimestamp <= range.to.getTime(),
    }
  })

  const newCustomers = allCustomers.filter(customer => customer.isNewInRange).length

  return {
    ...data,
    customers: allCustomers.slice(0, 10),
    allCustomers,
    repeatCustomersInRange: allCustomers.filter(customer => customer.orders >= 2).length,
    lifetimeRepeatCustomers: allCustomers.filter(customer => customer.isLifetimeRepeat).length,
    newCustomers,
    returningCustomers: allCustomers.length - newCustomers,
  }
}

export function useOrdersDashboardData(range: DashboardDateRange) {
  const ordersQuery = useModuleDashboardData(range, false)
  const lifetimeOrdersQuery = useOrders()

  const data = ordersQuery.data && lifetimeOrdersQuery.data
    ? addLifetimeCustomerMetrics(ordersQuery.data, lifetimeOrdersQuery.data, range)
    : undefined

  return {
    data,
    error: ordersQuery.error ?? lifetimeOrdersQuery.error,
    isLoading: ordersQuery.isLoading || lifetimeOrdersQuery.isLoading,
    refetch: () => Promise.all([ordersQuery.refetch(), lifetimeOrdersQuery.refetch()]),
  }
}

export function useShippingDashboardData(range: DashboardDateRange) {
  return useQuery({
    queryKey: ['shipping-dashboard-data', range.from.toISOString(), range.to.toISOString()],
    staleTime: 1000 * 60,
    queryFn: async (): Promise<ShippingDashboardData> => {
      const [deliveredSnapshot, pendingSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'orders'),
          where('delivered_at', '>=', Timestamp.fromDate(range.from)),
          where('delivered_at', '<=', Timestamp.fromDate(range.to)),
          orderBy('delivered_at', 'asc'),
        )),
        getDocs(query(
          collection(db, 'orders'),
          where('status', 'in', ['shipped', 'out_for_delivery']),
          orderBy('shipped_at', 'desc'),
        )),
      ])

      const pincodeCounts = new Map<string, number>()
      const deliveryTrends = new Map<string, DeliveryTrend>()
      let deliveredOrders = 0

      for (const document of deliveredSnapshot.docs) {
        const data = document.data()
        if (data.status !== 'delivered') continue
        deliveredOrders++
        const address = record(data.shipping_address)
        const pincode = normalizedPincode(address?.pincode)
        if (pincode) pincodeCounts.set(pincode, (pincodeCounts.get(pincode) ?? 0) + 1)

        const deliveredAt = orderDate(data.delivered_at)
        if (deliveredAt) {
          const key = dateKey(deliveredAt)
          deliveryTrends.set(key, {
            date: key,
            deliveredOrders: (deliveryTrends.get(key)?.deliveredOrders ?? 0) + 1,
          })
        }
      }

      return {
        deliveredOrders,
        pendingShipments: pendingSnapshot.docs.length,
        uniqueDeliveredPincodes: pincodeCounts.size,
        pincodes: Array.from(pincodeCounts, ([pincode, deliveredOrders]) => ({
          pincode,
          deliveredOrders,
        }))
          .sort((a, b) => b.deliveredOrders - a.deliveredOrders || a.pincode.localeCompare(b.pincode))
          .slice(0, 10),
        deliveryTrends: Array.from(deliveryTrends.values())
          .sort((a, b) => a.date.localeCompare(b.date)),
      }
    },
  })
}
