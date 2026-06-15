import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DeliveryPincode } from '@/types'

export function useDeliveryPincodes() {
  return useQuery({
    queryKey: ['delivery_pincodes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_pincodes')
        .select('*')
        .order('pincode', { ascending: true })
      if (error) throw error
      return (data ?? []) as DeliveryPincode[]
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useAddPincode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: Omit<DeliveryPincode, 'id' | 'created_at' | 'updated_at'>) => {
      const { error } = await supabase.from('delivery_pincodes').insert(payload)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_pincodes'] }),
  })
}

export function useUpdatePincode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<DeliveryPincode> & { id: string }) => {
      const { error } = await supabase.from('delivery_pincodes').update(payload).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_pincodes'] }),
  })
}

export function useDeletePincode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('delivery_pincodes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery_pincodes'] }),
  })
}
