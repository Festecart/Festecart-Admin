/**
 * emailService.ts (Admin)
 *
 * Routes all email sending through the Firebase Cloud Function `sendOrderEmail`.
 * No API key is needed or exposed in the browser — the key lives server-side.
 */

const CLOUD_FN = 'https://sendorderemail-3mqmxql44q-uc.a.run.app';

async function callEmailFunction(
  order: unknown,
  newStatus: string,
  invoice?: unknown
): Promise<void> {
  const res = await fetch(CLOUD_FN, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ order, new_status: newStatus, invoice: invoice ?? null }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(`Email function error (${res.status}): ${json.error ?? json.reason ?? JSON.stringify(json)}`);
  }
}

// ── Types ──────────────────────────────────────────────────────
export interface OrderForEmail {
  id: string;
  order_number: string;
  customer_email: string | null;
  guest_email: string | null;
  guest_name: string | null;
  shipping_address: {
    name?: string; phone?: string; address?: string;
    city?: string; state?: string; pincode?: string;
  } | null;
  items: { name: string; price: number; quantity: number; image?: string | null }[];
  subtotal: number;
  shipping_charge: number;
  total: number;
  payment_method: string;
  tracking_number?: string | null;
  courier_name?: string | null;
}

export interface OrderConfirmationData {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  items: { name: string; price: number; quantity: number; image?: string | null }[];
  subtotal: number;
  shippingCharge: number;
  total: number;
  paymentMethod: string;
  shippingAddress: {
    name?: string; phone?: string; address?: string;
    city?: string; state?: string; pincode?: string;
  } | null;
}

// ── Send order status update email ─────────────────────────────
export async function sendOrderStatusEmail(
  order: OrderForEmail,
  newStatus: string,
  opts?: { courierName?: string | null; trackingNumber?: string | null }
): Promise<void> {
  const toEmail = order.customer_email || order.guest_email;
  if (!toEmail) {
    console.warn('[emailService] No customer email for order', order.order_number);
    return;
  }

  // Pass invoice info so the Cloud Function can include tracking details
  const invoice = (opts?.courierName || opts?.trackingNumber) ? {
    courier:         opts.courierName    ?? null,
    tracking_number: opts.trackingNumber ?? null,
  } : null;

  await callEmailFunction(order, newStatus, invoice);
}

// ── Send order confirmation email on placement ─────────────────
export async function sendOrderConfirmationEmail(data: OrderConfirmationData): Promise<void> {
  // Map to the shape the Cloud Function expects
  const order = {
    order_number:    data.orderNumber,
    customer_email:  data.customerEmail,
    guest_email:     null,
    guest_name:      data.customerName,
    shipping_address: data.shippingAddress,
    items:           data.items,
    subtotal:        data.subtotal,
    shipping_charge: data.shippingCharge,
    total:           data.total,
    payment_method:  data.paymentMethod,
  };

  await callEmailFunction(order, 'confirmed', null);
}
