export type AdminDiscountType = 'fixed' | 'percentage'

export interface OrderDiscountSource {
  subtotal: number
  shipping_charge: number
  total: number
  coupon_code?: string | null
  coupon_discount?: number | null
  discount_amount?: number | null
}

export interface OrderDiscountBreakdown {
  subtotal: number
  shippingCharge: number
  couponDiscount: number
  manualDiscount: number
  eligibleSubtotal: number
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function nonNegativeAmount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, roundMoney(value)) : 0
}

export function getOrderDiscountBreakdown(order: OrderDiscountSource): OrderDiscountBreakdown {
  const subtotal = nonNegativeAmount(order.subtotal)
  const shippingCharge = nonNegativeAmount(order.shipping_charge)
  const total = nonNegativeAmount(order.total)
  const totalDiscount = nonNegativeAmount(subtotal + shippingCharge - total)
  const savedManualDiscount = order.discount_amount == null
    ? null
    : nonNegativeAmount(order.discount_amount)
  const inferredCouponDiscount = order.coupon_code
    ? Math.max(0, totalDiscount - (savedManualDiscount ?? 0))
    : 0
  const couponDiscount = roundMoney(Math.min(
    totalDiscount,
    subtotal + shippingCharge,
    order.coupon_discount == null
      ? inferredCouponDiscount
      : nonNegativeAmount(order.coupon_discount),
  ))
  const discountRemainingAfterCoupon = Math.max(0, totalDiscount - couponDiscount)
  const eligibleSubtotal = roundMoney(Math.max(0, subtotal - Math.min(subtotal, couponDiscount)))
  const manualDiscount = roundMoney(Math.min(
    savedManualDiscount ?? discountRemainingAfterCoupon,
    discountRemainingAfterCoupon,
    eligibleSubtotal,
  ))

  return { subtotal, shippingCharge, couponDiscount, manualDiscount, eligibleSubtotal }
}

export function calculateAdminDiscountAmount(
  eligibleSubtotal: number,
  type: AdminDiscountType,
  value: number,
): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Enter a valid discount amount')
  }
  if (type === 'percentage' && value > 100) {
    throw new Error('Percentage discount cannot exceed 100%')
  }
  if (type === 'fixed' && value > eligibleSubtotal) {
    throw new Error('Discount cannot exceed the eligible subtotal')
  }

  return roundMoney(type === 'percentage' ? eligibleSubtotal * value / 100 : value)
}

export function calculateOrderTotal(
  subtotal: number,
  shippingCharge: number,
  couponDiscount: number,
  manualDiscount: number,
): number {
  return roundMoney(Math.max(0, subtotal + shippingCharge - couponDiscount - manualDiscount))
}
