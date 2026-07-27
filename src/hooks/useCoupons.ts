import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp,
} from '@/lib/firebase'
import type { Coupon, CouponListRow } from '@/types/coupon'

const COLL = 'coupons'

// ── Helpers ───────────────────────────────────────────────────────

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts) return ''
  const d = ts.toDate()
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function docToCoupon(id: string, data: Record<string, any>): Coupon {
  return {
    id,
    code:               data.code ?? '',
    type:               data.type ?? 'flat',
    value:              data.value ?? 0,
    min_cart_amount:    data.min_cart_amount ?? 0,
    max_discount:       data.max_discount ?? null,
    total_usage_limit:  data.total_usage_limit ?? null,
    per_user_limit:     data.per_user_limit ?? null,
    applicable_for:     data.applicable_for ?? 'all_orders',
    terms_conditions:   data.terms_conditions ?? null,
    valid_from:         data.valid_from as Timestamp,
    valid_to:           data.valid_to as Timestamp,
    is_active:          data.is_active ?? true,
    total_uses:         data.total_uses ?? 0,
    created_at:         data.created_at as Timestamp,
    updated_at:         data.updated_at as Timestamp,
  }
}

function couponToListRow(c: Coupon): CouponListRow {
  return {
    id:                 c.id,
    code:               c.code,
    type:               c.type,
    value:              c.value,
    valid_from:         formatTs(c.valid_from),
    valid_to:           formatTs(c.valid_to),
    total_uses:         c.total_uses,
    total_usage_limit:  c.total_usage_limit,
    is_active:          c.is_active,
    min_cart_amount:    c.min_cart_amount,
  }
}

// ── Queries ───────────────────────────────────────────────────────

/** List all coupons ordered by creation date (newest first) */
export function useCoupons() {
  return useQuery({
    queryKey: ['coupons'],
    queryFn: async (): Promise<CouponListRow[]> => {
      const snap = await getDocs(
        query(collection(db, COLL), orderBy('created_at', 'desc'))
      )
      return snap.docs.map(d => couponToListRow(docToCoupon(d.id, d.data())))
    },
    staleTime: 1000 * 60 * 2,
  })
}

/** Fetch a single coupon by ID */
export function useCoupon(id: string | undefined) {
  return useQuery({
    queryKey: ['coupon', id],
    enabled: !!id,
    queryFn: async (): Promise<Coupon> => {
      const snap = await getDoc(doc(db, COLL, id!))
      if (!snap.exists()) throw new Error('Coupon not found')
      return docToCoupon(snap.id, snap.data())
    },
  })
}

// ── Create ────────────────────────────────────────────────────────

export interface CreateCouponPayload {
  code: string
  type: Coupon['type']
  value: number
  min_cart_amount: number
  max_discount: number | null
  total_usage_limit: number | null
  per_user_limit: number | null
  applicable_for: 'all_orders'
  terms_conditions: string | null
  valid_from: Date
  valid_to: Date
  is_active: boolean
}

export function useCreateCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateCouponPayload): Promise<string> => {
      const normalizedCode = payload.code.trim().toUpperCase()

      // Uniqueness check
      const existing = await getDocs(
        query(collection(db, COLL), where('code', '==', normalizedCode))
      )
      if (!existing.empty) {
        throw new Error('Coupon code already exists')
      }

      const docRef = await addDoc(collection(db, COLL), {
        ...payload,
        code:       normalizedCode,
        valid_from: Timestamp.fromDate(payload.valid_from),
        valid_to:   Timestamp.fromDate(payload.valid_to),
        total_uses: 0,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      })
      return docRef.id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons'] }),
  })
}

// ── Update ────────────────────────────────────────────────────────

export interface UpdateCouponPayload extends Partial<CreateCouponPayload> {
  id: string
}

export function useUpdateCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateCouponPayload) => {
      const updates: Record<string, any> = { ...payload, updated_at: serverTimestamp() }

      if (payload.code) {
        updates.code = payload.code.trim().toUpperCase()
      }
      if (payload.valid_from instanceof Date) {
        updates.valid_from = Timestamp.fromDate(payload.valid_from)
      }
      if (payload.valid_to instanceof Date) {
        updates.valid_to = Timestamp.fromDate(payload.valid_to)
      }
      // Never reset total_uses
      delete updates.total_uses

      await updateDoc(doc(db, COLL, id), updates)
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['coupons'] })
      qc.invalidateQueries({ queryKey: ['coupon', id] })
    },
  })
}

// ── Toggle active ─────────────────────────────────────────────────

export function useToggleCouponActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await updateDoc(doc(db, COLL, id), {
        is_active,
        updated_at: serverTimestamp(),
      })
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['coupons'] })
      qc.invalidateQueries({ queryKey: ['coupon', id] })
    },
  })
}

// ── Delete ────────────────────────────────────────────────────────

export function useDeleteCoupon() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, COLL, id))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coupons'] }),
  })
}
