const { onRequest } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const { initializeApp } = require('firebase-admin/app')
const { Resend } = require('resend')

initializeApp()
setGlobalOptions({ region: 'us-central1' })

const FROM_EMAIL = 'Festecart <noreply@festecart.org>'

const SUBJECTS = {
  confirmed:           '✅ Order Confirmed — Festecart',
  processing:          '🔄 Your Order is Being Processed — Festecart',
  partially_fulfilled: '📦 Partial Shipment — Festecart',
  fulfilled:           '📦 Order Fulfilled — Festecart',
  shipped:             '🚚 Your Order is On The Way — Festecart',
  out_for_delivery:    '🛵 Out for Delivery — Festecart',
  partially_delivered: '📦 Partial Delivery — Festecart',
  delivered:           '✅ Order Delivered — Festecart',
  cancelled:           '❌ Order Cancelled — Festecart',
  completed:           '🎉 Order Completed — Festecart',
}

function fmt(n) { return '₹' + Number(n).toFixed(2) }

function buildEmail(name, orderNum, statusLabel, newStatus, order, invoice) {
  const allItems     = (order.items ?? [])
  const invoiceItems = invoice ? (invoice.invoice_items ?? []) : []
  const showInvItems = invoiceItems.length > 0 && ['shipped','fulfilled','partially_fulfilled','delivered','partially_delivered'].includes(newStatus)

  const sc = {
    confirmed:           { bg:'#f0fdf4', border:'#86efac', text:'#166534' },
    processing:          { bg:'#eff6ff', border:'#93c5fd', text:'#1e40af' },
    shipped:             { bg:'#eff6ff', border:'#93c5fd', text:'#1e40af' },
    fulfilled:           { bg:'#f0fdf4', border:'#86efac', text:'#166534' },
    partially_fulfilled: { bg:'#fff7ed', border:'#fdba74', text:'#c2410c' },
    partially_delivered: { bg:'#fff7ed', border:'#fdba74', text:'#c2410c' },
    delivered:           { bg:'#f0fdf4', border:'#86efac', text:'#166534' },
    cancelled:           { bg:'#fef2f2', border:'#fca5a5', text:'#991b1b' },
  }[newStatus] || { bg:'#f8fafc', border:'#cbd5e1', text:'#334155' }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Order Update</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:#1e293b;border-radius:12px 12px 0 0;padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><span style="font-family:Georgia,serif;font-size:26px;font-weight:900;letter-spacing:-1px;">
        <span style="color:#fb923c;">fest</span><span style="color:#4ade80;">ecart</span>
      </span><br/><span style="font-size:10px;color:#94a3b8;letter-spacing:2px;">LIVE DESI. BE DESI.</span></td>
      <td align="right"><span style="background:#334155;color:#94a3b8;font-size:11px;padding:6px 12px;border-radius:20px;">${orderNum}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;">
    <p style="font-size:18px;font-weight:600;color:#1e293b;margin:0 0 6px;">Hi ${name},</p>
    <p style="font-size:14px;color:#64748b;margin:0 0 24px;">${
      newStatus === 'confirmed' ? "Thank you for your order! We've received it and will start processing shortly."
      : newStatus === 'cancelled' ? "We're sorry to inform you that your order has been cancelled."
      : "Here's an update on your order."
    }</p>
    <div style="background:${sc.bg};border:1px solid ${sc.border};border-radius:10px;padding:20px;text-align:center;margin-bottom:28px;">
      <p style="margin:0;font-size:11px;color:${sc.text};text-transform:uppercase;letter-spacing:2px;font-weight:600;">Order Status</p>
      <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:${sc.text};">${statusLabel}</p>
    </div>
    ${newStatus === 'shipped' && invoice ? `<div style="background:#eff6ff;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #3b82f6;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1e40af;">📦 Tracking Information</p>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;width:100%;">
        <tr><td style="color:#64748b;padding:4px 0;width:130px;">Courier</td><td style="color:#1e293b;font-weight:600;">${invoice.courier || '—'}</td></tr>
        ${invoice.tracking_number ? `<tr><td style="color:#64748b;padding:4px 0;">Tracking #</td><td style="color:#1e293b;font-family:monospace;">${invoice.tracking_number}</td></tr>` : ''}
      </table>
    </div>` : ''}
    ${newStatus === 'delivered' ? `<div style="background:#f0fdf4;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #22c55e;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#166534;">🎉 Delivered Successfully!</p>
      <p style="margin:8px 0 0;font-size:13px;color:#166534;">Thank you for shopping with Festecart!</p>
    </div>` : ''}
    ${newStatus === 'cancelled' ? `<div style="background:#fef2f2;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #ef4444;">
      <p style="margin:0;font-size:13px;color:#991b1b;">Questions? <a href="mailto:celebrate@festecart.org" style="color:#b91c1c;">celebrate@festecart.org</a></p>
    </div>` : ''}
    ${showInvItems ? `<div style="margin-bottom:24px;">
      <p style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Items in This Shipment</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;border:1px solid #e2e8f0;color:#64748b;">Item</th>
          <th style="padding:10px 12px;text-align:center;border:1px solid #e2e8f0;color:#64748b;width:50px;">Qty</th>
          <th style="padding:10px 12px;text-align:right;border:1px solid #e2e8f0;color:#64748b;width:90px;">Amount</th>
        </tr></thead>
        <tbody>${invoiceItems.map(i=>`<tr>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;">${i.product_name}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b;">${i.fulfilled_qty}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#1e293b;font-weight:600;">${fmt(i.price*i.fulfilled_qty)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
    ${!showInvItems && allItems.length > 0 ? `<div style="margin-bottom:24px;">
      <p style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Order Summary</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;border:1px solid #e2e8f0;color:#64748b;">Item</th>
          <th style="padding:10px 12px;text-align:center;border:1px solid #e2e8f0;color:#64748b;width:50px;">Qty</th>
          <th style="padding:10px 12px;text-align:right;border:1px solid #e2e8f0;color:#64748b;width:90px;">Amount</th>
        </tr></thead>
        <tbody>${allItems.map(i=>`<tr>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;">${i.name}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b;">${i.quantity}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#1e293b;font-weight:600;">${fmt(i.price*i.quantity)}</td>
        </tr>`).join('')}
        <tr style="background:#f8fafc;"><td colspan="2" style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#1e293b;">Total</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#1e293b;">${fmt(order.total||0)}</td>
        </tr></tbody>
      </table>
    </div>` : ''}
  </td></tr>
  <tr><td style="background:#1e293b;border-radius:0 0 12px 12px;padding:24px 32px;text-align:center;">
    <p style="color:#94a3b8;font-size:12px;margin:0 0 6px;">Questions? <a href="mailto:celebrate@festecart.org" style="color:#fb923c;text-decoration:none;">celebrate@festecart.org</a></p>
    <p style="color:#334155;font-size:10px;margin:8px 0 0;">© 2025 Festecart · live desi. be desi.</p>
  </td></tr>
</table></td></tr></table>
</body></html>`
}

// ── Shared send logic ─────────────────────────────────────────────
async function doSendEmail(order, new_status, invoice) {
  let email = order.customer_email || order.guest_email
  let name  = order.guest_name || order.shipping_address?.name || 'Customer'
  if (!email) throw new Error('No email found on order')

  const orderNum    = order.order_number || '—'
  const statusLabel = new_status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const subject     = SUBJECTS[new_status] || `Order Update — Festecart`
  const html        = buildEmail(name, orderNum, statusLabel, new_status, order, invoice)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const result = await resend.emails.send({ from: FROM_EMAIL, to: email, subject, html })
  console.log(`[email] ${new_status} → ${email}:`, result)
  return result
}

// ── HTTP endpoint (called from admin app) ─────────────────────────
exports.sendOrderEmail = onRequest({ cors: true, secrets: ['RESEND_API_KEY'] }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).send('')
    return
  }
  res.set('Access-Control-Allow-Origin', '*')
  try {
    const { order, new_status, invoice } = req.body
    if (!order || !new_status) { res.status(400).json({ ok: false, reason: 'Missing order or new_status' }); return }
    const result = await doSendEmail(order, new_status, invoice)
    res.status(200).json({ ok: true, result })
  } catch (e) {
    console.error('[email] HTTP error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})
