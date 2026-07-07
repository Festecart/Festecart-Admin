import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, limit, Timestamp,
  type QueryConstraint,
} from '@/lib/firebase'
import type { Order, OrderStatus } from '@/types'

// ── helpers ────────────────────────────────────────────────────────────────────
function toOrder(id: string, data: Record<string, unknown>): Order {
  const ts = (f: unknown) => {
    if (!f) return null
    if (f instanceof Timestamp) return f.toDate().toISOString()
    if (typeof f === 'string') return f
    return null
  }
  return {
    id,
    order_number:         String(data.order_number ?? ''),
    user_id:              (data.user_id as string | null) ?? null,
    customer_email:       (data.customer_email as string | null) ?? null,
    guest_name:           (data.guest_name as string | null) ?? null,
    guest_email:          (data.guest_email as string | null) ?? null,
    guest_phone:          (data.guest_phone as string | null) ?? null,
    status:               (data.status as OrderStatus) ?? 'confirmed',
    payment_method:       String(data.payment_method ?? 'cod'),
    payment_status:       (data.payment_status as string | null) ?? null,
    acceptance_status:    (data.acceptance_status as string | null) ?? null,
    fulfillment_status:   (data.fulfillment_status as string | null) ?? null,
    paid_at:              ts(data.paid_at),
    subtotal:             Number(data.subtotal ?? 0),
    shipping_charge:      Number(data.shipping_charge ?? 0),
    total:                Number(data.total ?? 0),
    note:                 (data.note as string | null) ?? null,
    coupon_code:          (data.coupon_code as string | null) ?? null,
    shipping_address:     (data.shipping_address as Order['shipping_address']) ?? null,
    items:                (data.items as Order['items']) ?? [],
    tracking_number:      (data.tracking_number as string | null) ?? null,
    courier_name:         (data.courier_name as string | null) ?? null,
    confirmed_at:         ts(data.confirmed_at),
    shipped_at:           ts(data.shipped_at),
    out_for_delivery_at:  ts(data.out_for_delivery_at),
    delivered_at:         ts(data.delivered_at),
    cancelled_at:         ts(data.cancelled_at),
    created_at:           ts(data.created_at) ?? new Date().toISOString(),
    updated_at:           ts(data.updated_at) ?? new Date().toISOString(),
  } as Order
}

// ── Fetch all orders ─────────────────────────────────────────────────────────
export function useOrders(filters?: {
  status?: OrderStatus | 'all'
  search?: string
  dateFrom?: string
  dateTo?: string
}) {
  const serverKey = {
    status:   filters?.status   ?? 'all',
    dateFrom: filters?.dateFrom ?? '',
    dateTo:   filters?.dateTo   ?? '',
  }

  const queryResult = useQuery({
    queryKey: ['orders', serverKey],
    queryFn: async () => {
      // Build constraints — use QueryConstraint[] to satisfy TypeScript
      const constraints: QueryConstraint[] = []

      if (serverKey.status !== 'all') {
        constraints.push(where('status', '==', serverKey.status))
      }
      if (serverKey.dateFrom) {
        constraints.push(where('created_at', '>=', Timestamp.fromDate(new Date(serverKey.dateFrom))))
      }
      if (serverKey.dateTo) {
        const to = new Date(serverKey.dateTo)
        to.setHours(23, 59, 59, 999)
        constraints.push(where('created_at', '<=', Timestamp.fromDate(to)))
      }
      constraints.push(orderBy('created_at', 'desc'))

      const snap = await getDocs(query(collection(db, 'orders'), ...constraints))
      return snap.docs.map(d => toOrder(d.id, d.data() as Record<string, unknown>))
    },
    staleTime: 1000 * 30,
  })

  const search = filters?.search?.toLowerCase().trim() ?? ''
  const filtered = search
    ? (queryResult.data ?? []).filter(o => {
        const name  = (o.guest_name  ?? o.shipping_address?.name  ?? '').toLowerCase()
        const phone = (o.guest_phone ?? o.shipping_address?.phone ?? '').toLowerCase()
        const num   = (o.order_number ?? '').toLowerCase()
        const email = (o.guest_email  ?? '').toLowerCase()
        return name.includes(search) || phone.includes(search) || num.includes(search) || email.includes(search)
      })
    : (queryResult.data ?? [])

  return { ...queryResult, data: filtered }
}

// ── Single order ─────────────────────────────────────────────────────────────
export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'orders', id))
      if (!snap.exists()) throw new Error('Order not found')
      return toOrder(snap.id, snap.data() as Record<string, unknown>)
    },
    enabled: !!id,
  })
}

// ── Active shipments ─────────────────────────────────────────────────────────
export function useActiveShipments() {
  return useQuery({
    queryKey: ['orders', 'shipments'],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'orders'),
          where('status', 'in', ['shipped', 'out_for_delivery']),
          orderBy('shipped_at', 'desc'),
        )
      )
      return snap.docs.map(d => toOrder(d.id, d.data() as Record<string, unknown>))
    },
    staleTime: 1000 * 30,
  })
}

// ── Dashboard stats ──────────────────────────────────────────────────────────
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)

      const [todaySnap, pendingSnap, transitSnap, monthSnap] = await Promise.all([
        getDocs(query(collection(db, 'orders'),
          where('created_at', '>=', Timestamp.fromDate(todayStart)))),
        getDocs(query(collection(db, 'orders'), where('status', '==', 'confirmed'))),
        getDocs(query(collection(db, 'orders'),
          where('status', 'in', ['shipped', 'out_for_delivery']))),
        getDocs(query(collection(db, 'orders'),
          where('created_at', '>=', Timestamp.fromDate(monthStart)),
          where('status', '!=', 'cancelled'))),
      ])

      const todayOrders  = todaySnap.docs.length
      const todayRevenue = todaySnap.docs.reduce((s, d) => s + Number((d.data()).total ?? 0), 0)
      const monthRevenue = monthSnap.docs.reduce((s, d) => s + Number((d.data()).total ?? 0), 0)

      return {
        todayOrders,
        pendingOrders:   pendingSnap.docs.length,
        inTransitOrders: transitSnap.docs.length,
        todayRevenue,
        monthRevenue,
      }
    },
    staleTime: 1000 * 60,
  })
}

// ── Recent orders for dashboard ──────────────────────────────────────────────
export function useRecentOrders() {
  return useQuery({
    queryKey: ['orders', 'recent'],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'orders'), orderBy('created_at', 'desc'), limit(20))
      )
      return snap.docs.map(d => toOrder(d.id, d.data() as Record<string, unknown>))
    },
    staleTime: 1000 * 30,
  })
}

// ── Mark COD order as paid ────────────────────────────────────────────────────
export function useMarkPaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      await updateDoc(doc(db, 'orders', orderId), {
        payment_status: 'paid',
        paid_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      })
    },
    onSuccess: (_data, orderId) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders', orderId] })
    },
  })
}

export function isOrderPaid(order: { payment_method: string; payment_status?: string | null }): boolean {
  if (order.payment_method !== 'cod') return true
  return order.payment_status === 'paid'
}

interface UpdateStatusPayload {
  orderId: string
  status: OrderStatus
  tracking_number?: string
  courier_name?: string
}

export function useUpdateOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, status, tracking_number, courier_name }: UpdateStatusPayload) => {
      const timestampField: Partial<Record<OrderStatus, string>> = {
        shipped:          'shipped_at',
        out_for_delivery: 'out_for_delivery_at',
        delivered:        'delivered_at',
        cancelled:        'cancelled_at',
      }
      const updates: Record<string, unknown> = {
        status,
        updated_at: Timestamp.now(),
      }
      const tsField = timestampField[status]
      if (tsField) updates[tsField] = Timestamp.now()
      if (tracking_number !== undefined) updates.tracking_number = tracking_number
      if (courier_name    !== undefined) updates.courier_name    = courier_name

      await updateDoc(doc(db, 'orders', orderId), updates)
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders', variables.orderId] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
}

// ── Create order (used by AddOrder) ─────────────────────────────────────────
export async function createOrder(payload: Record<string, unknown>): Promise<string> {
  // Auto-generate order number
  const snap = await getDocs(query(collection(db, 'orders'), orderBy('created_at', 'desc'), limit(1)))
  let nextNum = 1
  if (!snap.empty) {
    const last = snap.docs[0].data().order_number as string | undefined
    if (last) {
      const n = parseInt(last.replace(/\D/g, ''), 10)
      if (!isNaN(n)) nextNum = n + 1
    }
  }
  const order_number = `#OD${String(nextNum).padStart(6, '0')}`

  const now = Timestamp.now()
  const ref = await addDoc(collection(db, 'orders'), {
    ...payload,
    order_number,
    confirmed_at: now,
    created_at: now,
    updated_at: now,
  })
  return ref.id
}
