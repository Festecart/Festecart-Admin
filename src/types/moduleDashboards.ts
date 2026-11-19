export interface DashboardDateRange {
  from: Date
  to: Date
}

export interface DashboardOrderTrend {
  date: string
  orders: number
  revenue: number
}

export interface DashboardMonthlyOrderTrend {
  month: string
  orders: number
  revenue: number
}

export interface DashboardCustomer {
  id: string
  name: string
  email: string
  phone: string
  orders: number
  purchaseValue: number
  lastOrderDate: string
}

export interface OrdersDashboardCustomer extends DashboardCustomer {
  lifetimeOrderCount: number
  lifetimePurchaseValue: number
  lifetimeLastOrderDate: string
  isLifetimeRepeat: boolean
  isNewInRange: boolean
}

export interface OrdersDashboardData extends Omit<ModuleDashboardData, 'customers' | 'allCustomers'> {
  customers: OrdersDashboardCustomer[]
  allCustomers: OrdersDashboardCustomer[]
  repeatCustomersInRange: number
  lifetimeRepeatCustomers: number
  newCustomers: number
  returningCustomers: number
}

export interface DashboardProduct {
  id: string
  name: string
  quantity: number
  revenue: number
}

export interface DashboardCategory {
  id: string
  name: string
  orders: number
  quantity: number
  revenue: number
}

export interface ModuleDashboardData {
  totalOrders: number
  totalRevenue: number
  totalCustomers: number
  totalProductUnits: number
  totalProductRevenue: number
  uniqueProducts: number
  customers: DashboardCustomer[]
  allCustomers: DashboardCustomer[]
  orderTrends: DashboardOrderTrend[]
  monthlyOrderTrends: DashboardMonthlyOrderTrend[]
  products: DashboardProduct[]
  categories: DashboardCategory[]
}

export interface DeliveredPincode {
  pincode: string
  deliveredOrders: number
}

export interface DeliveryTrend {
  date: string
  deliveredOrders: number
}

export interface ShippingDashboardData {
  deliveredOrders: number
  pendingShipments: number
  uniqueDeliveredPincodes: number
  pincodes: DeliveredPincode[]
  deliveryTrends: DeliveryTrend[]
}
