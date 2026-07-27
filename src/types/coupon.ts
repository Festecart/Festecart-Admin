import { Timestamp } from 'firebase/firestore';

export type CouponType = 'flat' | 'percentage' | 'shipping_discount' | 'free_shipping';

export interface Coupon {
  id: string;
  code: string;               // stored uppercase
  type: CouponType;
  value: number;              // ₹ amount for flat/shipping_discount; % for percentage; 0 for free_shipping
  min_cart_amount: number;    // 0 = no minimum
  max_discount: number | null; // cap for percentage type; null = no cap
  total_usage_limit: number | null; // null = unlimited
  per_user_limit: number | null;    // null = unlimited
  applicable_for: 'all_orders';
  terms_conditions: string | null;
  valid_from: Timestamp;
  valid_to: Timestamp;
  is_active: boolean;
  total_uses: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Flattened view used in the Coupons list table */
export interface CouponListRow {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  valid_from: string;         // formatted date string
  valid_to: string;           // formatted date string
  total_uses: number;
  total_usage_limit: number | null;
  is_active: boolean;
  min_cart_amount: number;
}

export interface CouponUserUsage {
  user_id: string;
  order_ids: string[];
  use_count: number;
  last_used_at: Timestamp;
}

/** What the coupon applies to */
export type ApplicableFor =
  | 'all_orders'
  | { type: 'categories'; ids: string[] }
  | { type: 'products';   ids: string[] };
