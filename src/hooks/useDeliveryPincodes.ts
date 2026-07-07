import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, Timestamp,
} from '@/lib/firebase'
import type { DeliveryPincode } from '@/types'

export function useDeliveryPincodes() {
  return useQuery({
    queryKey: ['delivery_pincodes'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'delivery_pincodes'), orderBy('pincode', 'asc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as DeliveryPincode))
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useAddPincode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<DeliveryPincode, 'id' | 'created_at' | 'updated_at'>) => {
      const now = Timestamp.now()
      await addDoc(collection(db, 'delivery_pincodes'), {
        ...payload,
        created_at: now,
        updated_at: now,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_pincodes'] }),
  })
}

export function useUpdatePincode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<DeliveryPincode> & { id: string }) => {
      await updateDoc(doc(db, 'delivery_pincodes', id), {
        ...payload,
        updated_at: Timestamp.now(),
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_pincodes'] }),
  })
}

export function useDeletePincode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'delivery_pincodes', id))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_pincodes'] }),
  })
}
