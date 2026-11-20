import type { Order } from '@/types'

export type CustomerPaymentStatus = 'paid' | 'partially_paid' | 'pending'

export interface EligibleDeliveredOrder {
  order: Order
  orderNumber: string
  numericOrderNumber: number
}

export function eligibleDeliveredOrders(orders: Order[]): EligibleDeliveredOrder[] {
  const eligible = new Map<string, EligibleDeliveredOrder>()

  for (const order of orders) {
    if (order.status !== 'delivered') continue
    const orderNumber = order.order_number || order.id
    const match = /^FST(\d+)$/i.exec(orderNumber.trim())
    if (!match) continue

    const numericOrderNumber = Number(match[1])
    if (!Number.isSafeInteger(numericOrderNumber) || numericOrderNumber < 142) continue
    if (!eligible.has(order.id)) {
      eligible.set(order.id, { order, orderNumber, numericOrderNumber })
    }
  }

  return [...eligible.values()].sort((a, b) =>
    (b.numericOrderNumber - a.numericOrderNumber) || a.order.id.localeCompare(b.order.id),
  )
}

export function calculateOrderPaymentAmounts(total: number, amountReceived: number) {
  const totalPaise = Number.isFinite(total) ? Math.max(0, Math.round(total * 100)) : 0
  const receivedAmount = Number.isFinite(amountReceived) ? Math.max(0, amountReceived) : 0
  const receivedPaise = Math.min(totalPaise, Math.round(receivedAmount * 100))
  const paymentStatus: CustomerPaymentStatus = totalPaise > 0 && receivedPaise >= totalPaise
    ? 'paid'
    : receivedPaise > 0 ? 'partially_paid' : 'pending'

  return {
    totalPaise,
    receivedPaise,
    pendingPaise: totalPaise - receivedPaise,
    paymentStatus,
  }
}
