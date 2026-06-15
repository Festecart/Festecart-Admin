export interface OrderItem {
  product_id: string
  name: string
  price: number
  quantity: number
  image: string | null
}

export interface ShippingAddress {
  name: string
  phone: string
  address: string
  city: string
  state: string
  pincode: string
}

export type OrderStatus =
  | 'confirmed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'

export interface Order {
  id: string
  order_number: string
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  guest_phone: string | null
  status: OrderStatus
  payment_method: string
  payment_status: string | null
  subtotal: number
  shipping_charge: number
  total: number
  note: string | null
  coupon_code: string | null
  shipping_address: ShippingAddress | null
  items: OrderItem[]
  tracking_number: string | null
  courier_name: string | null
  confirmed_at: string | null
  shipped_at: string | null
  out_for_delivery_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface DeliveryPincode {
  id: string
  pincode: string
  area_name: string
  shipping_charge: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface DashboardStats {
  todayOrders: number
  pendingOrders: number
  inTransitOrders: number
  todayRevenue: number
  monthRevenue: number
}
