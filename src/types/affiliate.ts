import type { Timestamp } from 'firebase/firestore'
import type { OrderItem } from '@/types'

export type AffiliateCommissionType = 'flat' | 'percentage'

export interface AffiliateProfile {
  uid: string
  name: string
  email: string
  phone: string
  coupon_id: string
  coupon_code: string
  commission_type: AffiliateCommissionType
  commission_value: number
  is_active: boolean
  created_at: Timestamp
}

export interface AffiliateOrder {
  affiliate_id: string
  coupon_id: string
  coupon_code: string
  commission_type: AffiliateCommissionType
  commission_value: number
  order_id: string
  order_number: string
  status: string
  created_at: string
  customer_name: string
  customer_email: string
  customer_phone: string
  customer_id: string
  products: OrderItem[]
  product_quantity: number
  product_subtotal: number
  commission_earned: number
  updated_at: string
}
