/**
 * emailService.ts (Admin) — Resend email sender
 *
 * Sends transactional emails via Resend REST API directly from the admin app.
 * Triggered on every order status change from OrderDetail.tsx.
 *
 * Statuses covered:
 *   confirmed → processing → fulfilled/partially_fulfilled →
 *   shipped → out_for_delivery → delivered → cancelled
 */

const RESEND_API_KEY = import.meta.env.VITE_RESEND_API_KEY as string | undefined;
const FROM_EMAIL     = 'Festecart <noreply@festecart.org>';
const ADMIN_EMAIL    = 'festecartdesi@gmail.com';
const BRAND_COLOR    = '#8B0000';

// ── Helper: send via Resend REST API ────────────────────────────
async function sendEmail(to: string | string[], subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn('[emailService] VITE_RESEND_API_KEY not set — skipping email');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
      }),
    });
    const json = await res.json();
    if (!res.ok) { console.error('[emailService] Resend error:', json); return false; }
    return true;
  } catch (err) {
    console.error('[emailService] fetch error:', err);
    return false;
  }
}

// ── Base template ────────────────────────────────────────────────
function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f2ea;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f2ea;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:${BRAND_COLOR};padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:1px;">🎉 Festecart</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Celebrating Culture · Empowering Artisans</p>
          </td>
        </tr>
        <tr><td style="padding:32px;">${body}</td></tr>
        <tr>
          <td style="background:#f9f7f2;padding:20px 32px;text-align:center;border-top:1px solid #ede9e0;">
            <p style="margin:0;color:#888;font-size:12px;">© 2026 Festecart · <a href="https://festecart.com" style="color:${BRAND_COLOR};text-decoration:none;">festecart.com</a></p>
            <p style="margin:6px 0 0;color:#aaa;font-size:11px;">This is an automated email. Please do not reply.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function statusBadge(status: string): string {
  const map: Record<string, { bg: string; label: string }> = {
    confirmed:             { bg: '#2563eb', label: '✅ Order Confirmed' },
    processing:            { bg: '#0891b2', label: '⚙️ Processing' },
    partially_fulfilled:   { bg: '#d97706', label: '📦 Partially Fulfilled' },
    fulfilled:             { bg: '#7c3aed', label: '📦 Fulfilled' },
    shipped:               { bg: '#7c3aed', label: '🚚 Shipped' },
    out_for_delivery:      { bg: '#d97706', label: '🛵 Out for Delivery' },
    partially_delivered:   { bg: '#d97706', label: '📬 Partially Delivered' },
    delivered:             { bg: '#16a34a', label: '🎉 Delivered' },
    cancelled:             { bg: '#dc2626', label: '❌ Cancelled' },
    pending:               { bg: '#6b7280', label: '⏳ Pending' },
  };
  const s = map[status] ?? { bg: '#6b7280', label: status };
  return `<span style="display:inline-block;background:${s.bg};color:#fff;padding:6px 16px;border-radius:20px;font-size:14px;font-weight:600;">${s.label}</span>`;
}

// ── Status message map ───────────────────────────────────────────
const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: 'Your order has been confirmed!',
    body:  'We\'ve confirmed your order and it\'s being prepared.',
  },
  processing: {
    title: 'Your order is being processed!',
    body:  'Our team is preparing your items for shipment.',
  },
  partially_fulfilled: {
    title: 'Part of your order is ready!',
    body:  'Some of your items have been fulfilled and will be shipped soon.',
  },
  fulfilled: {
    title: 'Your order is fulfilled!',
    body:  'All your items have been packed and are ready for shipment.',
  },
  shipped: {
    title: 'Your order has been shipped!',
    body:  '', // filled dynamically with courier + tracking
  },
  out_for_delivery: {
    title: 'Out for delivery today!',
    body:  'Your order is out for delivery. Please be available to receive it.',
  },
  partially_delivered: {
    title: 'Part of your order has been delivered!',
    body:  'Some items have been delivered. The remaining items are on their way.',
  },
  delivered: {
    title: 'Order delivered successfully!',
    body:  'Your order has been delivered. Thank you for shopping with Festecart! 🎉',
  },
  cancelled: {
    title: 'Your order has been cancelled.',
    body:  'Your order has been cancelled. If you paid online, a refund will be processed within 5–7 business days.',
  },
};

// ── Types (mirrors Order shape from admin) ───────────────────────
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

// ── Main export: send status email to customer ───────────────────
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

  const customerName =
    order.guest_name?.trim() ||
    order.shipping_address?.name?.trim() ||
    'Customer';

  const msg = STATUS_MESSAGES[newStatus] ?? {
    title: `Order status: ${newStatus}`,
    body: 'Your order status has been updated.',
  };

  // Dynamic body for shipped status
  let msgBody = msg.body;
  if (newStatus === 'shipped') {
    const courier  = opts?.courierName  || order.courier_name;
    const tracking = opts?.trackingNumber || order.tracking_number;
    msgBody = `Your order is on its way!${courier ? ` Shipped via <strong>${courier}</strong>.` : ''}${tracking ? ` Tracking: <strong>${tracking}</strong>` : ''}`;
  }

  const orderLink = `https://festecart.com/user/orders/${order.id}`;

  const body = `
    <div style="text-align:center;margin-bottom:24px;">
      ${statusBadge(newStatus)}
    </div>
    <h2 style="color:${BRAND_COLOR};margin:0 0 12px;text-align:center;">${msg.title}</h2>
    <p style="color:#555;text-align:center;margin:0 0 24px;">${msgBody}</p>

    <div style="background:#fdf8f0;border-radius:8px;padding:16px 20px;margin-bottom:20px;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#888;">Order Number</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:${BRAND_COLOR};">${order.order_number}</p>
    </div>

    <p style="color:#555;font-size:14px;text-align:center;margin:0 0 20px;">
      Hi <strong>${customerName}</strong>, thank you for shopping with Festecart!
    </p>

    <div style="text-align:center;">
      <a href="${orderLink}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;">
        View Order Details
      </a>
    </div>`;

  await sendEmail(
    toEmail,
    `Order ${order.order_number} — ${msg.title}`,
    baseTemplate('Order Update', body)
  );
}

/**
 * Send order confirmation email on placement (called from CheckoutPage).
 * Sends to customer + admin.
 */
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

function orderItemsTable(items: { name: string; price: number; quantity: number; image?: string | null }[]): string {
  const rows = items.map(i => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0ebe0;">
        ${i.image ? `<img src="${i.image}" width="48" height="48" style="border-radius:6px;object-fit:cover;vertical-align:middle;margin-right:10px;" />` : ''}
        <span style="vertical-align:middle;font-weight:500;">${i.name}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ebe0;text-align:center;color:#666;">×${i.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ebe0;text-align:right;font-weight:600;">₹${(i.price * i.quantity).toLocaleString('en-IN')}</td>
    </tr>`).join('');
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;font-size:12px;color:#888;text-transform:uppercase;border-bottom:2px solid #f0ebe0;">Product</th>
          <th style="text-align:center;padding:8px 0;font-size:12px;color:#888;text-transform:uppercase;border-bottom:2px solid #f0ebe0;">Qty</th>
          <th style="text-align:right;padding:8px 0;font-size:12px;color:#888;text-transform:uppercase;border-bottom:2px solid #f0ebe0;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export async function sendOrderConfirmationEmail(data: OrderConfirmationData): Promise<void> {
  const addr = data.shippingAddress;
  const addrLine = addr
    ? [addr.address, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')
    : 'Not provided';

  const customerBody = `
    <h2 style="color:${BRAND_COLOR};margin:0 0 6px;">Thank you for your order! 🙏</h2>
    <p style="color:#555;margin:0 0 20px;">Your order has been placed successfully.</p>
    <div style="background:#fdf8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:13px;color:#888;">Order Number</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:${BRAND_COLOR};">${data.orderNumber}</p>
    </div>
    <h3 style="color:#333;margin:0 0 12px;font-size:15px;">Order Summary</h3>
    ${orderItemsTable(data.items)}
    <table width="100%" style="margin-top:16px;">
      <tr><td style="color:#666;padding:4px 0;">Subtotal</td><td style="text-align:right;">₹${data.subtotal.toLocaleString('en-IN')}</td></tr>
      <tr><td style="color:#666;padding:4px 0;">Shipping</td><td style="text-align:right;">${data.shippingCharge === 0 ? '<span style="color:green;">FREE</span>' : '₹' + data.shippingCharge.toLocaleString('en-IN')}</td></tr>
      <tr style="border-top:2px solid #f0ebe0;">
        <td style="font-weight:700;font-size:16px;padding:10px 0 4px;">Total Payable</td>
        <td style="text-align:right;font-weight:700;font-size:16px;color:${BRAND_COLOR};">₹${data.total.toLocaleString('en-IN')}</td>
      </tr>
    </table>
    <div style="margin-top:24px;background:#f9f7f2;border-radius:8px;padding:16px 20px;">
      <p style="margin:0 0 8px;font-weight:600;color:#333;">Delivery Address</p>
      <p style="margin:0;color:#555;font-size:14px;">${addr?.name ?? data.customerName}</p>
      ${addr?.phone ? `<p style="margin:4px 0 0;color:#777;font-size:13px;">📞 ${addr.phone}</p>` : ''}
      <p style="margin:4px 0 0;color:#777;font-size:13px;">📍 ${addrLine}</p>
    </div>
    <p style="margin-top:24px;color:#555;font-size:14px;">Thank you for supporting local artisans! 🙏</p>`;

  await sendEmail(
    data.customerEmail,
    `Order Confirmed — ${data.orderNumber} | Festecart`,
    baseTemplate('Order Confirmation', customerBody)
  );

  // Admin notification
  const adminBody = `
    <h2 style="color:${BRAND_COLOR};margin:0 0 16px;">New Order Received 🛒</h2>
    <p><strong>Order:</strong> ${data.orderNumber}</p>
    <p><strong>Customer:</strong> ${data.customerName} (${data.customerEmail})</p>
    <p><strong>Total:</strong> ₹${data.total.toLocaleString('en-IN')}</p>
    <p><strong>Payment:</strong> ${data.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment'}</p>
    <p><strong>Address:</strong> ${addrLine}</p>
    <h3 style="margin-top:16px;">Items:</h3>
    ${orderItemsTable(data.items)}`;

  await sendEmail(
    ADMIN_EMAIL,
    `New Order: ${data.orderNumber} — ₹${data.total.toLocaleString('en-IN')}`,
    baseTemplate('New Order Notification', adminBody)
  );
}
