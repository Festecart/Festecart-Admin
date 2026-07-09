const { onRequest } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const { initializeApp } = require('firebase-admin/app')
const { Resend } = require('resend')

initializeApp()
setGlobalOptions({ region: 'us-central1' })

const FROM_EMAIL  = 'Festecart <noreply@festecart.org>'
const LOGO_URL    = 'https://admin.festecart.org/logo.png'
const BRAND_DARK  = '#1e293b'
const BRAND_ORA   = '#fb923c'
const BRAND_GRN   = '#4ade80'

const SUBJECTS = {
  confirmed:           '✅ Order Confirmed — Festecart',
  processing:          '⚙️ Your Order is Being Processed — Festecart',
  partially_fulfilled: '📦 Partial Shipment Update — Festecart',
  fulfilled:           '📦 Order Fulfilled — Festecart',
  shipped:             '🚚 Your Order is On The Way — Festecart',
  out_for_delivery:    '🛵 Out for Delivery Today — Festecart',
  partially_delivered: '📬 Partial Delivery Update — Festecart',
  delivered:           '🎉 Order Delivered — Festecart',
  cancelled:           '❌ Order Cancelled — Festecart',
  completed:           '🎉 Order Completed — Festecart',
}

const STATUS_COLORS = {
  confirmed:           { bg:'#f0fdf4', border:'#86efac', text:'#166534' },
  processing:          { bg:'#eff6ff', border:'#93c5fd', text:'#1e40af' },
  fulfilled:           { bg:'#f0fdf4', border:'#86efac', text:'#166534' },
  partially_fulfilled: { bg:'#fff7ed', border:'#fdba74', text:'#c2410c' },
  shipped:             { bg:'#eff6ff', border:'#93c5fd', text:'#1e40af' },
  out_for_delivery:    { bg:'#fefce8', border:'#fde047', text:'#854d0e' },
  partially_delivered: { bg:'#fff7ed', border:'#fdba74', text:'#c2410c' },
  delivered:           { bg:'#f0fdf4', border:'#86efac', text:'#166534' },
  cancelled:           { bg:'#fef2f2', border:'#fca5a5', text:'#991b1b' },
}

function fmt(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }) }

// ── Logo header ───────────────────────────────────────────────────
function header(_orderNum) {
  return `
  <tr><td style="background:#ffffff;border-radius:12px 12px 0 0;padding:36px 32px 28px;border-bottom:1px solid #e2e8f0;text-align:center;">
    <img src="${LOGO_URL}" alt="Festecart" style="display:inline-block;height:120px;width:auto;max-width:300px;" />
  </td></tr>`
}

// ── Footer ────────────────────────────────────────────────────────
function footer() {
  return `
  <tr><td style="background:#f8fafc;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
    <img src="${LOGO_URL}" alt="Festecart" height="36" style="height:36px;margin-bottom:10px;" />
    <p style="color:#64748b;font-size:12px;margin:0;">Questions? <a href="mailto:celebrate@festecart.org" style="color:#e97316;text-decoration:none;">celebrate@festecart.org</a></p>
    <p style="color:#94a3b8;font-size:10px;margin:6px 0 0;">© 2026 Festecart · No. 861, 2nd Floor, BEML Layout, Bengaluru – 560098</p>
    <p style="color:#cbd5e1;font-size:9px;margin:4px 0 0;">This is an automated email. Please do not reply directly.</p>
  </td></tr>`
}

// ── Items table ───────────────────────────────────────────────────
function itemsTable(items, nameKey = 'name', qtyKey = 'quantity') {
  if (!items || items.length === 0) return ''
  const rows = items.map(i => {
    const name = i[nameKey] || i.product_name || i.name || '—'
    const qty  = i[qtyKey]  || i.fulfilled_qty || i.quantity || 1
    const amt  = fmt(i.price * qty)
    return `<tr>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;font-size:13px;">${name}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:13px;">${qty}</td>
      <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#1e293b;font-weight:600;font-size:13px;">${amt}</td>
    </tr>`
  }).join('')
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:4px;">
      <thead><tr style="background:#f8fafc;">
        <th style="padding:10px 12px;text-align:left;border:1px solid #e2e8f0;color:#64748b;font-size:12px;font-weight:600;">Item</th>
        <th style="padding:10px 12px;text-align:center;border:1px solid #e2e8f0;color:#64748b;font-size:12px;font-weight:600;width:50px;">Qty</th>
        <th style="padding:10px 12px;text-align:right;border:1px solid #e2e8f0;color:#64748b;font-size:12px;font-weight:600;width:100px;">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

// ── Price breakdown ───────────────────────────────────────────────
function priceBreakdown(order) {
  const subtotal  = Number(order.subtotal || 0)
  const shipping  = Number(order.shipping_charge || 0)
  const total     = Number(order.total || 0)
  const payment   = order.payment_method === 'cod' ? 'Cash on Delivery' : (order.payment_method || '').toUpperCase()
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;margin-top:8px;">
      <tr><td style="padding:4px 0;color:#64748b;">Subtotal</td><td style="text-align:right;color:#1e293b;">${fmt(subtotal)}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">Shipping</td><td style="text-align:right;color:${shipping === 0 ? '#16a34a' : '#1e293b'};">${shipping === 0 ? 'FREE' : fmt(shipping)}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #e2e8f0;padding-top:8px;"></td></tr>
      <tr>
        <td style="padding:4px 0;font-weight:700;font-size:15px;color:#1e293b;">Total Payable</td>
        <td style="text-align:right;font-weight:700;font-size:15px;color:#166534;">${fmt(total)}</td>
      </tr>
      <tr><td style="padding:6px 0;color:#64748b;font-size:12px;">Payment Method</td><td style="text-align:right;color:#1e293b;font-size:12px;">${payment}</td></tr>
    </table>`
}

// ── Shipping address block ────────────────────────────────────────
function shippingBlock(addr, label = 'Shipping Address') {
  if (!addr) return ''
  const lines = [addr.address, addr.city, addr.state, addr.pincode ? `PIN: ${addr.pincode}` : ''].filter(Boolean)
  return `
    <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;">${label}</p>
      <p style="margin:0;font-size:14px;font-weight:600;color:#1e293b;">${addr.name || '—'}</p>
      ${addr.phone ? `<p style="margin:3px 0 0;font-size:13px;color:#64748b;">📞 ${addr.phone}</p>` : ''}
      <p style="margin:3px 0 0;font-size:13px;color:#64748b;">📍 ${lines.join(', ')}</p>
    </div>`
}

// ── Main email builder ────────────────────────────────────────────
function buildEmail(name, orderNum, statusLabel, newStatus, order, invoice) {
  const sc = STATUS_COLORS[newStatus] || { bg:'#f8fafc', border:'#cbd5e1', text:'#334155' }
  const addr = order.shipping_address || null
  const allItems = order.items || []
  const invoiceItems = invoice ? (invoice.invoice_items || []) : []
  const showInvItems = invoiceItems.length > 0 &&
    ['shipped','fulfilled','partially_fulfilled','delivered','partially_delivered'].includes(newStatus)

  // For delivered status — show full invoice
  const isDelivered = newStatus === 'delivered'

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Order Update — Festecart</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  ${header(orderNum)}

  <tr><td style="background:#ffffff;padding:32px;">

    <!-- Greeting -->
    <p style="font-size:18px;font-weight:600;color:#1e293b;margin:0 0 4px;">Hi ${name},</p>
    <p style="font-size:14px;color:#64748b;margin:0 0 24px;">${
      newStatus === 'confirmed'      ? "Thank you for your order! We've received it and will start processing shortly."
      : newStatus === 'processing'   ? "Great news! Your order is now being processed by our team."
      : newStatus === 'shipped'      ? "Your order is on its way! Track it using the details below."
      : newStatus === 'out_for_delivery' ? "Your order is out for delivery today. Please be available to receive it."
      : newStatus === 'delivered'    ? "Your order has been delivered. Thank you for shopping with Festecart! 🙏"
      : newStatus === 'cancelled'    ? "We're sorry — your order has been cancelled."
      : "Here's an update on your order."
    }</p>

    <!-- Status badge -->
    <div style="background:${sc.bg};border:1px solid ${sc.border};border-radius:10px;padding:18px;text-align:center;margin-bottom:28px;">
      <p style="margin:0;font-size:11px;color:${sc.text};text-transform:uppercase;letter-spacing:2px;font-weight:700;">Order Status</p>
      <p style="margin:8px 0 0;font-size:22px;font-weight:700;color:${sc.text};">${statusLabel}</p>
    </div>

    <!-- Order number -->
    <div style="background:#f8fafc;border-radius:8px;padding:14px 20px;text-align:center;margin-bottom:24px;">
      <p style="margin:0;font-size:11px;color:#94a3b8;letter-spacing:1px;">ORDER NUMBER</p>
      <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#1e293b;">${orderNum}</p>
    </div>

    <!-- Tracking info (shipped) -->
    ${newStatus === 'shipped' && invoice ? `
    <div style="background:#eff6ff;border-radius:10px;padding:18px 20px;margin-bottom:24px;border-left:4px solid #3b82f6;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1e40af;">📦 Tracking Information</p>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;width:100%;">
        <tr><td style="color:#64748b;padding:4px 0;width:140px;">Courier</td>
            <td style="color:#1e293b;font-weight:600;">${invoice.courier || 'Self Delivery'}</td></tr>
        ${invoice.tracking_number ? `
        <tr><td style="color:#64748b;padding:4px 0;">Tracking #</td>
            <td style="color:#1e293b;font-family:monospace;font-weight:600;">${invoice.tracking_number}</td></tr>` : ''}
        ${invoice.estimated_delivery ? `
        <tr><td style="color:#64748b;padding:4px 0;">Est. Delivery</td>
            <td style="color:#1e293b;">${new Date(invoice.estimated_delivery).toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</td></tr>` : ''}
      </table>
    </div>` : ''}

    <!-- Shipping address (always shown) -->
    ${addr ? shippingBlock(addr, 'Delivery Address') : ''}

    <!-- Items in shipment (shipped/fulfilled) -->
    ${showInvItems && !isDelivered ? `
    <div style="margin-bottom:20px;">
      <p style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Items in This Shipment</p>
      ${itemsTable(invoiceItems, 'product_name', 'fulfilled_qty')}
    </div>

    ${(() => {
      // Calculate remaining items
      const fulfilledMap = {}
      invoiceItems.forEach(ii => {
        const id = ii.product_id || ii.product_name
        fulfilledMap[id] = (fulfilledMap[id] || 0) + (ii.fulfilled_qty || 0)
      })
      const remaining = allItems.map(item => {
        const key = item.product_id || item.name
        const shipped = fulfilledMap[key] || 0
        const left = (item.quantity || 0) - shipped
        return left > 0 ? { ...item, quantity: left } : null
      }).filter(Boolean)

      if (remaining.length === 0) return ''
      return `
      <div style="margin-bottom:20px;">
        <p style="font-size:12px;font-weight:700;color:#c2410c;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">⏳ Remaining Items (Coming Soon)</p>
        ${itemsTable(remaining, 'name', 'quantity')}
        <p style="font-size:12px;color:#64748b;margin:8px 0 0;font-style:italic;">These items will be shipped in a subsequent delivery.</p>
      </div>`
    })()}` : ''}

    <!-- Full invoice on delivery -->
    ${isDelivered ? `
    <div style="border:2px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:20px;">
      <p style="font-size:14px;font-weight:700;color:#1e293b;margin:0 0 16px;border-bottom:1px solid #e2e8f0;padding-bottom:12px;">
        🧾 Invoice / Order Receipt
      </p>

      <!-- Billing & Shipping -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td width="48%" style="vertical-align:top;padding-right:8px;">
            <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Delivered To</p>
            ${addr ? `
            <p style="margin:0;font-size:13px;font-weight:600;color:#1e293b;">${addr.name || name}</p>
            ${addr.phone ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">📞 ${addr.phone}</p>` : ''}
            <p style="margin:2px 0 0;font-size:12px;color:#64748b;">📍 ${[addr.address,addr.city,addr.state].filter(Boolean).join(', ')}</p>
            ${addr.pincode ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">PIN: ${addr.pincode}</p>` : ''}
            ` : `<p style="font-size:13px;color:#64748b;">${name}</p>`}
          </td>
          <td width="4%"></td>
          <td width="48%" style="vertical-align:top;">
            <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Order Details</p>
            <p style="margin:0;font-size:12px;color:#64748b;">Order No: <strong style="color:#1e293b;">${orderNum}</strong></p>
            <p style="margin:3px 0 0;font-size:12px;color:#64748b;">Payment: <strong style="color:#1e293b;">${order.payment_method === 'cod' ? 'Cash on Delivery' : (order.payment_method||'').toUpperCase()}</strong></p>
            <p style="margin:3px 0 0;font-size:12px;color:#64748b;">Delivered: <strong style="color:#1e293b;">${new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</strong></p>
          </td>
        </tr>
      </table>

      <!-- All items -->
      <p style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Items Ordered</p>
      ${itemsTable(allItems, 'name', 'quantity')}

      <!-- Price breakdown -->
      ${priceBreakdown(order)}

      ${order.note ? `<p style="margin:12px 0 0;font-size:12px;color:#64748b;font-style:italic;">Note: ${order.note}</p>` : ''}
    </div>

    <div style="background:#f0fdf4;border-radius:8px;padding:14px 18px;margin-bottom:20px;border-left:3px solid #22c55e;">
      <p style="margin:0;font-size:13px;font-weight:600;color:#166534;">🙏 Thank you for shopping with Festecart!</p>
      <p style="margin:4px 0 0;font-size:12px;color:#166534;">Your support means a lot to our artisans and craftspeople.</p>
    </div>` : ''}

    <!-- Order summary for non-delivered statuses -->
    ${!isDelivered && !showInvItems && allItems.length > 0 ? `
    <div style="margin-bottom:20px;">
      <p style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Order Summary</p>
      ${itemsTable(allItems, 'name', 'quantity')}
      ${priceBreakdown(order)}
    </div>` : ''}

    <!-- Cancelled note -->
    ${newStatus === 'cancelled' ? `
    <div style="background:#fef2f2;border-radius:8px;padding:14px 18px;border-left:3px solid #ef4444;">
      <p style="margin:0;font-size:13px;color:#991b1b;">If you paid online, a refund will be processed within 5–7 business days.</p>
      <p style="margin:6px 0 0;font-size:12px;color:#991b1b;">Need help? Email us at <a href="mailto:celebrate@festecart.org" style="color:#b91c1c;">celebrate@festecart.org</a></p>
    </div>` : ''}

  </td></tr>

  ${footer()}

</table></td></tr></table>
</body></html>`
}

// ── Send logic ────────────────────────────────────────────────────
async function doSendEmail(order, new_status, invoice) {
  const email = order.customer_email || order.guest_email
  const name  = order.guest_name || order.shipping_address?.name || 'Customer'
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

// ── HTTP endpoint ─────────────────────────────────────────────────
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

