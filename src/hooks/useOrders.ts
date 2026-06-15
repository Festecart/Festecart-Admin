import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Order, OrderStatus } from '@/types'

// ── Fetch all orders (with optional filters) ──────────────────────────────────
export function useOrders(filters?: {
  status?: OrderStatus | 'all'
  search?: string
  dateFrom?: string
  dateTo?: string
}) {
  // Only server-side filters go in the queryKey — search is client-side only
  // so typing doesn't trigger extra network requests
  const serverKey = {
    status: filters?.status ?? 'all',
    dateFrom: filters?.dateFrom ?? '',
    dateTo: filters?.dateTo ?? '',
  }

  const query = useQuery({
    queryKey: ['orders', serverKey],
    queryFn: async () => {
      let q = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })

      if (serverKey.status !== 'all') {
        q = q.eq('status', serverKey.status)
      }
      if (serverKey.dateFrom) {
        q = q.gte('created_at', serverKey.dateFrom)
      }
      if (serverKey.dateTo) {
        q = q.lte('created_at', serverKey.dateTo + 'T23:59:59')
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Order[]
    },
    staleTime: 1000 * 30,
  })

  // Apply search client-side against cached data (no extra network call)
  const search = filters?.search?.toLowerCase().trim() ?? ''
  const filtered = search
    ? (query.data ?? []).filter(o => {
        const name = (o.guest_name ?? o.shipping_address?.name ?? '').toLowerCase()
        const phone = (o.guest_phone ?? o.shipping_address?.phone ?? '').toLowerCase()
        const num = (o.order_number ?? '').toLowerCase()
        const email = (o.guest_email ?? '').toLowerCase()
        return name.includes(search) || phone.includes(search) || num.includes(search) || email.includes(search)
      })
    : (query.data ?? [])

  return { ...query, data: filtered }
}

// ── Single order ──────────────────────────────────────────────────────────────
export function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Order
    },
    enabled: !!id,
  })
}

// ── Active shipments (shipped + out_for_delivery) ─────────────────────────────
export function useActiveShipments() {
  return useQuery({
    queryKey: ['orders', 'shipments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .in('status', ['shipped', 'out_for_delivery'])
        .order('shipped_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Order[]
    },
    staleTime: 1000 * 30,
  })
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1)

      const [todayRes, pendingRes, transitRes, monthRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, total')
          .gte('created_at', todayStart.toISOString()),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'confirmed'),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('status', ['shipped', 'out_for_delivery']),
        supabase
          .from('orders')
          .select('total')
          .gte('created_at', monthStart.toISOString())
          .neq('status', 'cancelled'),
      ])

      const todayOrders = todayRes.data?.length ?? 0
      const todayRevenue = (todayRes.data ?? []).reduce((s, o) => s + (o.total ?? 0), 0)
      const monthRevenue = (monthRes.data ?? []).reduce((s, o) => s + (o.total ?? 0), 0)

      return {
        todayOrders,
        pendingOrders: pendingRes.count ?? 0,
        inTransitOrders: transitRes.count ?? 0,
        todayRevenue,
        monthRevenue,
      }
    },
    staleTime: 1000 * 60,
  })
}

// ── Recent orders for dashboard ───────────────────────────────────────────────
export function useRecentOrders() {
  return useQuery({
    queryKey: ['orders', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as Order[]
    },
    staleTime: 1000 * 30,
  })
}

// ── Mark COD order as paid ────────────────────────────────────────────────────
export function useMarkPaid() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      // Use rpc to bypass schema cache issues with new columns
      const { error } = await supabase.rpc('mark_order_paid', { order_id: orderId })
      if (error) {
        // Fallback: direct update (works once schema cache refreshes)
        const { error: updateError } = await supabase
          .from('orders')
          .update({ payment_status: 'paid' } as never)
          .eq('id', orderId)
        if (updateError) throw new Error(updateError.message)
      }
    },
    onSuccess: (_data, orderId) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders', orderId] })
    },
  })
}

/** Derive whether an order is paid:
 *  - upi / card / any non-cod = always paid at checkout
 *  - cod = only paid if payment_status column = 'paid'
 */
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
        shipped: 'shipped_at',
        out_for_delivery: 'out_for_delivery_at',
        delivered: 'delivered_at',
        cancelled: 'cancelled_at',
      }

      const updates: Record<string, unknown> = { status }
      const tsField = timestampField[status]
      if (tsField) updates[tsField] = new Date().toISOString()
      if (tracking_number !== undefined) updates.tracking_number = tracking_number
      if (courier_name !== undefined) updates.courier_name = courier_name

      const { error } = await supabase.from('orders').update(updates).eq('id', orderId)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['orders', variables.orderId] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] })
    },
  })
}
