import { useQuery } from '@tanstack/react-query'
import { db, collection, doc, getDoc, getDocs, query, where, Timestamp } from '@/lib/firebase'
import type { AffiliateOrder, AffiliateProfile } from '@/types/affiliate'

function toDateString(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string') return value
  return ''
}

export function useAffiliateProfile(affiliateId: string | undefined) {
  return useQuery({
    queryKey: ['affiliate-profile', affiliateId],
    enabled: !!affiliateId,
    queryFn: async (): Promise<AffiliateProfile> => {
      const snapshot = await getDoc(doc(db, 'affiliate_profiles', affiliateId!))
      if (!snapshot.exists()) throw new Error('Affiliate profile not found')
      return { uid: snapshot.id, ...snapshot.data() } as AffiliateProfile
    },
    staleTime: 1000 * 60,
  })
}

export function useAffiliateOrders(affiliateId: string | undefined) {
  return useQuery({
    queryKey: ['affiliate-orders', affiliateId],
    enabled: !!affiliateId,
    queryFn: async (): Promise<AffiliateOrder[]> => {
      const snapshot = await getDocs(
        query(collection(db, 'affiliate_order_analytics'), where('affiliate_id', '==', affiliateId))
      )
      return snapshot.docs.map(document => {
        const data = document.data()
        return {
          ...data,
          order_id: String(data.order_id ?? document.id),
          order_number: String(data.order_number ?? document.id),
          created_at: toDateString(data.created_at),
          updated_at: toDateString(data.updated_at),
          products: Array.isArray(data.products) ? data.products : [],
          product_quantity: Number(data.product_quantity) || 0,
          product_subtotal: Number(data.product_subtotal) || 0,
          commission_earned: Number(data.commission_earned) || 0,
        } as AffiliateOrder
      })
    },
    staleTime: 1000 * 30,
  })
}
