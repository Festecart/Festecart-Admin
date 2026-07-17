import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, Timestamp,
} from '@/lib/firebase'

export type ZonePlaceType = 'state' | 'city' | 'pincode'

export interface ZonePlace {
  id: string
  country: string
  placeType: ZonePlaceType
  values: string[]
}

export interface DeliveryZone {
  id: string
  name: string
  places: ZonePlace[]
  shipping_charge: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type AddDeliveryZonePayload = {
  name: string
  places: ZonePlace[]
  shipping_charge: number
  is_active: boolean
}

export type UpdateDeliveryZonePayload = {
  id: string
  name?: string
  places?: ZonePlace[]
  shipping_charge: number
  is_active: boolean
}

// ── Query ─────────────────────────────────────────────────────────

export function useDeliveryZones() {
  return useQuery({
    queryKey: ['delivery_zones'],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'delivery_zones'), orderBy('created_at', 'desc'))
      )
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryZone))
    },
    staleTime: 1000 * 60 * 5,
  })
}

// ── Add ───────────────────────────────────────────────────────────

export function useAddDeliveryZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: AddDeliveryZonePayload) => {
      const now = Timestamp.now()
      await addDoc(collection(db, 'delivery_zones'), { ...payload, created_at: now, updated_at: now })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_zones'] }),
  })
}

// ── Update ────────────────────────────────────────────────────────

export function useUpdateDeliveryZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: UpdateDeliveryZonePayload) => {
      await updateDoc(doc(db, 'delivery_zones', id), { ...payload, updated_at: Timestamp.now() })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_zones'] }),
  })
}

// ── Delete ────────────────────────────────────────────────────────

export function useDeleteDeliveryZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => { await deleteDoc(doc(db, 'delivery_zones', id)) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_zones'] }),
  })
}
