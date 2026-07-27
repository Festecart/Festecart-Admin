export interface DateRange {
  from: Date;
  to: Date;
}

export interface RevenueByDay {
  date: string;     // 'yyyy-MM-dd'
  revenue: number;
  orders: number;
}

export interface RevenueByMonth {
  month: string;    // 'yyyy-MM'
  revenue: number;
  orders: number;
}

export interface SalesByGeo {
  name: string;     // pincode / city / state
  revenue: number;
  orders: number;
}

export interface SalesByCategory {
  category: string;
  revenue: number;
  orders: number;
  units: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  units: number;
  revenue: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface PaymentCount {
  method: string;
  count: number;
  revenue: number;
}

export interface CouponUsageSummary {
  code: string;
  uses: number;
  totalDiscount: number;
}

export interface AnalyticsData {
  // KPIs
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  cancelledOrders: number;
  cancellationRate: number;
  codOrders: number;
  prepaidOrders: number;

  // Time series
  revenueByDay: RevenueByDay[];
  revenueByMonth: RevenueByMonth[];

  // Geographic
  salesByPincode: SalesByGeo[];
  salesByCity: SalesByGeo[];
  salesByState: SalesByGeo[];

  // Catalog
  salesByCategory: SalesByCategory[];
  topProducts: TopProduct[];

  // Breakdowns
  statusBreakdown: StatusCount[];
  paymentBreakdown: PaymentCount[];
  couponUsage: CouponUsageSummary[];
}

export interface KPICardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  trend?: number;
  icon: React.ElementType;
  color: string;
}
