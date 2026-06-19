import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
// Use verified sender — either your verified domain or Resend's sandbox
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Festecart <orders@festecart.org>'

const STATUS_SUBJECT: Record<string, string> = {
  confirmed:           '✅ Order Confirmed — Festecart',
  processing:          '🔄 Your Order is Being Processed',
  partially_fulfilled: '📦 Your Order is Partially Shipped',
  fulfilled:           '📦 Your Order has been Fulfilled',
  shipped:             '🚚 Your Order is Shipped',
  out_for_delivery:    '🛵 Your Order is Out for Delivery',
  delivered:           '✅ Your Order has been Delivered',
  cancelled:           '❌ Your Order has been Cancelled',
  completed:           '🎉 Order Completed — Thank you!',
}

serve(async (req) => {
  const { order, new_status, invoice } = await req.json()
  const email = order.guest_email
  if (!email) return new Response('No email', { status: 200 })

  const subject = STATUS_SUBJECT[new_status] ?? `Order Update — ${new_status}`
  const orderNum = order.order_number
  const customerName = order.guest_name ?? 'Customer'
  const statusLabel = new_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

  let body = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="color:#b91c1c;font-size:24px;margin:0;">Festecart</h1>
        <p style="color:#666;font-size:12px;margin:4px 0;">live desi. be desi</p>
      </div>
      <h2 style="color:#1a1a1a;">Hi ${customerName},</h2>
      <p style="color:#444;">Your order <strong>${orderNum}</strong> has been updated.</p>
      <div style="background:#f5f5f5;padding:20px;border-radius:12px;margin:20px 0;text-align:center;">
        <p style="margin:0;font-size:20px;font-weight:bold;color:#1a1a1a;">${statusLabel}</p>
      </div>
  `

  if (invoice && new_status === 'shipped') {
    body += `
      <div style="background:#fff;border:1px solid #e5e5e5;padding:20px;border-radius:12px;margin:16px 0;">
        <h3 style="margin:0 0 12px;color:#1a1a1a;">📦 Tracking Information</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:4px 0;color:#666;">Courier</td><td style="padding:4px 0;font-weight:600;">${invoice.courier ?? '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Tracking #</td><td style="padding:4px 0;font-weight:600;font-family:monospace;">${invoice.tracking_number ?? '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Sent</td><td style="padding:4px 0;">${invoice.sent_at ? new Date(invoice.sent_at).toLocaleString('en-IN') : '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#666;">Est. Delivery</td><td style="padding:4px 0;">${invoice.estimated_delivery ? new Date(invoice.estimated_delivery).toLocaleString('en-IN') : '—'}</td></tr>
        </table>
      </div>
    `
  }

  if (new_status === 'delivered') {
    body += `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:20px;border-radius:12px;margin:16px 0;">
        <p style="margin:0;color:#166534;font-size:16px;">🎉 Your order has been delivered successfully!</p>
        ${invoice ? `<p style="margin:8px 0 0;color:#166534;">Invoice: <strong>${invoice.invoice_number}</strong></p>` : ''}
        <p style="margin:8px 0 0;color:#166534;">Thank you for shopping with Festecart!</p>
      </div>
    `
  }

  if (new_status === 'cancelled') {
    body += `
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:20px;border-radius:12px;margin:16px 0;">
        <p style="margin:0;color:#991b1b;">Your order has been cancelled. If you have any questions, contact us at celebrate@festecart.com</p>
      </div>
    `
  }

  // Order summary
  const items = order.items ?? []
  if (items.length > 0) {
    body += `
      <div style="margin:16px 0;">
        <h3 style="color:#1a1a1a;margin:0 0 12px;">Order Summary</h3>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f5f5f5;">
            <th style="text-align:left;padding:10px 12px;font-size:12px;color:#666;">ITEM</th>
            <th style="text-align:center;padding:10px 12px;font-size:12px;color:#666;">QTY</th>
            <th style="text-align:right;padding:10px 12px;font-size:12px;color:#666;">TOTAL</th>
          </tr></thead>
          <tbody>
            ${items.map((item: { name: string; quantity: number; price: number }) => `
              <tr style="border-top:1px solid #f0f0f0;">
                <td style="padding:10px 12px;font-size:14px;">${item.name}</td>
                <td style="padding:10px 12px;text-align:center;font-size:14px;">${item.quantity}</td>
                <td style="padding:10px 12px;text-align:right;font-size:14px;font-weight:600;">₹${(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="border-top:2px solid #e5e5e5;background:#f5f5f5;">
              <td colspan="2" style="padding:10px 12px;font-weight:bold;">Total</td>
              <td style="padding:10px 12px;text-align:right;font-weight:bold;font-size:16px;">₹${order.total?.toFixed(2) ?? '0'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `
  }

  body += `
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
      <p style="color:#888;font-size:12px;text-align:center;">
        Festecart · celebrate@festecart.com<br/>
        No 861, 2nd floor, 5th Main, Bengaluru — 560098
      </p>
    </div>
  `

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html: body }),
  })

  const result = await res.json()
  return new Response(JSON.stringify({ ok: res.ok, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
