import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Festecart <orders@festecart.org>'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUBJECTS: Record<string, string> = {
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

// ── Logo HTML (text-based, renders in all email clients) ───────
const LOGO_HTML = `
  <table cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td style="font-family:Georgia,serif;font-size:28px;font-weight:900;letter-spacing:-1px;line-height:1;">
        <span style="color:#e05a00;">fest</span><span style="color:#1a5c1a;">ecart</span>
      </td>
    </tr>
    <tr>
      <td style="font-family:Arial,sans-serif;font-size:10px;color:#3333aa;letter-spacing:1px;padding-top:2px;">
        LIVE DESI. BE DESI.
      </td>
    </tr>
  </table>`

// ── Number to words ────────────────────────────────────────────
function toWords(n: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  if (n === 0) return 'Zero'
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '')
  if (n < 1000) return ones[Math.floor(n/100)] + ' Hundred' + (n%100 ? ' '+toWords(n%100) : '')
  if (n < 100000) return toWords(Math.floor(n/1000)) + ' Thousand' + (n%1000 ? ' '+toWords(n%1000) : '')
  return toWords(Math.floor(n/100000)) + ' Lakh' + (n%100000 ? ' '+toWords(n%100000) : '')
}

function fmt(n: number) { return '₹' + n.toFixed(2) }

// ── Invoice block — uses ONLY invoice_items (not full order) ───
function invoiceBlock(inv: Record<string,unknown>, order: Record<string,unknown>): string {
  const items = (inv.invoice_items as Array<{product_name:string;fulfilled_qty:number;ordered_qty:number;price:number}>) ?? []
  const total = items.reduce((s,i) => s + i.price * i.fulfilled_qty, 0)
  const addr = order.shipping_address as Record<string,string> | null
  const invDate = new Date((inv.invoice_date as string) || (inv.created_at as string) || new Date().toISOString())
    .toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})
  const ordDate = new Date(order.created_at as string)
    .toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})
  const custName = (order.guest_name as string) || addr?.name || '—'
  const custEmail = (order.guest_email as string) || (order.customer_email as string) || '—'
  const invNum = ((inv.invoice_number as string) || '').replace('INV-','')
  const payMode = (order.payment_method as string) === 'cod' ? 'Cash on Delivery' : ((order.payment_method as string)||'').toUpperCase()
  const inWords = toWords(Math.round(total)) + ' Rupees Only'

  return `
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;margin:24px 0;background:#ffffff;font-family:Arial,sans-serif;">
  <tr><td style="padding:24px;">

    <!-- Invoice header -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>${LOGO_HTML}</td>
        <td align="right" style="font-size:12px;color:#64748b;line-height:1.8;">
          <strong style="color:#1e293b;">Invoice #${invNum}</strong><br/>
          Date: ${invDate}<br/>
          GSTIN: 29AFFFS9227M1Z7
        </td>
      </tr>
    </table>

    <div style="height:1px;background:#e2e8f0;margin:16px 0;"></div>

    <!-- Company address -->
    <p style="font-size:11px;color:#64748b;line-height:1.6;margin:0 0 16px;">
      <strong style="color:#1e293b;">festecart</strong><br/>
      No 861, 2nd floor, 5th Main, Near Hopcoms, BEML Layout, 3rd Stage,<br/>
      Rajarajeshwari Nagar, Bengaluru — 560098
    </p>

    <div style="height:1px;background:#e2e8f0;margin:0 0 16px;"></div>

    <!-- Addresses + order meta -->
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;">
      <tr>
        <td width="33%" valign="top" style="padding-right:12px;">
          <p style="font-size:10px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Ship To</p>
          <p style="color:#1e293b;line-height:1.6;margin:0;">
            ${addr ? `<strong>${addr.name}</strong><br/>${addr.address}<br/>${addr.city}, ${addr.state} ${addr.pincode}<br/>📞 ${addr.phone}` : `<strong>${custName}</strong>`}
          </p>
        </td>
        <td width="33%" valign="top" style="padding:0 12px;">
          <p style="font-size:10px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Bill To</p>
          <p style="color:#1e293b;line-height:1.6;margin:0;">
            ${addr ? `<strong>${addr.name}</strong><br/>${addr.address}<br/>${addr.city}, ${addr.state} ${addr.pincode}` : `<strong>${custName}</strong>`}
          </p>
        </td>
        <td width="33%" valign="top" align="right">
          <p style="font-size:10px;font-weight:bold;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">Order Details</p>
          <p style="color:#1e293b;line-height:1.8;margin:0;font-size:12px;">
            <strong>${(order.order_number as string)?.replace('#','') || '—'}</strong><br/>
            ${ordDate}<br/>
            ${custEmail}
          </p>
        </td>
      </tr>
    </table>

    <div style="height:1px;background:#e2e8f0;margin:16px 0;"></div>

    <!-- Items table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;border:1px solid #e2e8f0;color:#64748b;">Item</th>
          <th style="padding:10px 12px;text-align:center;border:1px solid #e2e8f0;color:#64748b;width:60px;">Qty</th>
          <th style="padding:10px 12px;text-align:right;border:1px solid #e2e8f0;color:#64748b;width:80px;">Price</th>
          <th style="padding:10px 12px;text-align:right;border:1px solid #e2e8f0;color:#64748b;width:90px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(i=>`
        <tr>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;"><strong>${i.product_name}</strong></td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b;">${i.fulfilled_qty}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#64748b;">${fmt(i.price)}</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#1e293b;font-weight:600;">${fmt(i.price*i.fulfilled_qty)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f8fafc;">
          <td colspan="3" style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#1e293b;">Total</td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#1e293b;font-size:14px;">${fmt(total)}</td>
        </tr>
      </tfoot>
    </table>

    <p style="font-size:12px;color:#64748b;margin:12px 0 4px;"><em>${inWords}</em></p>
    <p style="font-size:12px;color:#64748b;margin:4px 0;"><strong>Payment:</strong> ${payMode}</p>
    ${inv.notes ? `<p style="font-size:12px;color:#64748b;margin:4px 0;"><strong>Notes:</strong> ${inv.notes}</p>` : ''}

  </td></tr>
</table>`
}

// ── Main email template ────────────────────────────────────────
function buildEmail(
  name: string,
  orderNum: string,
  statusLabel: string,
  newStatus: string,
  order: Record<string,unknown>,
  invoice: Record<string,unknown> | null
): string {

  // For shipped/fulfilled/partially_fulfilled: show invoice items, not all order items
  // For confirmed/processing/cancelled: show full order items
  const invoiceItems = invoice
    ? (invoice.invoice_items as Array<{product_name:string;fulfilled_qty:number;price:number}>) ?? []
    : []

  const allOrderItems = (order.items as Array<{name:string;quantity:number;price:number}>) ?? []

  // Use invoice items when we have a specific invoice (shipped, fulfilled, partially)
  const showInvoiceItems = invoiceItems.length > 0 && ['shipped','fulfilled','partially_fulfilled','delivered','partially_delivered'].includes(newStatus)

  // Status colours
  const statusColors: Record<string,{bg:string;border:string;text:string}> = {
    confirmed:           {bg:'#f0fdf4', border:'#86efac', text:'#166534'},
    processing:          {bg:'#eff6ff', border:'#93c5fd', text:'#1e40af'},
    shipped:             {bg:'#eff6ff', border:'#93c5fd', text:'#1e40af'},
    fulfilled:           {bg:'#f0fdf4', border:'#86efac', text:'#166534'},
    partially_fulfilled: {bg:'#fff7ed', border:'#fdba74', text:'#c2410c'},
    partially_delivered: {bg:'#fff7ed', border:'#fdba74', text:'#c2410c'},
    delivered:           {bg:'#f0fdf4', border:'#86efac', text:'#166534'},
    cancelled:           {bg:'#fef2f2', border:'#fca5a5', text:'#991b1b'},
  }
  const sc = statusColors[newStatus] || {bg:'#f8fafc', border:'#cbd5e1', text:'#334155'}

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Order Update — Festecart</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#1e293b;border-radius:12px 12px 0 0;padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <span style="font-family:Georgia,serif;font-size:26px;font-weight:900;letter-spacing:-1px;">
            <span style="color:#fb923c;">fest</span><span style="color:#4ade80;">ecart</span>
          </span>
          <br/><span style="font-size:10px;color:#94a3b8;letter-spacing:2px;">LIVE DESI. BE DESI.</span>
        </td>
        <td align="right">
          <span style="background:#334155;color:#94a3b8;font-size:11px;padding:6px 12px;border-radius:20px;">${orderNum}</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#ffffff;padding:32px;">

    <p style="font-size:18px;font-weight:600;color:#1e293b;margin:0 0 6px;">Hi ${name},</p>
    <p style="font-size:14px;color:#64748b;margin:0 0 24px;">
      ${newStatus === 'confirmed'
        ? "Thank you for your order! We've received it and will start processing shortly."
        : newStatus === 'cancelled'
          ? "We're sorry to inform you that your order has been cancelled."
          : "Here's an update on your order."}
    </p>

    <!-- Status pill -->
    <div style="background:${sc.bg};border:1px solid ${sc.border};border-radius:10px;padding:20px;text-align:center;margin-bottom:28px;">
      <p style="margin:0;font-size:11px;color:${sc.text};text-transform:uppercase;letter-spacing:2px;font-weight:600;">Order Status</p>
      <p style="margin:8px 0 0;font-size:24px;font-weight:700;color:${sc.text};">${statusLabel}</p>
    </div>

    <!-- Confirmed welcome -->
    ${newStatus === 'confirmed' ? `
    <div style="background:#f0fdf4;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #22c55e;">
      <p style="margin:0;font-size:14px;color:#166534;font-weight:600;">🎉 Order Placed Successfully!</p>
      <p style="margin:8px 0 0;font-size:13px;color:#166534;">You'll receive email updates as your order progresses.</p>
    </div>` : ''}

    <!-- Tracking info (shipped) -->
    ${newStatus === 'shipped' && invoice ? `
    <div style="background:#eff6ff;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #3b82f6;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#1e40af;">📦 Tracking Information</p>
      <table cellpadding="0" cellspacing="0" style="font-size:13px;width:100%;">
        <tr><td style="color:#64748b;padding:4px 0;width:130px;">Courier</td><td style="color:#1e293b;font-weight:600;">${(invoice.courier as string) || '—'}</td></tr>
        ${invoice.tracking_number ? `<tr><td style="color:#64748b;padding:4px 0;">Tracking #</td><td style="color:#1e293b;font-weight:600;font-family:monospace;">${invoice.tracking_number}</td></tr>` : ''}
        ${invoice.sent_at ? `<tr><td style="color:#64748b;padding:4px 0;">Dispatched</td><td style="color:#1e293b;">${new Date(invoice.sent_at as string).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td></tr>` : ''}
        ${invoice.estimated_delivery ? `<tr><td style="color:#64748b;padding:4px 0;">Est. Delivery</td><td style="color:#1e293b;">${new Date(invoice.estimated_delivery as string).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}</td></tr>` : ''}
      </table>
    </div>` : ''}

    <!-- Delivered message -->
    ${newStatus === 'delivered' ? `
    <div style="background:#f0fdf4;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #22c55e;">
      <p style="margin:0;font-size:14px;font-weight:600;color:#166534;">🎉 Delivered Successfully!</p>
      <p style="margin:8px 0 0;font-size:13px;color:#166534;">Thank you for shopping with Festecart! We hope you love your purchase.</p>
    </div>` : ''}

    <!-- Cancelled message -->
    ${newStatus === 'cancelled' ? `
    <div style="background:#fef2f2;border-radius:10px;padding:20px;margin-bottom:24px;border-left:4px solid #ef4444;">
      <p style="margin:0;font-size:13px;color:#991b1b;">If you have any questions about this cancellation, please contact us at <a href="mailto:celebrate@festecart.org" style="color:#b91c1c;">celebrate@festecart.org</a></p>
    </div>` : ''}

    <!-- Items shipped (invoice items — only what's in this shipment) -->
    ${showInvoiceItems ? `
    <div style="margin-bottom:24px;">
      <p style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">
        ${newStatus === 'shipped' ? '🚚 Items in This Shipment' : '📦 Items Dispatched'}
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px;text-align:left;border:1px solid #e2e8f0;color:#64748b;">Item</th>
            <th style="padding:10px 12px;text-align:center;border:1px solid #e2e8f0;color:#64748b;width:50px;">Qty</th>
            <th style="padding:10px 12px;text-align:right;border:1px solid #e2e8f0;color:#64748b;width:90px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoiceItems.map(i=>`
          <tr>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;">${i.product_name}</td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b;">${i.fulfilled_qty}</td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#1e293b;font-weight:600;">${fmt(i.price*i.fulfilled_qty)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <!-- Full order summary (confirmed / processing) -->
    ${!showInvoiceItems && newStatus !== 'cancelled' && allOrderItems.length > 0 ? `
    <div style="margin-bottom:24px;">
      <p style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Order Summary</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px;text-align:left;border:1px solid #e2e8f0;color:#64748b;">Item</th>
            <th style="padding:10px 12px;text-align:center;border:1px solid #e2e8f0;color:#64748b;width:50px;">Qty</th>
            <th style="padding:10px 12px;text-align:right;border:1px solid #e2e8f0;color:#64748b;width:90px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${allOrderItems.map(i=>`
          <tr>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;">${i.name}</td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:center;color:#64748b;">${i.quantity}</td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;color:#1e293b;font-weight:600;">${fmt(i.price*i.quantity)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f8fafc;">
            <td colspan="2" style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#1e293b;">Order Total</td>
            <td style="padding:10px 12px;border:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#1e293b;">${fmt((order.total as number)||0)}</td>
          </tr>
        </tfoot>
      </table>
    </div>` : ''}

    <!-- Invoice on delivery -->
    ${newStatus === 'delivered' && invoice ? invoiceBlock(invoice, order) : ''}

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#1e293b;border-radius:0 0 12px 12px;padding:24px 32px;text-align:center;">
    <p style="color:#94a3b8;font-size:12px;margin:0 0 6px;">Questions? <a href="mailto:celebrate@festecart.org" style="color:#fb923c;text-decoration:none;">celebrate@festecart.org</a></p>
    <p style="color:#475569;font-size:11px;margin:0;">No 861, 2nd floor, 5th Main, Bengaluru — 560098</p>
    <p style="color:#334155;font-size:10px;margin:8px 0 0;">© 2025 Festecart · live desi. be desi.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

// ── Main handler ───────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const { order, new_status, invoice } = await req.json()
  const od = order as Record<string,unknown>

  let email = (od.customer_email as string|null) ?? (od.guest_email as string|null)
  let name = (od.guest_name as string) ?? ''

  if (!email && od.user_id && SERVICE_KEY) {
    try {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY)
      const { data: p } = await admin.from('user_profiles').select('name,email').eq('user_id', od.user_id as string).single()
      if (p?.email) email = p.email
      if (!name && p?.name) name = p.name
    } catch { /* ignore */ }
  }

  if (!email) {
    return new Response(JSON.stringify({ ok: false, reason: 'No email found' }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' }
    })
  }

  if (!name) {
    const addr = od.shipping_address as Record<string,string>|null
    name = addr?.name ?? 'Customer'
  }

  const orderNum = (od.order_number as string) ?? '—'
  const statusLabel = new_status.replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase())
  const subject = SUBJECTS[new_status] ?? `Order Update — Festecart`
  const html = buildEmail(name, orderNum, statusLabel, new_status, od, invoice)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
  })

  const result = await res.json()
  console.log(`[email] ${new_status} → ${email}:`, result)

  return new Response(JSON.stringify({ ok: res.ok, result, email }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
})
