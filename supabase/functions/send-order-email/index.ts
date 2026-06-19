import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Festecart <orders@festecart.org>'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
// Custom secret name (SUPABASE_ prefix not allowed for custom secrets)
const SUPABASE_SERVICE_KEY = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const STATUS_SUBJECT: Record<string, string> = {
  confirmed:           '✅ Order Confirmed — Festecart',
  processing:          '🔄 Your Order is Being Processed — Festecart',
  partially_fulfilled: '📦 Your Order is Partially Shipped — Festecart',
  fulfilled:           '📦 Your Order has been Fulfilled — Festecart',
  shipped:             '🚚 Your Order is Shipped — Festecart',
  out_for_delivery:    '🛵 Your Order is Out for Delivery — Festecart',
  delivered:           '✅ Your Order has been Delivered — Festecart',
  cancelled:           '❌ Your Order has been Cancelled — Festecart',
  completed:           '🎉 Order Completed — Thank you! — Festecart',
}

// ── Number to words ────────────────────────────────────────────
function toWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  if (n === 0) return 'Zero'
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '')
  if (n < 100000) return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '')
  return toWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + toWords(n % 100000) : '')
}

// ── Generate invoice HTML block ───────────────────────────────
function generateInvoiceBlock(invoice: Record<string, unknown>, order: Record<string, unknown>): string {
  const items = (invoice.invoice_items as Array<{product_name: string; fulfilled_qty: number; ordered_qty: number; price: number}>) ?? []
  const total = items.reduce((s, i) => s + i.price * i.fulfilled_qty, 0)
  const addr = order.shipping_address as Record<string, string> | null
  const invoiceDate = new Date(invoice.invoice_date as string).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const orderDate = new Date(order.created_at as string).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const custName = (order.guest_name as string) || addr?.name || '—'
  const custEmail = (order.guest_email as string) || '—'
  const amountInWords = toWords(Math.round(total)) + ' Rupees Only'
  const invoiceNum = (invoice.invoice_number as string)?.replace('INV-', '') || '—'
  const payMode = (order.payment_method as string) === 'cod' ? 'Cash on Delivery' : ((order.payment_method as string) || '').toUpperCase()

  return `
  <div style="border:1px solid #e5e5e5;border-radius:12px;padding:24px;margin:20px 0;background:#fff;">
    <h2 style="text-align:center;font-size:16px;font-weight:bold;letter-spacing:2px;margin:0 0 20px;">INVOICE</h2>
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
      <div style="font-size:28px;font-weight:900;color:#b91c1c;line-height:1;">fest<span style="color:#1d6b2e;">ecart</span></div>
      <div style="text-align:right;font-size:12px;line-height:1.8;">
        <strong>Invoice Date:</strong> ${invoiceDate}<br/>
        <strong>Invoice No:</strong> ${invoiceNum}<br/>
        <strong>GSTIN:</strong> 29AFFFS9227M1Z7
      </div>
    </div>
    <div style="font-size:12px;line-height:1.6;margin-bottom:16px;">
      <strong>festecart ,</strong><br/>
      No 861, 2nd floor, 5th Main, Near Hopcoms, BEML Layout, 3rd Stage,<br/>
      Rajarajeshwari Nagar, Bengaluru South, RR Nagar, BBMP West<br/>
      Bengaluru, Karnataka, India - 560098
    </div>
    <hr style="border:none;border-top:1px solid #ddd;margin:12px 0;"/>
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
      <div style="font-size:12px;flex:1;">
        <strong>Shipping Address</strong><br/>
        ${addr ? `${addr.name}<br/>${addr.address}<br/>${addr.city}, ${addr.state}, India - ${addr.pincode}<br/>Phone: ${addr.phone}` : custName}
      </div>
      <div style="font-size:12px;flex:1;">
        <strong>Billing Address</strong><br/>
        ${addr ? `${addr.name}<br/>${addr.address}<br/>${addr.city}, ${addr.state}, India - ${addr.pincode}<br/>Phone: ${addr.phone}` : custName}
      </div>
      <div style="text-align:right;font-size:12px;line-height:1.8;">
        <strong>Order Date:</strong> ${orderDate}<br/>
        <strong>Order No.</strong> ${(order.order_number as string)?.replace('#', '') || '—'}<br/>
        <strong>Email:</strong> ${custEmail}
      </div>
    </div>
    <hr style="border:none;border-top:1px solid #ddd;margin:12px 0;"/>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="text-align:left;padding:8px 10px;font-size:12px;border:1px solid #ddd;">Item</th>
          <th style="text-align:center;padding:8px 10px;font-size:12px;border:1px solid #ddd;">Quantity</th>
          <th style="text-align:right;padding:8px 10px;font-size:12px;border:1px solid #ddd;">Price</th>
          <th style="text-align:right;padding:8px 10px;font-size:12px;border:1px solid #ddd;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(i => `
          <tr>
            <td style="padding:8px 10px;font-size:12px;border:1px solid #ddd;"><strong>${i.product_name}</strong></td>
            <td style="text-align:center;padding:8px 10px;font-size:12px;border:1px solid #ddd;">${i.fulfilled_qty}</td>
            <td style="text-align:right;padding:8px 10px;font-size:12px;border:1px solid #ddd;">${i.price.toFixed(2)}</td>
            <td style="text-align:right;padding:8px 10px;font-size:12px;border:1px solid #ddd;">${(i.price * i.fulfilled_qty).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f5f5f5;">
          <td colspan="3" style="text-align:right;padding:8px 10px;font-weight:bold;border:1px solid #ddd;">Total:</td>
          <td style="text-align:right;padding:8px 10px;font-weight:bold;font-size:14px;border:1px solid #ddd;">${total.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="font-size:12px;color:#444;margin:8px 0;"><strong>In words:</strong> ${amountInWords}</p>
    <p style="font-size:12px;margin:8px 0;"><strong>Mode of Payment:</strong> ${payMode}</p>
    ${invoice.notes ? `<p style="font-size:12px;margin:8px 0;"><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
  </div>`
}

// ── Email body builder ─────────────────────────────────────────
function buildEmailBody(
  customerName: string,
  orderNum: string,
  statusLabel: string,
  newStatus: string,
  order: Record<string, unknown>,
  invoice: Record<string, unknown> | null
): string {
  const items = (order.items as Array<{name: string; quantity: number; price: number}>) ?? []

  let body = `
  <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#fff;">
    <!-- Header -->
    <div style="text-align:center;padding:16px 0;border-bottom:2px solid #b91c1c;margin-bottom:24px;">
      <div style="font-size:32px;font-weight:900;color:#b91c1c;line-height:1;">fest<span style="color:#1d6b2e;">ecart</span></div>
      <p style="color:#666;font-size:12px;margin:4px 0 0;">live desi. be desi</p>
    </div>

    <h2 style="color:#1a1a1a;margin:0 0 8px;">Hi ${customerName},</h2>
    <p style="color:#444;margin:0 0 20px;">Your order <strong>${orderNum}</strong> has been updated.</p>

    <!-- Status badge -->
    <div style="background:#f5f5f5;padding:20px;border-radius:12px;margin:0 0 20px;text-align:center;border-left:4px solid #b91c1c;">
      <p style="margin:0;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Order Status</p>
      <p style="margin:4px 0 0;font-size:22px;font-weight:bold;color:#1a1a1a;">${statusLabel}</p>
    </div>`

  // ── Tracking info for shipped ──
  if (invoice && newStatus === 'shipped') {
    const inv = invoice as Record<string, unknown>
    body += `
    <div style="background:#eff6ff;border:1px solid #bfdbfe;padding:20px;border-radius:12px;margin:0 0 20px;">
      <h3 style="margin:0 0 12px;color:#1e40af;font-size:15px;">📦 Tracking Information</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr><td style="padding:4px 0;color:#555;width:140px;">Courier</td><td style="padding:4px 0;font-weight:600;">${inv.courier ?? '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Tracking #</td><td style="padding:4px 0;font-weight:600;font-family:monospace;">${inv.tracking_number ?? '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Sent On</td><td style="padding:4px 0;">${inv.sent_at ? new Date(inv.sent_at as string).toLocaleString('en-IN') : '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#555;">Est. Delivery</td><td style="padding:4px 0;">${inv.estimated_delivery ? new Date(inv.estimated_delivery as string).toLocaleString('en-IN') : '—'}</td></tr>
      </table>
    </div>`
  }

  // ── Delivered + invoice ──
  if (newStatus === 'delivered') {
    body += `
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:20px;border-radius:12px;margin:0 0 20px;">
      <p style="margin:0;color:#166534;font-size:16px;font-weight:600;">🎉 Your order has been delivered successfully!</p>
      <p style="margin:8px 0 0;color:#166534;">Thank you for shopping with Festecart!</p>
    </div>`
    // Attach invoice
    if (invoice) {
      body += generateInvoiceBlock(invoice as Record<string, unknown>, order)
    }
  }

  // ── Cancelled ──
  if (newStatus === 'cancelled') {
    body += `
    <div style="background:#fef2f2;border:1px solid #fecaca;padding:20px;border-radius:12px;margin:0 0 20px;">
      <p style="margin:0;color:#991b1b;">Your order has been cancelled. If you have any questions, please contact us at <a href="mailto:celebrate@festecart.org" style="color:#b91c1c;">celebrate@festecart.org</a></p>
    </div>`
  }

  // ── Order summary (all statuses except cancelled) ──
  if (newStatus !== 'cancelled' && items.length > 0) {
    body += `
    <div style="margin:0 0 20px;">
      <h3 style="color:#1a1a1a;margin:0 0 12px;font-size:14px;">Order Summary</h3>
      <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="text-align:left;padding:10px 12px;font-size:12px;color:#666;border-bottom:1px solid #e5e5e5;">ITEM</th>
            <th style="text-align:center;padding:10px 12px;font-size:12px;color:#666;border-bottom:1px solid #e5e5e5;">QTY</th>
            <th style="text-align:right;padding:10px 12px;font-size:12px;color:#666;border-bottom:1px solid #e5e5e5;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:10px 12px;font-size:13px;">${item.name}</td>
              <td style="padding:10px 12px;text-align:center;font-size:13px;">${item.quantity}</td>
              <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:600;">₹${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background:#f5f5f5;">
            <td colspan="2" style="padding:10px 12px;font-weight:bold;font-size:13px;">Total</td>
            <td style="padding:10px 12px;text-align:right;font-weight:bold;font-size:15px;color:#b91c1c;">₹${((order.total as number) ?? 0).toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>`
  }

  body += `
    <!-- Footer -->
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0;" />
    <div style="text-align:center;">
      <p style="color:#888;font-size:12px;margin:0;">Festecart · <a href="mailto:celebrate@festecart.org" style="color:#888;">celebrate@festecart.org</a></p>
      <p style="color:#aaa;font-size:11px;margin:4px 0 0;">No 861, 2nd floor, 5th Main, Bengaluru — 560098</p>
    </div>
  </div>`

  return body
}

// ── Main handler ───────────────────────────────────────────────
serve(async (req) => {
  const { order, new_status, invoice } = await req.json()
  const orderData = order as Record<string, unknown>

  // Get customer email — guest_email for guests, Auth email for registered users
  let email = orderData.guest_email as string | null
  let customerName = (orderData.guest_name as string) ?? ''

  if (!email && orderData.user_id) {
    // Registered user — look up email from user_profiles table first
    try {
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
      // Try user_profiles first (has email column)
      const { data: profile } = await adminClient
        .from('user_profiles')
        .select('name, email')
        .eq('user_id', orderData.user_id as string)
        .single()
      if (profile?.email) email = profile.email
      if (!customerName && profile?.name) customerName = profile.name

      // Fallback: auth user lookup
      if (!email) {
        const { data: userData } = await adminClient.auth.admin.getUserById(orderData.user_id as string)
        if (userData?.user?.email) email = userData.user.email
        if (!customerName) customerName = userData?.user?.user_metadata?.full_name ?? ''
      }
    } catch (e) {
      console.error('Failed to look up user email:', e)
    }
  }

  if (!email) {
    return new Response(JSON.stringify({ ok: false, reason: 'No email found for this order' }), { status: 200 })
  }

  // Fallback name from shipping address
  if (!customerName) {
    const addr = orderData.shipping_address as Record<string, string> | null
    customerName = addr?.name ?? 'Customer'
  }

  const subject = STATUS_SUBJECT[new_status] ?? `Order Update — ${new_status} — Festecart`
  const orderNum = (orderData.order_number as string) ?? '—'
  const statusLabel = new_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())

  const html = buildEmailBody(customerName, orderNum, statusLabel, new_status, orderData, invoice)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
  })

  const result = await res.json()
  console.log(`Email sent to ${email} for status ${new_status}:`, result)
  return new Response(JSON.stringify({ ok: res.ok, result, email_used: email }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
