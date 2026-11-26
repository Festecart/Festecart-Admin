'use strict'
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { setGlobalOptions } = require('firebase-functions/v2')
const { initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp, FieldPath, FieldValue } = require('firebase-admin/firestore')
const { getStorage } = require('firebase-admin/storage')
const PDFDocument = require('pdfkit')

const FUNCTION_REGION = 'us-central1'
const ACCOUNTS_CORS_ORIGINS = [
  'https://admin.festecart.org',
  'https://admin.festecart.com',
  'https://tempadmin.festecart.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
]
const firebaseApp = initializeApp()
const db = getFirestore(firebaseApp, 'festecart')
const adminAuth = getAuth(firebaseApp)
setGlobalOptions({ region: FUNCTION_REGION })

const LOGO_URL   = 'https://admin.festecart.org/logo.png'
const ADMIN_URL  = 'https://admin.festecart.org'
const ADMIN_EMAIL = 'festecartdesi@gmail.com'
const GOOGLE_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxnq3FedbLxZ1ficbJTFD1kEOufULtvDX8SaXes8uzzCuvPSsJETUCvKunPVaAgQ-4m/exec'
const UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID = '__unallocated_expense_payment__'
const PETTY_CASH_SPENDING_ACCOUNT_ID = '__petty_cash_spending__'
const FINANCIAL_PAYMENT_METHODS_CONFIG_ID = 'financial_expense_payment_methods'
const DEFAULT_FINANCIAL_PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer']
const FINANCIAL_INCOME_DRAFTS = 'financial_income_drafts'

const STORE_NAME    = 'festecart'
const STORE_ADDRESS = 'No-204 , 2nd Floor, Surya Prema Building, 1st Cross Rd, Manjunatha nagar, Raghuvanahalli, Bengaluru, Karnataka 560109'
const STORE_GSTIN   = '29AFFF S9227M1Z7'

// ── helpers ──────────────────────────────────────────────────────
function fmtInr(n) {
  return '\u20B9\u00a0' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function getCouponDiscount(order) {
  if (!order.coupon_code) return 0

  if (order.coupon_discount !== undefined && order.coupon_discount !== null && order.coupon_discount !== '') {
    var savedDiscount = Number(order.coupon_discount)
    if (Number.isFinite(savedDiscount)) return Math.max(0, savedDiscount)
  }

  var itemSubtotal = (order.items || []).reduce(function(sum, item) {
    return sum + Number(item.price || 0) * (item.quantity || 1)
  }, 0)
  var subtotal = Number(order.subtotal)
  if (!Number.isFinite(subtotal) || subtotal <= 0) subtotal = itemSubtotal

  var shipping = Number(order.shipping_charge || 0)
  var total = Number(order.total || 0)
  return Math.max(0, Math.round((subtotal + shipping - total + Number.EPSILON) * 100) / 100)
}

function numToWords(num) {
  var ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  function convert(n) {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '')
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '')
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '')
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '')
  }
  if (!num || num === 0) return 'Zero Rupees Only'
  return convert(Math.round(num)) + ' Rupees Only'
}

function todayStr() {
  var d = new Date()
  return d.getDate().toString().padStart(2, '0') + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getFullYear()
}


// ── generateInvoicePdf ───────────────────────────────────────────
// Returns a Buffer containing the PDF invoice matching the screenshot.
function generateInvoicePdf(order, logoImageBuffer) {
  return new Promise(function(resolve, reject) {
    var doc = new PDFDocument({ size: 'A4', margin: 40 })
    var chunks = []
    doc.on('data', function(c) { chunks.push(c) })
    doc.on('end', function() { resolve(Buffer.concat(chunks)) })
    doc.on('error', reject)

    var orderNum  = order.order_number || '—'
    var addr      = order.shipping_address || {}
    var items     = order.items || []
    var total     = Number(order.total || 0)
    var shipping  = Number(order.shipping_charge || 0)
    var subtotal  = items.reduce(function(s, i) { return s + Number(i.price || 0) * (i.quantity || 1) }, 0)
    var couponCode     = order.coupon_code || null
    var couponDiscount = getCouponDiscount(order)
    var otherDiscount = Math.max(0, Number(order.discount_amount || 0))
    var custEmail = order.customer_email || order.guest_email || ''
    var payment   = order.payment_method === 'cod' ? 'Cash on Delivery'
                  : order.payment_method === 'self_pickup' ? 'Self Pickup'
                  : (order.payment_method || '').toUpperCase()
    var W = 515  // usable width

    // ── Title ──
    doc.fontSize(14).font('Helvetica-Bold').text('INVOICE', { align: 'center' })
    doc.moveDown(0.3)

    // ── Logo + invoice meta (right side) ──
    // Logo fixed at top-left, invoice meta fixed at top-right
    var logoTopY = doc.y
    if (logoImageBuffer) {
      doc.image(logoImageBuffer, 40, logoTopY, { height: 48, fit: [140, 48] })
    } else {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#e04000').text('fest', 40, logoTopY, { continued: true })
      doc.fillColor('#2d7d46').text('e')
      doc.fillColor('#e04000').text('cart', { continued: false })
    }

    // Invoice meta always at fixed right position regardless of logo
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000')
    doc.text('Invoice Date: ', 370, logoTopY, { continued: true }).font('Helvetica').text(todayStr())
    doc.font('Helvetica-Bold').text('Invoice No: ', 370, logoTopY + 14, { continued: true }).font('Helvetica').text(orderNum)

    // Move cursor below the logo+meta block
    doc.y = logoTopY + 54
    doc.moveDown(0.3)

    // ── Store name + address (below logo) ──
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#000').text(STORE_NAME, 40)
    doc.fontSize(8).font('Helvetica').fillColor('#000').text(STORE_ADDRESS, 40, doc.y, { width: 280 })
    doc.moveDown(0.5)

    // ── Divider ──
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#999').lineWidth(0.5).stroke()
    doc.moveDown(0.5)

    // ── Address columns + order meta ──
    var rowY = doc.y
    var addressColumns = {
      shipping: { x: 40, width: 145 },
      billing: { x: 205, width: 145 },
      order: { x: 390, width: 165 },
    }

    function addressLines(address) {
      if (typeof address === 'string') {
        return address.split(/\r?\n/).map(function(line) { return line.trim() }).filter(Boolean)
      }
      if (!address || typeof address !== 'object') return []

      var lines = [address.name, address.address].filter(function(line) {
        return typeof line === 'string' && line.trim()
      }).map(function(line) { return line.trim() })
      var locality = [address.city, address.state].filter(function(value) {
        return typeof value === 'string' && value.trim()
      }).map(function(value) { return value.trim() }).join(', ')
      var location = [locality, 'India'].filter(Boolean).join(', ')
      if (address.pincode) location += ' - ' + address.pincode
      if (location) lines.push(location)
      if (typeof address.phone === 'string' && address.phone.trim()) {
        lines.push('Phone: ' + address.phone.trim())
      }
      return lines
    }

    function drawAddressColumn(title, lines, column) {
      doc.fontSize(9).font('Helvetica-Bold').text(title, column.x, rowY, { width: column.width })
      var y = doc.y + 2
      doc.fontSize(8).font('Helvetica')
      lines.forEach(function(line) {
        doc.text(line, column.x, y, { width: column.width, lineGap: 1 })
        y = doc.y + 1
      })
      return y
    }

    var shippingLines = addressLines(addr)
    var billingLines = addressLines(order.billing_address)
    if (!billingLines.length) billingLines = shippingLines
    var shippingEndY = drawAddressColumn('Shipping Address', shippingLines, addressColumns.shipping)
    var billingEndY = drawAddressColumn('Billing Address', billingLines, addressColumns.billing)

    function drawOrderMeta(label, value, y) {
      doc.fontSize(8).font('Helvetica-Bold')
        .text(label + ' ', addressColumns.order.x, y, {
          width: addressColumns.order.width,
          continued: true,
        })
        .font('Helvetica')
        .text(value || '—', { width: addressColumns.order.width })
      return doc.y + 2
    }

    var orderMetaY = rowY
    orderMetaY = drawOrderMeta('Order Date:', todayStr(), orderMetaY)
    orderMetaY = drawOrderMeta('Order No.:', orderNum, orderMetaY)
    orderMetaY = drawOrderMeta('Email:', custEmail, orderMetaY)

    doc.y = Math.max(shippingEndY, billingEndY, orderMetaY) + 8

    // ── Items table ──
    var tableTop = doc.y
    var col = { item: 40, qty: 310, origPrice: 365, sellPrice: 430, total: 490 }
    var rowH = 14

    // Header
    doc.rect(40, tableTop, W, rowH).fillAndStroke('#f5f5f5', '#ccc')
    doc.fillColor('#000').fontSize(8).font('Helvetica-Bold')
    doc.text('Item', col.item + 2, tableTop + 3)
    doc.text('Quantity', col.qty, tableTop + 3)
    doc.text('Original Price', col.origPrice, tableTop + 3)
    doc.text('Selling Price', col.sellPrice, tableTop + 3)
    doc.text('Total', col.total, tableTop + 3)

    var y = tableTop + rowH
    items.forEach(function(i) {
      var price   = Number(i.price || 0)
      var origPrice = Number(i.compare_at_price || price)
      var qty     = i.quantity || 1
      var lineTotal = price * qty
      var h = 28

      doc.rect(40, y, W, h).stroke('#ddd')
      doc.fillColor('#000').fontSize(8).font('Helvetica-Bold')
      doc.text(i.name || '—', col.item + 2, y + 3, { width: 260 })
      doc.fontSize(7).font('Helvetica').fillColor('#555').text('HSN: 1010', col.item + 2, y + 14)
      doc.fillColor('#000').fontSize(8).font('Helvetica')
      doc.text(String(qty), col.qty, y + 8)
      doc.text(origPrice.toFixed(2), col.origPrice, y + 8)
      doc.text(price.toFixed(2), col.sellPrice, y + 8)
      doc.text(lineTotal.toFixed(2), col.total, y + 8)
      y += h
    })

    // ── Totals ──
    doc.rect(40, y, W, rowH).fillAndStroke('#f9f9f9', '#ddd')
    doc.fillColor('#000').fontSize(8).font('Helvetica-Bold')
    doc.text('Subtotal:', 390, y + 3)
    doc.font('Helvetica').text(subtotal.toFixed(2), col.total, y + 3)
    y += rowH

    // Shipping charge row
    if (shipping > 0) {
      doc.rect(40, y, W, rowH).fillAndStroke('#ffffff', '#ddd')
      doc.fillColor('#000').fontSize(8).font('Helvetica-Bold').text('Shipping:', 390, y + 3)
      doc.font('Helvetica').text(shipping.toFixed(2), col.total, y + 3)
      y += rowH
    } else {
      doc.rect(40, y, W, rowH).fillAndStroke('#ffffff', '#ddd')
      doc.fillColor('#000').fontSize(8).font('Helvetica-Bold').text('Shipping:', 390, y + 3)
      doc.font('Helvetica').fillColor('#16a34a').text('Free', col.total, y + 3)
      doc.fillColor('#000')
      y += rowH
    }

    doc.moveTo(40, y).lineTo(555, y).strokeColor('#ddd').stroke()
    y += 8

    // Coupon discount row
    if (couponCode && couponDiscount > 0) {
      doc.rect(40, y, W, rowH).fillAndStroke('#f0fff4', '#ddd')
      doc.fillColor('#16a34a').fontSize(8).font('Helvetica-Bold').text('Coupon (' + couponCode + '):', 390, y + 3)
      doc.font('Helvetica').text('-' + couponDiscount.toFixed(2), col.total, y + 3)
      doc.fillColor('#000')
      y += rowH
    }
    if (otherDiscount > 0) {
      doc.rect(40, y, W, rowH).fillAndStroke('#f0fff4', '#ddd')
      doc.fillColor('#16a34a').fontSize(8).font('Helvetica-Bold').text('Discount:', 390, y + 3)
      doc.font('Helvetica').text('-' + otherDiscount.toFixed(2), col.total, y + 3)
      doc.fillColor('#000')
      y += rowH
    }

    // In words
    doc.fontSize(8).font('Helvetica-Bold').text('In words: ', 40, y, { continued: true })
    doc.font('Helvetica').fillColor('#333').text(numToWords(total))
    y += 16

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text('Total:', 390, y)
    doc.text(total.toFixed(2), col.total, y)
    y += 20

    doc.moveTo(40, y).lineTo(555, y).strokeColor('#ddd').stroke()
    y += 8

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text('Mode of Payment : ', 40, y, { continued: true })
    doc.font('Helvetica').text(payment)

    // ── Footer ──
    doc.fontSize(7).fillColor('#666')
    doc.text('This is a computer generated invoice, no signature is required.', 40, 760)
    
    doc.moveTo(40, 758).lineTo(555, 758).strokeColor('#ccc').stroke()

    doc.end()
  })
}


// ── buildAdminOrderEmail ─────────────────────────────────────────
function buildAdminOrderEmail(order, linkHref) {
  var orderNum  = order.order_number || '—'
  var addr      = order.shipping_address || null
  var items     = order.items || []
  var total     = Number(order.total || 0)
  var shipping  = Number(order.shipping_charge || 0)
  var custName  = order.guest_name || (addr && addr.name) || 'Customer'
  var custEmail = order.customer_email || order.guest_email || ''
  var phone     = order.guest_phone || (addr && addr.phone) || ''
  var payment   = order.payment_method === 'self_pickup' ? 'Self Pickup'
                : order.payment_method === 'cod' ? 'Cash on Delivery'
                : (order.payment_method || '').toUpperCase()
  var couponCode     = order.coupon_code || null
  var couponDiscount = getCouponDiscount(order)
  var addrName   = (addr && addr.name) || custName
  var addrStreet = (addr && addr.address) || ''
  var addrCity   = (addr && addr.city) || ''
  var addrState  = (addr && addr.state) || ''
  var addrPin    = (addr && addr.pincode) || ''

  function addrCol(title, border) {
    return '<td width="50%" style="padding:14px 16px;vertical-align:top;' + (border ? 'border-right:1px solid #d9d9d9;' : '') + '">'
      + '<p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#000;">' + title + '</p>'
      + '<p style="margin:0;font-size:13px;font-weight:bold;color:#111;">' + addrName + '</p>'
      + (addrStreet ? '<p style="margin:2px 0 0;font-size:12px;color:#444;">' + addrStreet + ' ,</p>' : '')
      + (addrCity ? '<p style="margin:2px 0 0;font-size:12px;color:#444;">' + addrCity + ', ' + addrState + ', India,</p>' : '')
      + (addrState ? '<p style="margin:2px 0 0;font-size:12px;color:#444;">' + addrState + ', India - ' + addrPin + '</p>' : '')
      + (phone ? '<p style="margin:10px 0 0;font-size:12px;color:#333;">&#128222; <a href="tel:' + phone + '" style="color:#333;text-decoration:none;">' + phone + '</a></p>' : '')
      + '</td>'
  }

  var itemRows = items.map(function(i) {
    var qty  = i.quantity || 1
    var price = Number(i.price || 0)
    var amt  = price * qty
    var img  = (i.image && i.image.indexOf('http') === 0)
      ? '<img src="' + i.image + '" width="72" height="72" style="width:72px;height:72px;object-fit:cover;display:block;border:1px solid #e0e0e0;" />'
      : '<div style="width:72px;height:72px;background:#f0f0f0;display:inline-block;border:1px solid #e0e0e0;"></div>'
    return '<tr>'
      + '<td style="padding:10px 8px;border:1px solid #d9d9d9;vertical-align:top;">'
      + '<table cellpadding="0" cellspacing="0" width="100%"><tr>'
      + '<td style="width:82px;vertical-align:top;padding-right:10px;">' + img + '</td>'
      + '<td style="vertical-align:top;">'
      + '<p style="margin:0;font-size:13px;font-weight:bold;color:#111;line-height:1.3;">' + (i.name || '—') + '</p>'
      + '<p style="margin:4px 0 0;font-size:12px;color:#555;">Price: &#8377; ' + price.toLocaleString('en-IN') + '</p>'
      + '<p style="margin:2px 0 0;font-size:12px;color:#555;">Qty: ' + qty + '</p>'
      + '</td></tr>'
      + '<tr><td colspan="2" style="padding-top:5px;font-size:11px;color:#999;">HSN: 0000 - CGST 0% - SGST 0%</td></tr>'
      + '</table></td>'
      + '<td style="padding:10px 8px;text-align:right;vertical-align:top;border:1px solid #d9d9d9;font-size:13px;color:#111;white-space:nowrap;">&#8377; ' + (price * qty).toLocaleString('en-IN') + '</td>'
      + '<td style="padding:10px 8px;text-align:center;vertical-align:top;border:1px solid #d9d9d9;font-size:12px;color:#555;white-space:nowrap;">&#8377; 0<br/>&#8377; 0</td>'
      + '<td style="padding:10px 8px;text-align:right;vertical-align:top;border:1px solid #d9d9d9;font-size:13px;font-weight:bold;color:#111;white-space:nowrap;">&#8377; ' + (price * qty).toLocaleString('en-IN') + '</td>'
      + '</tr>'
  }).join('')

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Order ' + orderNum + '</title></head>'
    + '<body style="margin:0;padding:24px;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111;max-width:680px;">'
    + '<p style="margin:0 0 6px;"><img src="' + LOGO_URL + '" alt="festecart" height="112" style="height:112px;display:inline-block;" /></p>'
    + '<hr style="border:none;border-top:2px solid #ddd;margin:0 0 20px;" />'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #d9d9d9;">'
    + '<tr><td style="padding:12px 14px;border-bottom:1px solid #d9d9d9;">'
    + '<p style="margin:0;font-size:14px;font-weight:bold;color:#111;">&#128230; Order #' + orderNum + '</p>'
    + '</td></tr>'
    + '<tr><td style="padding:12px 14px;border-bottom:1px solid #d9d9d9;">'
    + '<p style="margin:0;font-size:14px;font-weight:bold;color:#111;">' + custName + '</p>'
    + (custEmail ? '<p style="margin:4px 0 0;font-size:13px;"><a href="mailto:' + custEmail + '" style="color:#1a56db;text-decoration:none;">&#9993; ' + custEmail + '</a></p>' : '')
    + (phone ? '<p style="margin:4px 0 0;font-size:13px;">&#128222; <a href="tel:' + phone + '" style="color:#333;text-decoration:none;">' + phone + '</a></p>' : '')
    + '</td></tr>'
    + '<tr><td style="padding:0;"><table width="100%" cellpadding="0" cellspacing="0"><tr>'
    + addrCol('Shipping Address', true) + addrCol('Billing Address', false)
    + '</tr></table></td></tr></table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:24px;">'
    + '<thead><tr>'
    + '<th style="padding:9px 8px;text-align:left;border:1px solid #d9d9d9;font-size:12px;color:#666;font-weight:normal;background:#fafafa;">Item</th>'
    + '<th style="padding:9px 8px;text-align:right;border:1px solid #d9d9d9;font-size:12px;color:#666;font-weight:normal;background:#fafafa;white-space:nowrap;">Taxable</th>'
    + '<th style="padding:9px 8px;text-align:center;border:1px solid #d9d9d9;font-size:12px;color:#666;font-weight:normal;background:#fafafa;white-space:nowrap;">CGST &amp;<br/>SGST</th>'
    + '<th style="padding:9px 8px;text-align:right;border:1px solid #d9d9d9;font-size:12px;color:#666;font-weight:normal;background:#fafafa;">Total</th>'
    + '</tr></thead><tbody>' + itemRows
    + '<tr><td colspan="3" style="padding:10px 8px;text-align:right;border:1px solid #d9d9d9;font-size:13px;font-weight:bold;color:#111;">'
    + 'Shipping<br/><span style="font-size:11px;font-weight:normal;color:#888;">(' + (shipping === 0 ? 'Self Pickup' : payment) + ')</span>'
    + '</td><td style="padding:10px 8px;text-align:right;border:1px solid #d9d9d9;font-size:13px;color:#444;">' + (shipping === 0 ? '-' : fmtInr(shipping)) + '</td></tr>'
    + (couponCode && couponDiscount > 0
        ? '<tr><td colspan="3" style="padding:10px 8px;text-align:right;border:1px solid #d9d9d9;font-size:13px;font-weight:bold;color:#16a34a;">Coupon (' + couponCode + ')</td>'
          + '<td style="padding:10px 8px;text-align:right;border:1px solid #d9d9d9;font-size:13px;font-weight:bold;color:#16a34a;">-&#8377; ' + couponDiscount.toLocaleString('en-IN') + '</td></tr>'
        : '')
    + '<tr><td colspan="3" style="padding:10px 8px;text-align:right;border:1px solid #d9d9d9;font-size:13px;font-weight:bold;color:#111;">Grand Total</td>'
    + '<td style="padding:10px 8px;text-align:right;border:1px solid #d9d9d9;font-size:13px;font-weight:bold;color:#111;">&#8377;<br/>' + total.toLocaleString('en-IN') + '</td></tr>'
    + '</tbody></table>'
    + '<p style="margin:14px 0 0;font-size:13px;color:#333;"><a href="' + linkHref + '" style="color:#1a56db;text-decoration:underline;">Click</a> to check order details.</p>'
    + '<hr style="border:none;border-top:1px solid #ddd;margin:28px 0 14px;" />'
    + '<p style="margin:0;font-size:11px;color:#999;text-align:center;">&#169; 2026 festecart. All Rights Reserved.</p>'
    + '</body></html>'
}

// ── buildCustomerConfirmationEmail ───────────────────────────────
// Simple "order confirmed" HTML for the customer. The PDF invoice
// is sent as an attachment so this body stays lightweight.
function buildCustomerConfirmationEmail(order) {
  var orderNum  = order.order_number || '—'
  var custName  = order.guest_name || (order.shipping_address && order.shipping_address.name) || 'Customer'
  var total     = Number(order.total || 0)
  var shipping  = Number(order.shipping_charge || 0)
  var subtotal  = (order.items || []).reduce(function(s, i) { return s + Number(i.price || 0) * (i.quantity || 1) }, 0)
  var payment   = order.payment_method === 'self_pickup' ? 'Self Pickup'
                : order.payment_method === 'cod' ? 'Cash on Delivery'
                : (order.payment_method || '').toUpperCase()
  var items          = order.items || []
  var couponCode     = order.coupon_code || null
  var couponDiscount = getCouponDiscount(order)

  var itemRows = items.map(function(i) {
    var qty  = i.quantity || 1
    var price = Number(i.price || 0)
    var img  = (i.image && i.image.indexOf('http') === 0)
      ? '<img src="' + i.image + '" width="56" height="56" style="width:56px;height:56px;object-fit:cover;border-radius:6px;display:block;" />'
      : '<div style="width:56px;height:56px;background:#f3f4f6;border-radius:6px;"></div>'
    return '<tr>'
      + '<td style="padding:12px 0;border-bottom:1px solid #f0f0f0;vertical-align:middle;">'
      + '<table cellpadding="0" cellspacing="0"><tr>'
      + '<td style="padding-right:14px;vertical-align:middle;">' + img + '</td>'
      + '<td style="vertical-align:middle;">'
      + '<p style="margin:0;font-size:14px;font-weight:600;color:#111;">' + (i.name || '—') + '</p>'
      + '<p style="margin:3px 0 0;font-size:12px;color:#777;">Qty: ' + qty + ' &nbsp;&bull;&nbsp; &#8377; ' + price.toLocaleString('en-IN') + ' each</p>'
      + '</td></tr></table></td>'
      + '<td style="padding:12px 0 12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:middle;font-size:14px;font-weight:600;color:#111;white-space:nowrap;">&#8377; ' + (price * qty).toLocaleString('en-IN') + '</td>'
      + '</tr>'
  }).join('')

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Order Confirmed</title></head>'
    + '<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">'
    + '<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;">'
    + '<tr><td style="background:#ffffff;padding:20px 32px 16px;text-align:center;border-bottom:1px solid #e8e8e8;">'
    + '<img src="' + LOGO_URL + '" alt="Festecart" height="144" style="height:144px;" />'
    + '</td></tr>'
    + '<tr><td style="padding:32px 32px 24px;">'
    + '<p style="margin:0 0 4px;font-size:22px;font-weight:bold;color:#1a1a2e;">Thank you for your order! &#127881;</p>'
    + '<p style="margin:0 0 24px;font-size:14px;color:#555;">Hi ' + custName + ', your order has been confirmed. Your invoice is attached as a PDF.</p>'
    + '<div style="background:#f8f9ff;border:1px solid #e0e4ff;border-radius:8px;padding:14px 18px;margin-bottom:24px;text-align:center;">'
    + '<p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Order Number</p>'
    + '<p style="margin:4px 0 0;font-size:20px;font-weight:bold;color:#1a1a2e;">#' + orderNum + '</p>'
    + '</div>'
    + '<p style="margin:0 0 12px;font-size:14px;font-weight:bold;color:#1a1a2e;">Items Ordered</p>'
    + '<table width="100%" cellpadding="0" cellspacing="0">' + itemRows + '</table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:13px;">'
    + '<tr><td colspan="2" style="border-top:1px solid #eee;padding-top:6px;"></td></tr>'
    + '<tr><td style="padding:5px 0;color:#555;">Subtotal</td><td style="text-align:right;color:#111;">&#8377; ' + subtotal.toLocaleString('en-IN') + '</td></tr>'
    + (shipping > 0
        ? '<tr><td style="padding:5px 0;color:#555;">Shipping</td><td style="text-align:right;color:#111;">&#8377; ' + shipping.toLocaleString('en-IN') + '</td></tr>'
        : '<tr><td style="padding:5px 0;color:#555;">Shipping</td><td style="text-align:right;color:#16a34a;font-weight:600;">Free</td></tr>')
    + (couponCode && couponDiscount > 0
        ? '<tr><td style="padding:5px 0;color:#16a34a;">Coupon (' + couponCode + ')</td><td style="text-align:right;color:#16a34a;font-weight:600;">-&#8377; ' + couponDiscount.toLocaleString('en-IN') + '</td></tr>'
        : '')
    + '<tr><td style="padding:5px 0;font-weight:bold;font-size:15px;color:#1a1a2e;">Grand Total</td>'
    + '<td style="text-align:right;font-weight:bold;font-size:15px;color:#1a1a2e;">&#8377; ' + total.toLocaleString('en-IN') + '</td></tr>'
    + '</table>'
    + (order.shipping_address
        ? '<div style="margin-top:20px;padding:14px 16px;background:#f8f9ff;border-radius:8px;border:1px solid #e0e4ff;">'
          + '<p style="margin:0 0 6px;font-size:12px;font-weight:bold;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Delivery Address</p>'
          + '<p style="margin:0;font-size:13px;font-weight:600;color:#111;">' + (order.shipping_address.name || '') + '</p>'
          + (order.shipping_address.phone ? '<p style="margin:3px 0 0;font-size:12px;color:#555;">&#128222; <a href="tel:' + order.shipping_address.phone + '" style="color:#555;text-decoration:none;">' + order.shipping_address.phone + '</a></p>' : '')
          + (order.shipping_address.address ? '<p style="margin:3px 0 0;font-size:12px;color:#555;">' + order.shipping_address.address + '</p>' : '')
          + ((order.shipping_address.city || order.shipping_address.state) ? '<p style="margin:2px 0 0;font-size:12px;color:#555;">' + [order.shipping_address.city, order.shipping_address.state, 'India'].filter(Boolean).join(', ') + '</p>' : '')
          + (order.shipping_address.pincode ? '<p style="margin:2px 0 0;font-size:12px;color:#555;">PIN: ' + order.shipping_address.pincode + '</p>' : '')
          + '</div>'
        : '')
    + '</td></tr>'
    + '<tr><td style="background:#f8f9ff;padding:18px 32px;border-top:1px solid #e8e8e8;text-align:center;">'
    + '<p style="margin:0;font-size:11px;color:#999;">&#169; 2026 festecart. All Rights Reserved.</p>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>'
}


async function sendEmailsViaAppsScript(order, invoicePdfBase64, updateType) {
  var token = process.env.GOOGLE_APPS_SCRIPT_TOKEN
  if (!token) {
    throw new Error('Google Apps Script email token is missing. Configure the GOOGLE_APPS_SCRIPT_TOKEN secret.')
  }

  var response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token, order: order, invoicePdfBase64: invoicePdfBase64, updateType: updateType || 'confirmed' }),
  })
  var result = await response.json().catch(function() { return null })
  if (!response.ok || !result || result.ok !== true) {
    throw new Error('Google Apps Script email delivery failed: ' + (result && result.error || response.statusText || 'Invalid response'))
  }
  return result
}


// ── doSendEmail ──────────────────────────────────────────────────
// Sends order confirmation emails and revised-invoice emails after item cancellation.
async function doSendEmail(order, new_status) {
  var isItemsCancelled = new_status === 'items_cancelled'
  if (new_status !== 'confirmed' && !isItemsCancelled) {
    console.log('[email] status "' + new_status + '" — no email sent')
    return { skipped: true }
  }

  var customerEmail = order.customer_email || order.guest_email || null
  if (isItemsCancelled && !customerEmail) {
    throw new Error('Cannot send updated invoice: no customer email is available')
  }
  var invoicePdfBase64 = null

  // ── 2. Customer confirmation (with PDF invoice) ──────────────
  if (customerEmail && customerEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    // Fetch logo for PDF
    var logoImageBuffer = null
    try {
      var logoRes = await fetch(LOGO_URL)
      if (logoRes.ok) {
        var ab = await logoRes.arrayBuffer()
        logoImageBuffer = Buffer.from(ab)
      }
    } catch (logoErr) {
      console.warn('[email] could not fetch logo for PDF:', logoErr.message)
    }

    // Generate PDF invoice
    var pdfBase64 = null
    try {
      var pdfBuffer = await generateInvoicePdf(order, logoImageBuffer)
      pdfBase64 = pdfBuffer.toString('base64')
    } catch (pdfErr) {
      console.warn('[email] PDF generation failed:', pdfErr.message)
      if (isItemsCancelled) throw new Error('Updated invoice PDF generation failed: ' + pdfErr.message)
    }

    invoicePdfBase64 = pdfBase64
  }

  if (isItemsCancelled && !invoicePdfBase64) {
    throw new Error('Updated invoice PDF could not be generated')
  }
  return await sendEmailsViaAppsScript(order, invoicePdfBase64, isItemsCancelled ? 'items_cancelled' : 'confirmed')
}

// ── HTTP endpoint ────────────────────────────────────────────────
exports.sendOrderEmail = onRequest({ cors: true, secrets: ['GOOGLE_APPS_SCRIPT_TOKEN'] }, async function(req, res) {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.status(204).send('')
    return
  }
  res.set('Access-Control-Allow-Origin', '*')
  try {
    var body = req.body
    if (!body.order || !body.new_status) {
      res.status(400).json({ ok: false, reason: 'Missing order or new_status' })
      return
    }
    var result = await doSendEmail(body.order, body.new_status)
    res.status(200).json({ ok: true, result: result })
  } catch (e) {
    console.error('[email] HTTP error:', e)
    res.status(500).json({ ok: false, error: e.message })
  }
})

function requireSuperAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in as an administrator.')
  return db.collection('user_roles').doc(request.auth.uid).get().then(function(roleSnap) {
    const roleData = roleSnap.exists ? roleSnap.data() : null
    const isSuperAdmin = roleData && (
      roleData.role === 'super_admin' ||
      (Array.isArray(roleData.roles) && roleData.roles.includes('super_admin'))
    )
    if (!isSuperAdmin) {
      throw new HttpsError('permission-denied', 'Only a super admin can create affiliate coupons.')
    }
  })
}

function getAccountsRoleFlags(roleData) {
  const roles = roleData && Array.isArray(roleData.roles) ? roleData.roles : []
  const role = roleData && typeof roleData.role === 'string' ? roleData.role : ''
  return {
    accountsAdmin: role === 'admin' || role === 'super_admin' ||
      roles.includes('admin') || roles.includes('super_admin'),
    accountsSuperAdmin: role === 'super_admin' || roles.includes('super_admin'),
  }
}

async function setAccountsAdminClaims(uid, roleData) {
  const user = await adminAuth.getUser(uid)
  const claims = Object.assign({}, user.customClaims || {})
  const flags = getAccountsRoleFlags(roleData)
  if (flags.accountsAdmin) claims.accounts_admin = true
  else delete claims.accounts_admin
  if (flags.accountsSuperAdmin) claims.accounts_super_admin = true
  else delete claims.accounts_super_admin
  await adminAuth.setCustomUserClaims(uid, claims)
  return flags
}

exports.syncAccountsAdminClaims = onDocumentWritten(
  { document: 'user_roles/{uid}', database: 'festecart', region: 'asia-south1' },
  async function(event) {
    const uid = event.params.uid
    const roleData = event.data && event.data.after.exists ? event.data.after.data() : null
    try {
      await setAccountsAdminClaims(uid, roleData)
    } catch (error) {
      if (error && error.code === 'auth/user-not-found') return
      console.error('[accounts] Could not sync admin claims:', error)
      throw error
    }
  },
)

exports.refreshAccountsAdminClaims = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in with an admin account.')
  const roleSnapshot = await db.collection('user_roles').doc(request.auth.uid).get()
  const roleData = roleSnapshot.exists ? roleSnapshot.data() : null
  const flags = getAccountsRoleFlags(roleData)
  if (!flags.accountsAdmin) {
    throw new HttpsError('permission-denied', 'Accounts access is limited to admin and super-admin users.')
  }
  await setAccountsAdminClaims(request.auth.uid, roleData)
  return { accountsAdmin: true }
})

exports.attachFinancialTransactionReceipt = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const transactionId = requireRecordId(request.data && request.data.transaction_id, 'Income record ID')
  const storagePath = request.data && typeof request.data.storage_path === 'string'
    ? request.data.storage_path
    : ''
  const pathParts = storagePath.split('/')
  const validFileName = /^[A-Za-z0-9-]{36}\.(pdf|jpeg|png|webp)$/i.test(pathParts[3] || '')
  if (
    pathParts.length !== 4 ||
    pathParts[0] !== 'financial-receipts' ||
    pathParts[1] !== actor.uid ||
    pathParts[2] !== transactionId ||
    !validFileName
  ) {
    throw new HttpsError('invalid-argument', 'The income receipt path is invalid.')
  }
  const file = getStorage(firebaseApp).bucket().file(storagePath)
  const [fileExists] = await file.exists()
  if (!fileExists) throw new HttpsError('not-found', 'The uploaded income receipt was not found.')
  const [metadata] = await file.getMetadata()
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (
    !allowedTypes.includes(metadata.contentType) ||
    !Number.isSafeInteger(Number(metadata.size)) ||
    Number(metadata.size) <= 0 ||
    Number(metadata.size) >= 10 * 1024 * 1024
  ) {
    throw new HttpsError('failed-precondition', 'The uploaded income receipt is not a valid file.')
  }

  const transactionRef = db.collection('financial_transactions').doc(transactionId)
  const now = Timestamp.now()
  await db.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(transactionRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'The income record no longer exists.')
    const current = snapshot.data()
    if (!current || current.type !== 'income' || current.is_deleted === true) {
      throw new HttpsError('failed-precondition', 'A receipt can only be attached to an active income record.')
    }
    transaction.update(transactionRef, {
      receipt_paths: FieldValue.arrayUnion(storagePath),
      updated_by: actor.uid,
      updated_by_name: actor.name,
      updated_at: now,
      audit: FieldValue.arrayUnion({
        action: 'receipt_attached',
        storage_path: storagePath,
        admin_user_id: actor.uid,
        created_at: now,
      }),
    })
  })
  return { success: true }
})

exports.getFinancialReceiptDownloadUrl = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in with an admin account.')
  const roleSnapshot = await db.collection('user_roles').doc(request.auth.uid).get()
  const roleData = roleSnapshot.exists ? roleSnapshot.data() : null
  if (!getAccountsRoleFlags(roleData).accountsAdmin) {
    throw new HttpsError('permission-denied', 'Only admin and super-admin users can access financial receipts.')
  }
  const path = request.data && typeof request.data.path === 'string' ? request.data.path : ''
  const parts = path.split('/')
  if (parts.length !== 4 || parts[0] !== 'financial-receipts' || !parts[1] || !parts[2] || !parts[3]) {
    throw new HttpsError('invalid-argument', 'The receipt path is invalid.')
  }
  const [expenseSnapshot, transactionSnapshot] = await Promise.all([
    db.collection('financial_expenses').doc(parts[2]).get(),
    db.collection('financial_transactions').doc(parts[2]).get(),
  ])
  const expensePaths = expenseSnapshot.exists && Array.isArray(expenseSnapshot.data().receipt_paths)
    ? expenseSnapshot.data().receipt_paths
    : []
  const transactionPaths = transactionSnapshot.exists && Array.isArray(transactionSnapshot.data().receipt_paths)
    ? transactionSnapshot.data().receipt_paths
    : []
  if (!expensePaths.includes(path) && !transactionPaths.includes(path)) {
    throw new HttpsError('not-found', 'This receipt is not attached to a financial record.')
  }
  const file = getStorage(firebaseApp).bucket().file(path)
  const [exists] = await file.exists()
  if (!exists) throw new HttpsError('not-found', 'The receipt file was not found.')
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + 5 * 60 * 1000,
  })
  return { url }
})

async function requireAccountsAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in with an admin account.')
  const roleSnapshot = await db.collection('user_roles').doc(request.auth.uid).get()
  if (!getAccountsRoleFlags(roleSnapshot.exists ? roleSnapshot.data() : null).accountsAdmin) {
    throw new HttpsError('permission-denied', 'Accounts changes are limited to admin and super-admin users.')
  }
  return {
    uid: request.auth.uid,
    name: request.auth.token.name || request.auth.token.email || request.auth.uid,
  }
}

function requireRecordId(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('/') || value.length > 200) {
    throw new HttpsError('invalid-argument', `${label} is invalid.`)
  }
  return value.trim()
}

function requireText(value, label, maxLength, allowEmpty) {
  const text = typeof value === 'string' ? value.trim() : ''
  if ((!allowEmpty && !text) || text.length > maxLength) {
    throw new HttpsError('invalid-argument', `${label} must contain ${allowEmpty ? 'at most' : '1–'}${maxLength} characters.`)
  }
  return text
}

function requirePaise(value, label, allowZero) {
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) {
    throw new HttpsError('invalid-argument', `${label} must be a valid ${allowZero ? 'non-negative' : 'positive'} paise amount.`)
  }
  return value
}

function requireFestivalTag(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) {
    throw new HttpsError('invalid-argument', 'Festival tags must contain 1–80 characters.')
  }
  return value.trim()
}

function requireFestivalTagId(value, festivalTag) {
  if (value == null || value === '') {
    return festivalTag ? festivalTag.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : null
  }
  if (typeof value !== 'string' || !value.trim() || value.includes('/') || value.length > 200) {
    throw new HttpsError('invalid-argument', 'Festival tag ID is invalid.')
  }
  if (!festivalTag) throw new HttpsError('invalid-argument', 'A festival tag name is required when a tag ID is selected.')
  return value.trim()
}

function requireDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpsError('invalid-argument', `${label} is invalid.`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpsError('invalid-argument', `${label} is invalid.`)
  }
  return Timestamp.fromDate(date)
}

function positiveStoredPaise(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new HttpsError('failed-precondition', `The stored ${label} is invalid; ask an administrator to review this record.`)
  }
  return value
}

function addTransactionPosting(deltas, record, direction) {
  if (record.posting_status === 'unposted' ||
    record.is_petty_cash_spending === true ||
    record.is_unallocated_expense_payment === true) return
  const amount = positiveStoredPaise(record.amount_paise, 'transaction amount')
  const accountId = requireRecordId(record.account_id, 'Transaction account')
  if (record.type === 'income') {
    deltas.set(accountId, (deltas.get(accountId) || 0) + direction * amount)
  } else if (record.type === 'expense') {
    deltas.set(accountId, (deltas.get(accountId) || 0) - direction * amount)
  } else if (record.type === 'transfer') {
    const destinationId = requireRecordId(record.transfer_to_account_id, 'Transfer destination')
    if (accountId === destinationId) throw new HttpsError('failed-precondition', 'The transfer accounts are invalid.')
    deltas.set(accountId, (deltas.get(accountId) || 0) - direction * amount)
    deltas.set(destinationId, (deltas.get(destinationId) || 0) + direction * amount)
  } else {
    throw new HttpsError('failed-precondition', 'Opening balances cannot be edited or deleted as transactions.')
  }
}

async function applyAccountDeltas(transaction, deltas, actor, now) {
  const entries = Array.from(deltas.entries()).filter(([, delta]) => delta !== 0)
  const refs = entries.map(([accountId]) => db.collection('financial_accounts').doc(accountId))
  const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
  const updates = snapshots.map(function(snapshot, index) {
    if (!snapshot.exists) throw new HttpsError('not-found', 'A linked financial account no longer exists.')
    const account = snapshot.data()
    const currentBalance = account && account.balance_paise
    if (!Number.isSafeInteger(currentBalance) || currentBalance < 0) {
      throw new HttpsError('failed-precondition', 'A linked account has an invalid balance.')
    }
    const nextBalance = currentBalance + entries[index][1]
    if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
      throw new HttpsError('failed-precondition', 'This change would make an account balance negative or invalid.')
    }
    return { ref: refs[index], balance: nextBalance }
  })
  for (const update of updates) {
    transaction.update(update.ref, {
      balance_paise: update.balance,
      updated_by: actor.uid,
      updated_at: now,
    })
  }
}

function orderPaidPaise(order) {
  const total = Math.round(Number(order.total ?? 0) * 100)
  const paid = order.amount_paid == null && order.payment_status === 'paid'
    ? total
    : Math.round(Number(order.amount_paid ?? 0) * 100)
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(paid) || paid < 0 || paid > total) {
    throw new HttpsError('failed-precondition', 'The linked order has an invalid payment balance.')
  }
  return { total, paid }
}

function orderPaymentStatus(paid, total) {
  return paid >= total ? 'paid' : paid > 0 ? 'partially_paid' : 'pending'
}

function expensePaymentStatus(paid, total) {
  return paid === 0 ? 'unpaid' : paid >= total ? 'paid' : 'partially_paid'
}

function approvedFinancialPaymentMethods(config) {
  const customMethods = config && Array.isArray(config.custom_methods)
    ? config.custom_methods.filter(method => typeof method === 'string').map(method => method.trim()).filter(Boolean)
    : []
  return [...DEFAULT_FINANCIAL_PAYMENT_METHODS, ...customMethods]
}

function assertApprovedFinancialPaymentMethod(method, config, allowEmpty) {
  if (!method && allowEmpty) return
  if (!approvedFinancialPaymentMethods(config).includes(method)) {
    throw new HttpsError('invalid-argument', 'Choose Cash, UPI, Bank Transfer or a saved custom payment method.')
  }
}

function normalizeIncomeInput(input, allowIncomplete, allowEmptyPaymentMethod = false) {
  if (!input || typeof input !== 'object') throw new HttpsError('invalid-argument', 'Income details are required.')
  const amount = input.amount_paise == null || input.amount_paise === ''
    ? null
    : requirePaise(input.amount_paise, 'Income amount', false)
  const transactionDate = input.transaction_date == null || input.transaction_date === ''
    ? null
    : requireDate(input.transaction_date, 'Income date')
  const paymentMethod = requireText(input.payment_method, 'Payment method', 80, true)
  if (!allowIncomplete && amount == null) throw new HttpsError('invalid-argument', 'Enter an amount to confirm this income.')
  if (!allowIncomplete && transactionDate == null) throw new HttpsError('invalid-argument', 'Choose an income date to confirm this income.')
  if (!allowIncomplete && !allowEmptyPaymentMethod && !paymentMethod) {
    throw new HttpsError('invalid-argument', 'Choose a payment method to confirm this income.')
  }
  const festivalTag = requireFestivalTag(input.festival_tag)
  const festivalTagId = requireFestivalTagId(input.festival_tag_id, festivalTag)
  return {
    amount_paise: amount,
    transaction_date: transactionDate,
    festival_tag: festivalTag,
    festival_tag_id: festivalTagId,
    category_name: requireText(input.category_name, 'Category', 80, true),
    description: requireText(input.description, 'Description', 250, true),
    payment_method: paymentMethod,
    vendor_name: requireText(input.vendor_name, 'Vendor', 120, true),
    reference_no: requireText(input.reference_no, 'Reference number', 200, true),
    source_of_income: requireText(input.source_of_income, 'Source of income', 120, true),
  }
}

function resolveConfiguredFestivalTag(tagId, suppliedName, config) {
  if (!tagId) return null
  const data = config || {}
  const tagNames = data.tag_names && typeof data.tag_names === 'object' ? data.tag_names : {}
  const customTags = data.custom_tags && typeof data.custom_tags === 'object' ? data.custom_tags : {}
  const configuredName = customTags[tagId] || tagNames[tagId]
  if (typeof configuredName !== 'string' || !configuredName.trim()) {
    throw new HttpsError('failed-precondition', 'Please select a tag created in Accounts → Tags.')
  }
  if (suppliedName && suppliedName.trim().toLocaleLowerCase() !== configuredName.trim().toLocaleLowerCase()) {
    throw new HttpsError('invalid-argument', 'The selected tag does not match the saved tag.')
  }
  return configuredName.trim()
}

exports.createUnpostedFinancialIncome = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const data = request.data && typeof request.data === 'object' ? request.data : {}
  const input = normalizeIncomeInput(data.input, false, true)
  const idempotencyKey = requireText(data.idempotency_key, 'Income idempotency key', 120, false)
  if (!/^[A-Za-z0-9_-]+$/.test(idempotencyKey)) {
    throw new HttpsError('invalid-argument', 'The income idempotency key is invalid.')
  }
  const transactionRef = db.collection('financial_transactions').doc(`income_${idempotencyKey}`)
  const paymentConfigRef = db.collection('site_config').doc(FINANCIAL_PAYMENT_METHODS_CONFIG_ID)
  const tagConfigRef = db.collection('site_config').doc('financial_festivals')
  const duplicateReferenceQuery = input.reference_no
    ? db.collection('financial_transactions').where('reference_no', '==', input.reference_no)
    : null
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const [existingSnapshot, paymentConfigSnapshot, tagConfigSnapshot, duplicateReferences] = await Promise.all([
      transaction.get(transactionRef),
      transaction.get(paymentConfigRef),
      transaction.get(tagConfigRef),
      duplicateReferenceQuery ? transaction.get(duplicateReferenceQuery) : Promise.resolve(null),
    ])
    if (existingSnapshot.exists) {
      if (existingSnapshot.data().type === 'income' &&
        existingSnapshot.data().idempotency_key === idempotencyKey) return
      throw new HttpsError('already-exists', 'This income record has already been saved.')
    }
    if (duplicateReferences && !duplicateReferences.empty) {
      throw new HttpsError('already-exists', 'That reference is already used by an existing financial transaction.')
    }

    const paymentConfig = paymentConfigSnapshot.exists ? paymentConfigSnapshot.data() : {}
    assertApprovedFinancialPaymentMethod(input.payment_method, paymentConfig, true)
    const tagConfig = tagConfigSnapshot.exists ? tagConfigSnapshot.data() : {}
    const festivalTag = resolveConfiguredFestivalTag(input.festival_tag_id, input.festival_tag, tagConfig)

    transaction.create(transactionRef, {
      transaction_id: `FTX-INCOME-${idempotencyKey.toUpperCase()}`,
      type: 'income',
      posting_status: 'unposted',
      transaction_date: input.transaction_date,
      reference_no: input.reference_no,
      description: input.description,
      category_name: input.category_name,
      amount_paise: input.amount_paise,
      account_id: null,
      transfer_to_account_id: null,
      linked_order_id: null,
      linked_expense_id: null,
      party_name: input.vendor_name || null,
      source_of_income: input.source_of_income || null,
      payment_method: input.payment_method,
      festival_tag: festivalTag,
      festival_tag_id: input.festival_tag_id,
      idempotency_key: idempotencyKey,
      receipt_paths: [],
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      audit: [{ action: 'created_unposted', admin_user_id: actor.uid, created_at: now }],
    })
  })
  return { success: true, transaction_id: transactionRef.id }
})

function assertEditableReferenceIncome(income) {
  if (!income || income.type !== 'income' || income.is_deleted === true) {
    throw new HttpsError('failed-precondition', 'This is not an active reference income record.')
  }
  if (income.posting_status !== 'unposted' ||
    (income.account_id != null && income.account_id !== '') ||
    income.linked_order_id != null ||
    income.linked_expense_id != null) {
    throw new HttpsError('failed-precondition', 'Posted or linked income records cannot be changed here.')
  }
}

exports.editUnpostedFinancialIncome = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const data = request.data && typeof request.data === 'object' ? request.data : {}
  const transactionId = requireRecordId(data.transaction_id, 'Income record ID')
  const rawInput = data.input && typeof data.input === 'object' ? data.input : {}
  const input = normalizeIncomeInput(rawInput, false, true)
  const transactionRef = db.collection('financial_transactions').doc(transactionId)
  const paymentConfigRef = db.collection('site_config').doc(FINANCIAL_PAYMENT_METHODS_CONFIG_ID)
  const tagConfigRef = db.collection('site_config').doc('financial_festivals')
  const duplicateReferenceQuery = input.reference_no
    ? db.collection('financial_transactions').where('reference_no', '==', input.reference_no)
    : null
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const [incomeSnapshot, paymentConfigSnapshot, tagConfigSnapshot, duplicateReferences] = await Promise.all([
      transaction.get(transactionRef),
      transaction.get(paymentConfigRef),
      transaction.get(tagConfigRef),
      duplicateReferenceQuery ? transaction.get(duplicateReferenceQuery) : Promise.resolve(null),
    ])
    if (!incomeSnapshot.exists) throw new HttpsError('not-found', 'The income record no longer exists.')
    const income = incomeSnapshot.data()
    assertEditableReferenceIncome(income)
    if (duplicateReferences && duplicateReferences.docs.some(function(item) {
      return item.id !== transactionId && item.data().is_deleted !== true
    })) {
      throw new HttpsError('already-exists', 'That reference is already used by another financial transaction.')
    }

    const paymentConfig = paymentConfigSnapshot.exists ? paymentConfigSnapshot.data() : {}
    assertApprovedFinancialPaymentMethod(input.payment_method, paymentConfig, true)
    const tagConfig = tagConfigSnapshot.exists ? tagConfigSnapshot.data() : {}
    const savedTagId = income.festival_tag_id ?? null
    const requestedTagId = rawInput.festival_tag_id ?? null
    const preserveExistingTag = Boolean(income.festival_tag &&
      input.festival_tag === income.festival_tag &&
      requestedTagId === savedTagId)
    const festivalTag = preserveExistingTag
      ? income.festival_tag
      : resolveConfiguredFestivalTag(input.festival_tag_id, input.festival_tag, tagConfig)
    const festivalTagId = preserveExistingTag ? savedTagId : input.festival_tag_id
    transaction.update(transactionRef, {
      transaction_date: input.transaction_date,
      reference_no: input.reference_no,
      description: input.description,
      category_name: input.category_name,
      amount_paise: input.amount_paise,
      party_name: input.vendor_name || null,
      source_of_income: input.source_of_income || null,
      payment_method: input.payment_method,
      festival_tag: festivalTag,
      festival_tag_id: festivalTagId,
      updated_by: actor.uid,
      updated_by_name: actor.name,
      updated_at: now,
      audit: [
        ...(Array.isArray(income.audit) ? income.audit : []),
        { action: 'updated_reference_income', admin_user_id: actor.uid, created_at: now },
      ],
    })
  })
  return { success: true, transaction_id: transactionRef.id }
})

exports.deleteUnpostedFinancialIncome = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const transactionId = requireRecordId(request.data && request.data.transaction_id, 'Income record ID')
  const transactionRef = db.collection('financial_transactions').doc(transactionId)
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(transactionRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'The income record no longer exists.')
    const income = snapshot.data()
    if (income && income.type === 'income' && income.posting_status === 'unposted' && income.is_deleted === true) return
    assertEditableReferenceIncome(income)
    transaction.update(transactionRef, {
      is_deleted: true,
      deleted_by: actor.uid,
      deleted_by_name: actor.name,
      deleted_at: now,
      updated_by: actor.uid,
      updated_at: now,
      audit: [
        ...(Array.isArray(income.audit) ? income.audit : []),
        { action: 'deleted_reference_income', admin_user_id: actor.uid, created_at: now },
      ],
    })
  })
  return { success: true, transaction_id: transactionRef.id }
})

exports.fetchUnpostedFinancialIncomes = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  await requireAccountsAdmin(request)
  const snapshot = await db.collection('financial_transactions')
    .where('posting_status', '==', 'unposted')
    .get()
  const items = snapshot.docs
    .filter(function(item) {
      const data = item.data()
      return data.type === 'income' && data.is_deleted !== true
    })
    .map(function(item) {
      const data = item.data()
      if (!(data.transaction_date instanceof Timestamp) ||
        !Number.isSafeInteger(data.amount_paise) || data.amount_paise <= 0) {
        throw new HttpsError('failed-precondition', `Unposted income ${item.id} has invalid financial details.`)
      }
      return {
        id: item.id,
        transaction_id: String(data.transaction_id ?? item.id),
        transaction_date: data.transaction_date.toDate().toISOString().slice(0, 10),
        amount_paise: data.amount_paise,
        festival_tag: typeof data.festival_tag === 'string' ? data.festival_tag : null,
        festival_tag_id: typeof data.festival_tag_id === 'string' ? data.festival_tag_id : null,
        category_name: String(data.category_name ?? ''),
        description: String(data.description ?? ''),
        payment_method: String(data.payment_method ?? ''),
        vendor_name: typeof data.party_name === 'string' ? data.party_name : '',
        reference_no: String(data.reference_no ?? ''),
        source_of_income: typeof data.source_of_income === 'string' ? data.source_of_income : '',
        receipt_paths: Array.isArray(data.receipt_paths)
          ? data.receipt_paths.filter(function(path) { return typeof path === 'string' })
          : [],
        posting_status: 'unposted',
      }
    })
    .sort((left, right) => right.transaction_date.localeCompare(left.transaction_date) || right.id.localeCompare(left.id))
  return { items }
})

exports.postUnpostedFinancialIncome = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  await requireAccountsAdmin(request)
  throw new HttpsError('failed-precondition', 'Reference income cannot be posted to the ledger.')
})

exports.saveFinancialIncomeDraft = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const data = request.data && typeof request.data === 'object' ? request.data : {}
  const draftId = data.draft_id
    ? requireRecordId(data.draft_id, 'Income draft ID')
    : db.collection(FINANCIAL_INCOME_DRAFTS).doc().id
  const draftRef = db.collection(FINANCIAL_INCOME_DRAFTS).doc(draftId)
  const paymentConfigRef = db.collection('site_config').doc(FINANCIAL_PAYMENT_METHODS_CONFIG_ID)
  const tagConfigRef = db.collection('site_config').doc('financial_festivals')
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const [existingSnapshot, paymentConfigSnapshot, tagConfigSnapshot] = await Promise.all([
      transaction.get(draftRef),
      transaction.get(paymentConfigRef),
      transaction.get(tagConfigRef),
    ])
    if (existingSnapshot.exists && existingSnapshot.data().status !== 'draft') {
      throw new HttpsError('failed-precondition', 'A confirmed income record can no longer be edited as a draft.')
    }
    const input = normalizeIncomeInput(data.input, true)
    const paymentConfig = paymentConfigSnapshot.exists ? paymentConfigSnapshot.data() : {}
    assertApprovedFinancialPaymentMethod(input.payment_method, paymentConfig, true)
    const tagConfig = tagConfigSnapshot.exists ? tagConfigSnapshot.data() : {}
    const festivalTag = resolveConfiguredFestivalTag(input.festival_tag_id, input.festival_tag, tagConfig)
    transaction.set(draftRef, {
      ...input,
      festival_tag: festivalTag,
      status: 'draft',
      linked_transaction_id: null,
      ...(existingSnapshot.exists
        ? { created_by: existingSnapshot.data().created_by, created_at: existingSnapshot.data().created_at }
        : { created_by: actor.uid, created_by_name: actor.name, created_at: now }),
      updated_by: actor.uid,
      updated_at: now,
    })
  })
  return { success: true, draft_id: draftId }
})

exports.deleteFinancialIncomeDraft = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  await requireAccountsAdmin(request)
  const draftId = requireRecordId(request.data && request.data.draft_id, 'Income draft ID')
  const draftRef = db.collection(FINANCIAL_INCOME_DRAFTS).doc(draftId)
  await db.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(draftRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'The income draft no longer exists.')
    if (snapshot.data().status !== 'draft') throw new HttpsError('failed-precondition', 'Confirmed income records cannot be deleted as drafts.')
    transaction.delete(draftRef)
  })
  return { success: true }
})

exports.createFinancialIncome = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const input = normalizeIncomeInput(request.data, false)
  const accountId = requireRecordId(request.data.account_id, 'Receiving account')
  const idempotencyKey = requireText(request.data.idempotency_key, 'Idempotency key', 120, false)
  if (!/^[A-Za-z0-9_-]+$/.test(idempotencyKey)) {
    throw new HttpsError('invalid-argument', 'The income confirmation key is invalid.')
  }
  const draftId = request.data.draft_id ? requireRecordId(request.data.draft_id, 'Income draft ID') : null
  const transactionRef = db.collection('financial_transactions').doc(`income_${idempotencyKey}`)
  const accountRef = db.collection('financial_accounts').doc(accountId)
  const draftRef = draftId ? db.collection(FINANCIAL_INCOME_DRAFTS).doc(draftId) : null
  const paymentConfigRef = db.collection('site_config').doc(FINANCIAL_PAYMENT_METHODS_CONFIG_ID)
  const tagConfigRef = db.collection('site_config').doc('financial_festivals')
  const duplicateReferenceQuery = input.reference_no
    ? db.collection('financial_transactions').where('reference_no', '==', input.reference_no)
    : null
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const [existingTransaction, accountSnapshot, draftSnapshot, paymentConfigSnapshot, tagConfigSnapshot, duplicateReferences] =
      await Promise.all([
        transaction.get(transactionRef),
        transaction.get(accountRef),
        draftRef ? transaction.get(draftRef) : Promise.resolve(null),
        transaction.get(paymentConfigRef),
        transaction.get(tagConfigRef),
        duplicateReferenceQuery ? transaction.get(duplicateReferenceQuery) : Promise.resolve(null),
      ])
    if (existingTransaction.exists) {
      if (existingTransaction.data().posting_status === 'unposted') {
        throw new HttpsError('failed-precondition', 'This income is unposted. Post it from Income History instead.')
      }
      if (existingTransaction.data().idempotency_key === idempotencyKey) return
      throw new HttpsError('already-exists', 'This income confirmation has already been recorded.')
    }
    if (duplicateReferences && !duplicateReferences.empty) {
      throw new HttpsError('already-exists', 'That reference is already used by an existing financial transaction.')
    }
    if (!accountSnapshot.exists) throw new HttpsError('not-found', 'The selected receiving account no longer exists.')
    const account = accountSnapshot.data()
    if (account.active === false || !['cash', 'bank', 'upi'].includes(account.type)) {
      throw new HttpsError('failed-precondition', 'Choose an active cash, bank or UPI account to receive this income.')
    }
    if (draftRef && (!draftSnapshot || !draftSnapshot.exists || draftSnapshot.data().status !== 'draft')) {
      throw new HttpsError('failed-precondition', 'The income draft is no longer available to confirm.')
    }
    const paymentConfig = paymentConfigSnapshot.exists ? paymentConfigSnapshot.data() : {}
    assertApprovedFinancialPaymentMethod(input.payment_method, paymentConfig, false)
    const tagConfig = tagConfigSnapshot.exists ? tagConfigSnapshot.data() : {}
    const festivalTag = resolveConfiguredFestivalTag(input.festival_tag_id, input.festival_tag, tagConfig)
    const balance = account.balance_paise
    const nextBalance = balance + input.amount_paise
    if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isSafeInteger(nextBalance)) {
      throw new HttpsError('failed-precondition', 'The selected account has an invalid balance.')
    }

    transaction.update(accountRef, {
      balance_paise: nextBalance,
      updated_by: actor.uid,
      updated_at: now,
    })
    transaction.create(transactionRef, {
      transaction_id: `FTX-INCOME-${idempotencyKey.toUpperCase()}`,
      type: 'income',
      posting_status: 'posted',
      transaction_date: input.transaction_date,
      reference_no: input.reference_no,
      description: input.description,
      category_name: input.category_name,
      amount_paise: input.amount_paise,
      account_id: accountId,
      transfer_to_account_id: null,
      linked_order_id: null,
      linked_expense_id: null,
      party_name: input.vendor_name || null,
      source_of_income: input.source_of_income || null,
      payment_method: input.payment_method,
      festival_tag: festivalTag,
      festival_tag_id: input.festival_tag_id,
      idempotency_key: idempotencyKey,
      income_draft_id: draftId,
      receipt_paths: [],
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      audit: [{ action: 'created', admin_user_id: actor.uid, created_at: now }],
    })
    if (draftRef) {
      transaction.update(draftRef, {
        status: 'confirmed',
        linked_transaction_id: transactionRef.id,
        updated_by: actor.uid,
        updated_at: now,
      })
    }
  })
  return { success: true, transaction_id: transactionRef.id }
})

exports.editFinancialTransaction = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const transactionId = requireRecordId(request.data && request.data.transaction_id, 'Transaction ID')
  const input = request.data && request.data.input
  if (!input || typeof input !== 'object') throw new HttpsError('invalid-argument', 'Transaction details are required.')
  const transactionRef = db.collection('financial_transactions').doc(transactionId)
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(transactionRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'The transaction no longer exists.')
    const current = snapshot.data()
    if (!current || current.is_deleted === true) throw new HttpsError('failed-precondition', 'Deleted transactions cannot be edited.')
    if (current.type === 'opening_balance') throw new HttpsError('failed-precondition', 'Opening balances cannot be edited as transactions.')
    if (current.posting_status === 'unposted') {
      throw new HttpsError('failed-precondition', 'Unposted income must be posted from Income History before it can be edited.')
    }

    const description = requireText(input.description, 'Description', 250, false)
    const categoryName = requireText(input.category_name, 'Category', 80, false)
    const amount = requirePaise(input.amount_paise, 'Amount', false)
    const date = requireDate(input.transaction_date, 'Transaction date')
    let isPettyCashSpending = current.is_petty_cash_spending === true
    if (input.is_petty_cash_spending === true && !isPettyCashSpending) {
      const currentAccountRef = db.collection('financial_accounts').doc(requireRecordId(current.account_id, 'Transaction account'))
      const currentAccountSnapshot = await transaction.get(currentAccountRef)
      isPettyCashSpending = currentAccountSnapshot.exists && currentAccountSnapshot.data().type === 'petty_cash'
      if (!isPettyCashSpending) throw new HttpsError('failed-precondition', 'Only petty cash records can use the spending-only flow.')
    }
    if (isPettyCashSpending && (current.type !== 'expense' || current.linked_order_id || current.linked_expense_id)) {
      throw new HttpsError('failed-precondition', 'This is not an editable petty cash spending record.')
    }
    const isUnallocatedExpensePayment = current.is_unallocated_expense_payment === true
    if (isUnallocatedExpensePayment && (
      current.type !== 'expense' ||
      !current.linked_expense_id ||
      current.account_id !== UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID
    )) {
      throw new HttpsError('failed-precondition', 'This is not a valid unallocated expense payment.')
    }
    const referenceNo = isPettyCashSpending
      ? requireText(input.reference_no, 'Reference', 200, true)
      : current.reference_no || ''
    const partyName = isPettyCashSpending
      ? requireText(input.party_name, 'Customer or vendor', 120, true) || null
      : current.party_name || null
    const accountId = isPettyCashSpending
      ? '__petty_cash_spending__'
      : isUnallocatedExpensePayment
        ? UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID
        : requireRecordId(input.account_id, 'Account')
    const paymentMethod = requireText(input.payment_method, 'Payment method', 80, true)
    const festivalTag = requireFestivalTag(input.festival_tag)
    const festivalTagId = requireFestivalTagId(input.festival_tag_id, festivalTag)
    const transferTo = input.transfer_to_account_id == null || input.transfer_to_account_id === ''
      ? null
      : requireRecordId(input.transfer_to_account_id, 'Transfer destination')
    if (current.type === 'transfer' && (!transferTo || transferTo === accountId)) {
      throw new HttpsError('invalid-argument', 'Choose two different transfer accounts.')
    }
    if (current.type !== 'transfer' && transferTo) {
      throw new HttpsError('invalid-argument', 'Only transfers can have a destination account.')
    }
    if ((current.linked_order_id || current.linked_expense_id) && current.type !== (current.linked_order_id ? 'income' : 'expense')) {
      throw new HttpsError('failed-precondition', 'The linked transaction type is invalid.')
    }

    const orderRef = current.linked_order_id
      ? db.collection('orders').doc(requireRecordId(current.linked_order_id, 'Linked order ID'))
      : null
    const expenseRef = current.linked_expense_id
      ? db.collection('financial_expenses').doc(requireRecordId(current.linked_expense_id, 'Linked expense ID'))
      : null
    const orderSnapshot = orderRef ? await transaction.get(orderRef) : null
    const expenseSnapshot = expenseRef ? await transaction.get(expenseRef) : null
    if (orderRef && (!orderSnapshot || !orderSnapshot.exists)) throw new HttpsError('not-found', 'The linked order no longer exists.')
    if (expenseRef && (!expenseSnapshot || !expenseSnapshot.exists)) throw new HttpsError('not-found', 'The linked expense no longer exists.')
    const linkedOrder = orderSnapshot && orderSnapshot.data()
    const linkedExpense = expenseSnapshot && expenseSnapshot.data()
    if (linkedExpense && linkedExpense.is_deleted === true) throw new HttpsError('failed-precondition', 'Payments for a deleted expense cannot be edited.')
    if (linkedExpense && linkedExpense.is_full_amount_spending === true && isUnallocatedExpensePayment) {
      throw new HttpsError('failed-precondition', 'Edit this full-amount expense from the Expenses tab.')
    }

    const next = {
      ...current,
      transaction_date: date,
      description,
      category_name: categoryName,
      amount_paise: amount,
      account_id: accountId,
      transfer_to_account_id: transferTo,
      payment_method: paymentMethod,
      festival_tag: festivalTag,
      festival_tag_id: festivalTagId,
      ...(isPettyCashSpending ? { reference_no: referenceNo, party_name: partyName } : {}),
      ...(isPettyCashSpending ? { is_petty_cash_spending: true } : {}),
    }
    const deltas = new Map()
    if (!isPettyCashSpending && !isUnallocatedExpensePayment) {
      addTransactionPosting(deltas, current, -1)
      addTransactionPosting(deltas, next, 1)
    }

    let orderUpdate = null
    if (linkedOrder) {
      const { total, paid } = orderPaidPaise(linkedOrder)
      const nextPaid = paid - current.amount_paise + amount
      if (!Number.isSafeInteger(nextPaid) || nextPaid < 0 || nextPaid > total) {
        throw new HttpsError('failed-precondition', 'The edited payment must fit within the linked order balance.')
      }
      orderUpdate = { amount_paid: nextPaid / 100, payment_status: orderPaymentStatus(nextPaid, total), paid_at: nextPaid >= total ? linkedOrder.paid_at || now : null }
    }
    let expenseUpdate = null
    if (linkedExpense) {
      const paid = positiveStoredPaise(linkedExpense.paid_paise, 'expense paid amount')
      const total = positiveStoredPaise(linkedExpense.amount_paise, 'expense amount')
      const nextPaid = paid - current.amount_paise + amount
      if (!Number.isSafeInteger(nextPaid) || nextPaid < 0 || nextPaid > total) {
        throw new HttpsError('failed-precondition', 'The edited payment must fit within the linked expense balance.')
      }
      expenseUpdate = {
        paid_paise: nextPaid,
        outstanding_paise: total - nextPaid,
        payment_status: expensePaymentStatus(nextPaid, total),
        ...(isUnallocatedExpensePayment ? { payment_method: paymentMethod } : {}),
        updated_by: actor.uid,
        updated_at: now,
        audit: FieldValue.arrayUnion({
          action: 'linked_payment_edited',
          admin_user_id: actor.uid,
          created_at: now,
          amount_paise: amount,
        }),
      }
    }

    if (!isPettyCashSpending && !isUnallocatedExpensePayment) await applyAccountDeltas(transaction, deltas, actor, now)
    transaction.update(transactionRef, {
      transaction_date: date,
      description,
      category_name: categoryName,
      amount_paise: amount,
      account_id: accountId,
      transfer_to_account_id: transferTo,
      payment_method: paymentMethod,
      festival_tag: festivalTag,
      festival_tag_id: festivalTagId,
      ...(isPettyCashSpending ? { reference_no: referenceNo, party_name: partyName } : {}),
      ...(isPettyCashSpending ? { is_petty_cash_spending: true } : {}),
      updated_by: actor.uid,
      updated_by_name: actor.name,
      updated_at: now,
      audit: FieldValue.arrayUnion({
        action: 'edited',
        admin_user_id: actor.uid,
        created_at: now,
        previous: {
          transaction_date: current.transaction_date,
          description: current.description,
          category_name: current.category_name,
          amount_paise: current.amount_paise,
          account_id: current.account_id,
          transfer_to_account_id: current.transfer_to_account_id ?? null,
          payment_method: current.payment_method ?? '',
          festival_tag: current.festival_tag ?? null,
          festival_tag_id: current.festival_tag_id ?? null,
          reference_no: current.reference_no ?? '',
          party_name: current.party_name ?? null,
        },
        next: {
          transaction_date: date,
          description,
          category_name: categoryName,
          amount_paise: amount,
          account_id: accountId,
          transfer_to_account_id: transferTo,
          payment_method: paymentMethod,
          festival_tag: festivalTag,
          festival_tag_id: festivalTagId,
          ...(isPettyCashSpending ? { reference_no: referenceNo, party_name: partyName } : {}),
        },
      }),
    })
    if (orderUpdate && orderRef) transaction.update(orderRef, { ...orderUpdate, updated_at: now })
    if (expenseUpdate && expenseRef) transaction.update(expenseRef, expenseUpdate)
  })
  return { success: true }
})

exports.deleteFinancialTransaction = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const transactionId = requireRecordId(request.data && request.data.transaction_id, 'Transaction ID')
  const transactionRef = db.collection('financial_transactions').doc(transactionId)
  const now = Timestamp.now()
  let transactionType = 'unknown'

  await db.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(transactionRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'The transaction no longer exists.')
    const current = snapshot.data()
    if (!current || current.is_deleted === true) throw new HttpsError('failed-precondition', 'This transaction has already been deleted.')
    transactionType = typeof current.type === 'string' ? current.type : 'unknown'
    if (current.posting_status === 'unposted') {
      throw new HttpsError('failed-precondition', 'Unposted income cannot be deleted as a ledger transaction.')
    }
    let openingBalanceAccountRef = null
    let openingBalanceUpdate = null
    if (current.type === 'opening_balance') {
      if (current.linked_order_id || current.linked_expense_id) {
        throw new HttpsError('failed-precondition', 'The opening balance transaction has invalid links.')
      }
      const openingAmount = positiveStoredPaise(current.amount_paise, 'opening balance')
      openingBalanceAccountRef = db.collection('financial_accounts')
        .doc(requireRecordId(current.account_id, 'Opening balance account'))
      const accountSnapshot = await transaction.get(openingBalanceAccountRef)
      if (!accountSnapshot.exists) throw new HttpsError('not-found', 'The opening balance account no longer exists.')
      const account = accountSnapshot.data()
      if (!account || !Number.isSafeInteger(account.opening_balance_paise) ||
        account.opening_balance_paise !== openingAmount) {
        throw new HttpsError('failed-precondition', 'The account opening balance no longer matches this transaction.')
      }
      if (!Number.isSafeInteger(account.balance_paise) || account.balance_paise < 0) {
        throw new HttpsError('failed-precondition', 'The account has an invalid balance.')
      }
      const nextBalance = account.balance_paise - openingAmount
      if (nextBalance < 0) {
        throw new HttpsError('failed-precondition', 'The opening balance cannot be removed because the account balance would become negative.')
      }
      openingBalanceUpdate = {
        opening_balance_paise: 0,
        balance_paise: nextBalance,
        updated_by: actor.uid,
        updated_at: now,
      }
    }
    let isPettyCashSpending = current.is_petty_cash_spending === true
    if (isPettyCashSpending && (current.type !== 'expense' || current.linked_order_id || current.linked_expense_id)) {
      throw new HttpsError('failed-precondition', 'This is not a valid petty cash spending record.')
    }
    if (current.is_unallocated_expense_payment === true && (
      current.type !== 'expense' ||
      !current.linked_expense_id ||
      current.account_id !== UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID
    )) {
      throw new HttpsError('failed-precondition', 'This is not a valid unallocated expense payment.')
    }
    if (
      !isPettyCashSpending &&
      current.type === 'expense' &&
      !current.linked_order_id &&
      !current.linked_expense_id
    ) {
      if (current.account_id === PETTY_CASH_SPENDING_ACCOUNT_ID) {
        isPettyCashSpending = true
      } else {
        const currentAccountRef = db.collection('financial_accounts').doc(requireRecordId(current.account_id, 'Transaction account'))
        const currentAccountSnapshot = await transaction.get(currentAccountRef)
        isPettyCashSpending = currentAccountSnapshot.exists &&
          currentAccountSnapshot.data().type === 'petty_cash'
      }
    }
    if (request.data && request.data.petty_cash_spending === true && !isPettyCashSpending) {
      throw new HttpsError('failed-precondition', 'Only petty cash spending can use the spending-only flow.')
    }

    const orderRef = current.linked_order_id
      ? db.collection('orders').doc(requireRecordId(current.linked_order_id, 'Linked order ID'))
      : null
    const expenseRef = current.linked_expense_id
      ? db.collection('financial_expenses').doc(requireRecordId(current.linked_expense_id, 'Linked expense ID'))
      : null
    const orderSnapshot = orderRef ? await transaction.get(orderRef) : null
    const expenseSnapshot = expenseRef ? await transaction.get(expenseRef) : null
    if (orderRef && (!orderSnapshot || !orderSnapshot.exists)) throw new HttpsError('not-found', 'The linked order no longer exists.')
    if (expenseRef && (!expenseSnapshot || !expenseSnapshot.exists)) throw new HttpsError('not-found', 'The linked expense no longer exists.')
    const linkedOrder = orderSnapshot && orderSnapshot.data()
    const linkedExpense = expenseSnapshot && expenseSnapshot.data()
    if (linkedExpense && linkedExpense.is_deleted === true) throw new HttpsError('failed-precondition', 'This payment belongs to an already deleted expense.')
    const isFullAmountExpense = Boolean(
      linkedExpense &&
      linkedExpense.is_full_amount_spending === true &&
      current.is_unallocated_expense_payment === true,
    )
    const linkedExpenseIdValue = linkedExpense && typeof linkedExpense.expense_id === 'string' &&
      /^[A-Za-z0-9-]{1,64}$/.test(linkedExpense.expense_id)
      ? linkedExpense.expense_id
      : null
    const linkedExpenseIdRegistryRef = isFullAmountExpense && linkedExpenseIdValue
      ? db.collection('financial_expense_id_registry').doc(linkedExpenseIdValue.toUpperCase())
      : null
    const linkedExpenseIdRegistrySnapshot = linkedExpenseIdRegistryRef
      ? await transaction.get(linkedExpenseIdRegistryRef)
      : null
    if (isFullAmountExpense) {
      const linkedTransactions = await transaction.get(
        db.collection('financial_transactions').where('linked_expense_id', '==', current.linked_expense_id),
      )
      const activeLinkedTransactions = linkedTransactions.docs.filter(item => item.data().is_deleted !== true)
      const expenseAmount = positiveStoredPaise(linkedExpense.amount_paise, 'expense amount')
      const expensePaid = requirePaise(linkedExpense.paid_paise, 'Paid amount', true)
      if (
        activeLinkedTransactions.length !== 1 ||
        activeLinkedTransactions[0].id !== transactionId ||
        current.amount_paise !== expenseAmount ||
        expensePaid !== expenseAmount ||
        linkedExpense.outstanding_paise !== 0
      ) {
        throw new HttpsError('failed-precondition', 'The linked expense records are inconsistent. Refresh and try again.')
      }
    }

    const deltas = new Map()
    if (!isPettyCashSpending && current.type !== 'opening_balance') addTransactionPosting(deltas, current, -1)
    let orderUpdate = null
    if (linkedOrder) {
      const { total, paid } = orderPaidPaise(linkedOrder)
      const nextPaid = paid - current.amount_paise
      if (!Number.isSafeInteger(nextPaid) || nextPaid < 0) {
        throw new HttpsError('failed-precondition', 'The order payment total is inconsistent with this receipt.')
      }
      orderUpdate = { amount_paid: nextPaid / 100, payment_status: orderPaymentStatus(nextPaid, total), paid_at: nextPaid >= total ? linkedOrder.paid_at || now : null }
    }
    let expenseUpdate = null
    if (linkedExpense && !isFullAmountExpense) {
      const paid = positiveStoredPaise(linkedExpense.paid_paise, 'expense paid amount')
      const total = positiveStoredPaise(linkedExpense.amount_paise, 'expense amount')
      const nextPaid = paid - current.amount_paise
      if (!Number.isSafeInteger(nextPaid) || nextPaid < 0 || nextPaid > total) {
        throw new HttpsError('failed-precondition', 'The expense payment total is inconsistent with this payment.')
      }
      expenseUpdate = {
        paid_paise: nextPaid,
        outstanding_paise: total - nextPaid,
        payment_status: expensePaymentStatus(nextPaid, total),
        ...(current.is_unallocated_expense_payment === true && nextPaid === 0 ? { payment_method: '' } : {}),
        updated_by: actor.uid,
        updated_at: now,
        audit: FieldValue.arrayUnion({
          action: 'linked_payment_deleted',
          admin_user_id: actor.uid,
          created_at: now,
          amount_paise: current.amount_paise,
        }),
      }
    }

    if (!isPettyCashSpending && current.type !== 'opening_balance') {
      await applyAccountDeltas(transaction, deltas, actor, now)
    }
    if (current.type === 'expense' || current.type === 'opening_balance' || isPettyCashSpending) {
      transaction.delete(transactionRef)
    } else {
      transaction.update(transactionRef, {
        is_deleted: true,
        deleted_at: now,
        deleted_by: actor.uid,
        deleted_by_name: actor.name,
        updated_by: actor.uid,
        updated_by_name: actor.name,
        updated_at: now,
        audit: FieldValue.arrayUnion({
          action: 'deleted',
          admin_user_id: actor.uid,
          admin_user_name: actor.name,
          created_at: now,
          amount_paise: current.amount_paise,
        }),
      })
    }
    if (orderUpdate && orderRef) transaction.update(orderRef, { ...orderUpdate, updated_at: now })
    if (expenseUpdate && expenseRef) transaction.update(expenseRef, expenseUpdate)
    if (openingBalanceAccountRef && openingBalanceUpdate) {
      transaction.update(openingBalanceAccountRef, openingBalanceUpdate)
    }
    if (isFullAmountExpense && expenseRef) {
      if (linkedExpenseIdRegistryRef && linkedExpenseIdRegistrySnapshot && !linkedExpenseIdRegistrySnapshot.exists) {
        transaction.create(linkedExpenseIdRegistryRef, {
          expense_id: linkedExpenseIdValue,
          expense_document_id: expenseRef.id,
          created_by: actor.uid,
          created_at: now,
          deleted_at: now,
          deleted_by: actor.uid,
        })
      }
      transaction.delete(expenseRef)
    }
  }).catch(function(error) {
    const errorCode = error && (typeof error.code === 'string' || typeof error.code === 'number')
      ? error.code
      : 'unknown'
    const errorMessage = error && typeof error.message === 'string'
      ? error.message
      : String(error)
    console.error('[accounts] deleteFinancialTransaction failed', {
      errorCode,
      errorMessage,
      functionName: 'deleteFinancialTransaction',
      firebaseProjectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'unknown',
      functionRegion: FUNCTION_REGION,
      transactionDocumentId: transactionId,
      transactionType,
      firestoreDocumentPath: `financial_transactions/${transactionId}`,
    })
    throw error
  })
  return { success: true }
})

exports.createFinancialExpense = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  let actor
  try {
    actor = await requireAccountsAdmin(request)
  } catch (error) {
    const errorCode = error && (typeof error.code === 'string' || typeof error.code === 'number')
      ? error.code
      : 'unknown'
    const errorMessage = error && typeof error.message === 'string'
      ? error.message
      : String(error)
    console.error('[accounts] createFinancialExpense authorization failed', {
      errorCode,
      errorMessage,
      functionName: 'createFinancialExpense',
      operation: 'createFinancialExpense',
      collectionPath: 'financial_expenses',
      firebaseProjectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'unknown',
      functionRegion: FUNCTION_REGION,
      firestoreDatabaseId: 'festecart',
      isAuthenticated: Boolean(request.auth),
      adminAuthorizationSucceeded: false,
    })
    throw error
  }
  const input = request.data && request.data.input
  if (!input || typeof input !== 'object') throw new HttpsError('invalid-argument', 'Expense details are required.')
  const expenseId = requireText(input.expense_id, 'Expense ID', 64, true)
  if (expenseId && !/^[A-Za-z0-9-]+$/.test(expenseId)) {
    throw new HttpsError('invalid-argument', 'The Expense ID is invalid.')
  }
  const description = requireText(input.description, 'Description', 250, true)
  const categoryName = requireText(input.category_name, 'Category', 80, true)
  const vendorId = input.vendor_id == null || input.vendor_id === '' ? null : requireRecordId(input.vendor_id, 'Vendor ID')
  const suppliedVendorName = requireText(input.vendor_name, 'Vendor name', 120, true)
  const paymentReference = requireText(input.payment_reference, 'Payment reference', 200, true)
  const reference = requireText(input.reference_no, 'Reference', 200, true)
  const date = requireDate(input.transaction_date, 'Expense date')
  const amount = requirePaise(input.amount_paise, 'Expense amount', false)
  const paymentMethod = requireText(input.payment_method, 'Payment method', 80, true)
  const festivalTag = requireFestivalTag(input.festival_tag)
  const festivalTagId = requireFestivalTagId(input.festival_tag_id, festivalTag)

  const expenseCollection = db.collection('financial_expenses')
  const expenseRef = expenseCollection.doc()
  const expenseDocumentId = expenseRef.id
  const expenseIdKey = expenseId.toUpperCase()
  const expenseIdRef = expenseId ? db.collection('financial_expense_id_registry').doc(expenseIdKey) : null
  const existingExpenseQueries = expenseId ? [expenseCollection.where('expense_id', '==', expenseId)] : []
  if (expenseId && expenseIdKey !== expenseId) {
    existingExpenseQueries.push(expenseCollection.where('expense_id', '==', expenseIdKey))
  }
  const paymentRef = db.collection('financial_transactions').doc()
  const vendorRef = vendorId ? db.collection('vendors').doc(vendorId) : null
  const tagsRef = db.collection('site_config').doc('financial_festivals')
  const paymentMethodsRef = db.collection('site_config').doc(FINANCIAL_PAYMENT_METHODS_CONFIG_ID)
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const [expenseIdSnapshot, existingExpenseSnapshots, vendorSnapshot, tagsSnapshot, paymentMethodsSnapshot] = await Promise.all([
      expenseIdRef ? transaction.get(expenseIdRef) : Promise.resolve(null),
      Promise.all(existingExpenseQueries.map(existingQuery => transaction.get(existingQuery))),
      vendorRef ? transaction.get(vendorRef) : Promise.resolve(null),
      festivalTagId ? transaction.get(tagsRef) : Promise.resolve(null),
      paymentMethod ? transaction.get(paymentMethodsRef) : Promise.resolve(null),
    ])
    if ((expenseIdSnapshot && expenseIdSnapshot.exists) || existingExpenseSnapshots.some(snapshot => !snapshot.empty)) {
      throw new HttpsError('already-exists', 'This Expense ID already exists. Please enter a different ID.')
    }
    if (vendorRef && !vendorSnapshot.exists) throw new HttpsError('not-found', 'The selected vendor no longer exists.')
    assertApprovedFinancialPaymentMethod(
      paymentMethod,
      paymentMethodsSnapshot && paymentMethodsSnapshot.exists ? paymentMethodsSnapshot.data() : {},
      true,
    )
    const tagsData = tagsSnapshot && tagsSnapshot.exists ? tagsSnapshot.data() : {}
    const tagName = festivalTagId
      ? (tagsData.custom_tags && tagsData.custom_tags[festivalTagId]) ||
        (tagsData.tag_names && tagsData.tag_names[festivalTagId])
      : null
    if (festivalTagId && (typeof tagName !== 'string' || !tagName.trim())) {
      throw new HttpsError('failed-precondition', 'Please select a tag created in Accounts → Tags.')
    }
    const canonicalVendorName = vendorSnapshot
      ? String(vendorSnapshot.data().business_name || vendorSnapshot.data().name || suppliedVendorName).trim()
      : ''
    const resolvedTagName = typeof tagName === 'string' ? tagName.trim() : null
    const paymentStatus = 'paid'
    if (expenseIdRef) {
      transaction.create(expenseIdRef, {
        expense_id: expenseId,
        expense_document_id: expenseRef.id,
        created_by: actor.uid,
        created_at: now,
      })
    }
    transaction.set(expenseRef, {
      expense_id: expenseId,
      description,
      category_name: categoryName,
      vendor_id: vendorId,
      vendor_name: vendorId ? canonicalVendorName : '',
      payment_reference: paymentReference,
      reference_no: reference,
      transaction_date: date,
      due_date: null,
      amount_paise: amount,
      paid_paise: amount,
      outstanding_paise: 0,
      payment_status: paymentStatus,
      is_accountless_payment: true,
      is_full_amount_spending: true,
      is_vendor_payable: Boolean(vendorId),
      payment_method: paymentMethod,
      festival_tag: resolvedTagName,
      festival_tag_id: festivalTagId,
      receipt_paths: [],
      account_id: null,
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      updated_by: actor.uid,
      updated_at: now,
      audit: [{ action: 'created', admin_user_id: actor.uid, created_at: now }],
    })
    transaction.set(paymentRef, {
      transaction_id: `FTX-${expenseId || paymentRef.id}`,
      type: 'expense',
      transaction_date: date,
      reference_no: reference,
      description,
      category_name: categoryName,
      amount_paise: amount,
      account_id: UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID,
      transfer_to_account_id: null,
      linked_order_id: null,
      linked_expense_id: expenseRef.id,
      is_unallocated_expense_payment: true,
      payment_method: paymentMethod,
      festival_tag: resolvedTagName,
      festival_tag_id: festivalTagId,
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      audit: [{ action: 'created', admin_user_id: actor.uid, created_at: now }],
    })
  }).catch(function(error) {
    const errorCode = error && (typeof error.code === 'string' || typeof error.code === 'number')
      ? error.code
      : 'unknown'
    const errorMessage = error && typeof error.message === 'string'
      ? error.message
      : String(error)
    console.error('[accounts] createFinancialExpense failed', {
      errorCode,
      errorMessage,
      functionName: 'createFinancialExpense',
      operation: 'createFinancialExpense',
      collectionPath: 'financial_expenses',
      firebaseProjectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'unknown',
      functionRegion: FUNCTION_REGION,
      firestoreDatabaseId: 'festecart',
      isAuthenticated: Boolean(request.auth),
      adminAuthorizationSucceeded: true,
      expenseId,
      expenseDocumentId,
      ...(expenseIdKey ? { expenseIdRegistryPath: `financial_expense_id_registry/${expenseIdKey}` } : {}),
    })
    throw error
  })
  return { success: true, expense_id: expenseId, expense_document_id: expenseRef.id }
})

exports.editFinancialExpense = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const expenseId = requireRecordId(request.data && request.data.expense_id, 'Expense ID')
  const input = request.data && request.data.input
  if (!input || typeof input !== 'object') throw new HttpsError('invalid-argument', 'Expense details are required.')
  const expenseRef = db.collection('financial_expenses').doc(expenseId)
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(expenseRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'The expense no longer exists.')
    const current = snapshot.data()
    if (!current || current.is_deleted === true) throw new HttpsError('failed-precondition', 'Deleted expenses cannot be edited.')
    const description = requireText(input.description, 'Description', 250, true)
    const categoryName = requireText(input.category_name, 'Category', 80, true)
    const vendorId = input.vendor_id == null || input.vendor_id === '' ? null : requireRecordId(input.vendor_id, 'Vendor ID')
    const vendorName = requireText(input.vendor_name, 'Vendor name', 120, true)
    const paymentReference = requireText(input.payment_reference ?? current.payment_reference ?? '', 'Payment reference', 200, true)
    const reference = requireText(input.reference_no, 'Reference', 200, true)
    const date = requireDate(input.transaction_date, 'Expense date')
    const amount = requirePaise(input.amount_paise, 'Expense amount', false)
    const festivalTag = requireFestivalTag(input.festival_tag)
    const festivalTagId = requireFestivalTagId(input.festival_tag_id, festivalTag)
    const isFullAmountSpending = current.is_full_amount_spending === true
    const paid = isFullAmountSpending ? amount : requirePaise(current.paid_paise, 'Paid amount', true)
    const paymentMethod = requireText(input.payment_method, 'Payment method', 80, false)
    if (!isFullAmountSpending && amount < paid) {
      throw new HttpsError('failed-precondition', 'Expense total cannot be less than the amount already paid.')
    }
    const outstanding = amount - paid
    const paymentStatus = expensePaymentStatus(paid, amount)
    const linkedQuery = db.collection('financial_transactions').where('linked_expense_id', '==', expenseId)
    const [linkedSnapshot, paymentMethodsSnapshot] = await Promise.all([
      transaction.get(linkedQuery),
      paymentMethod ? transaction.get(db.collection('site_config').doc(FINANCIAL_PAYMENT_METHODS_CONFIG_ID)) : Promise.resolve(null),
    ])
    if (paymentMethod && paymentMethod !== current.payment_method) {
      assertApprovedFinancialPaymentMethod(
        paymentMethod,
        paymentMethodsSnapshot && paymentMethodsSnapshot.exists ? paymentMethodsSnapshot.data() : {},
        false,
      )
    }
    if (linkedSnapshot.size > 499) throw new HttpsError('failed-precondition', 'This expense has too many linked payments to edit safely.')
    const activeLinkedPayments = linkedSnapshot.docs.filter(item => item.data().is_deleted !== true)
    if (isFullAmountSpending && (
      activeLinkedPayments.length !== 1 ||
      activeLinkedPayments[0].data().is_unallocated_expense_payment !== true
    )) {
      throw new HttpsError('failed-precondition', 'The linked spending record is inconsistent; ask an administrator to review this expense.')
    }

    transaction.update(expenseRef, {
      description,
      category_name: categoryName,
      vendor_id: vendorId,
      vendor_name: vendorName,
      payment_reference: paymentReference,
      reference_no: reference,
      transaction_date: date,
      amount_paise: amount,
      paid_paise: paid,
      outstanding_paise: outstanding,
      payment_status: paymentStatus,
      payment_method: paymentMethod,
      festival_tag: festivalTag,
      festival_tag_id: festivalTagId,
      updated_by: actor.uid,
      updated_by_name: actor.name,
      updated_at: now,
      audit: FieldValue.arrayUnion({
        action: 'edited',
        admin_user_id: actor.uid,
        created_at: now,
        previous: {
          description: current.description,
          category_name: current.category_name,
          vendor_id: current.vendor_id ?? null,
          vendor_name: current.vendor_name ?? '',
          payment_reference: current.payment_reference ?? '',
          reference_no: current.reference_no ?? '',
          transaction_date: current.transaction_date,
          amount_paise: current.amount_paise,
          outstanding_paise: current.outstanding_paise,
          festival_tag: current.festival_tag ?? null,
          festival_tag_id: current.festival_tag_id ?? null,
        },
        next: {
          description,
          category_name: categoryName,
          vendor_id: vendorId,
          vendor_name: vendorName,
          payment_reference: paymentReference,
          reference_no: reference,
          transaction_date: date,
          amount_paise: amount,
          outstanding_paise: outstanding,
          festival_tag: festivalTag,
          festival_tag_id: festivalTagId,
        },
      }),
    })
    for (const linked of linkedSnapshot.docs) {
      if (linked.data().is_deleted === true) continue
      transaction.update(linked.ref, {
        description,
        category_name: categoryName,
        ...(isFullAmountSpending && linked.data().is_unallocated_expense_payment === true
          ? { amount_paise: amount }
          : {}),
        ...(linked.data().is_unallocated_expense_payment === true
          ? { transaction_date: date, reference_no: reference, payment_method: paymentMethod }
          : {}),
        festival_tag: festivalTag,
        festival_tag_id: festivalTagId,
        updated_by: actor.uid,
        updated_by_name: actor.name,
        updated_at: now,
        audit: FieldValue.arrayUnion({
          action: 'linked_expense_edited',
          admin_user_id: actor.uid,
          created_at: now,
          description,
          category_name: categoryName,
        }),
      })
    }
  })
  return { success: true }
})

exports.deleteFinancialExpense = onCall({ cors: ACCOUNTS_CORS_ORIGINS }, async function(request) {
  const actor = await requireAccountsAdmin(request)
  const expenseId = requireRecordId(request.data && request.data.expense_id, 'Expense ID')
  const expenseRef = db.collection('financial_expenses').doc(expenseId)
  const now = Timestamp.now()

  await db.runTransaction(async function(transaction) {
    const snapshot = await transaction.get(expenseRef)
    if (!snapshot.exists) throw new HttpsError('not-found', 'The expense no longer exists.')
    const expense = snapshot.data()
    if (!expense || expense.is_deleted === true) throw new HttpsError('failed-precondition', 'This expense has already been deleted.')
    const storedExpenseId = typeof expense.expense_id === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(expense.expense_id)
      ? expense.expense_id
      : null
    const expenseIdRegistryRef = storedExpenseId
      ? db.collection('financial_expense_id_registry').doc(storedExpenseId.toUpperCase())
      : null
    const expenseIdRegistrySnapshot = expenseIdRegistryRef
      ? await transaction.get(expenseIdRegistryRef)
      : null
    const linkedSnapshot = await transaction.get(
      db.collection('financial_transactions').where('linked_expense_id', '==', expenseId),
    )
    const linkedTransactions = linkedSnapshot.docs.filter(item => item.data().is_deleted !== true)
    if (linkedTransactions.length > 499) {
      throw new HttpsError('failed-precondition', 'This expense has too many linked payments to delete safely.')
    }
    const paid = requirePaise(expense.paid_paise, 'Paid amount', true)
    const linkedTotal = linkedTransactions.reduce((sum, item) => {
      const data = item.data()
      if (data.type !== 'expense' || data.linked_expense_id !== expenseId) {
        throw new HttpsError('failed-precondition', 'A linked expense payment has an invalid type.')
      }
      if (data.is_unallocated_expense_payment === true && data.account_id !== UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID) {
        throw new HttpsError('failed-precondition', 'A linked expense payment has an invalid account reference.')
      }
      return sum + positiveStoredPaise(data.amount_paise, 'linked payment amount')
    }, 0)
    if (linkedTotal !== paid) {
      throw new HttpsError('failed-precondition', 'Linked payment totals do not match this expense. Review the record before deleting it.')
    }

    const deltas = new Map()
    for (const linked of linkedTransactions) addTransactionPosting(deltas, linked.data(), -1)
    const uniqueAccountCount = Array.from(deltas.values()).filter(delta => delta !== 0).length
    if (linkedTransactions.length + uniqueAccountCount + 1 > 500) {
      throw new HttpsError('failed-precondition', 'This expense has too many linked records to delete in one safe operation.')
    }
    await applyAccountDeltas(transaction, deltas, actor, now)
    if (expenseIdRegistryRef && expenseIdRegistrySnapshot && !expenseIdRegistrySnapshot.exists) {
      transaction.create(expenseIdRegistryRef, {
        expense_id: storedExpenseId,
        expense_document_id: expenseId,
        created_by: actor.uid,
        created_at: now,
        deleted_at: now,
        deleted_by: actor.uid,
      })
    }
    transaction.delete(expenseRef)
    for (const linked of linkedTransactions) {
      transaction.delete(linked.ref)
    }
  }).catch(function(error) {
    const errorCode = error && (typeof error.code === 'string' || typeof error.code === 'number')
      ? error.code
      : 'unknown'
    const errorMessage = error && typeof error.message === 'string'
      ? error.message
      : String(error)
    console.error('[accounts] deleteFinancialExpense failed', {
      errorCode,
      errorMessage,
      functionName: 'deleteFinancialExpense',
      firebaseProjectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'unknown',
      functionRegion: FUNCTION_REGION,
      expenseDocumentId: expenseId,
      transactionType: 'expense',
      firestoreDocumentPath: `financial_expenses/${expenseId}`,
    })
    throw error
  })
  return { success: true }
})

function validRequiredString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength
}

exports.checkAffiliateEmail = onCall(async function(request) {
  await requireSuperAdmin(request)

  const email = request.data && typeof request.data.email === 'string'
    ? request.data.email.trim().toLowerCase()
    : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.')
  }

  let user
  try {
    user = await adminAuth.getUserByEmail(email)
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      return { exists: false, providers: [], alreadyAffiliate: false }
    }
    console.error('[affiliate] Email lookup failed:', error)
    throw new HttpsError('internal', 'Unable to check this email right now.')
  }

  const profile = await db.collection('affiliate_profiles').doc(user.uid).get()
  const providerLabels = new Map([
    ['password', 'Email and password'],
    ['google.com', 'Google'],
    ['facebook.com', 'Facebook'],
    ['apple.com', 'Apple'],
    ['phone', 'Phone'],
  ])
  const providers = Array.from(new Set(user.providerData.map(function(provider) {
    return providerLabels.get(provider.providerId) || 'Another sign-in provider'
  })))

  return {
    exists: true,
    providers: providers.length ? providers : ['Existing Firebase account'],
    alreadyAffiliate: profile.exists,
  }
})

exports.createAffiliateCoupon = onCall(async function(request) {
  let affiliateUser
  let createdAffiliateUser = false
  let operation = 'authorization'
  try {
    await requireSuperAdmin(request)

    operation = 'validation'
    const input = request.data || {}
    const coupon = input.coupon || {}
    const affiliate = input.affiliate || {}

    const code = typeof coupon.code === 'string' ? coupon.code.trim().toUpperCase() : ''
    const email = typeof affiliate.email === 'string' ? affiliate.email.trim().toLowerCase() : ''
    const password = typeof affiliate.password === 'string' ? affiliate.password : ''
    const commissionType = affiliate.commission_type
    const commissionValue = Number(affiliate.commission_value)
    const validFrom = Number(coupon.valid_from)
    const validTo = Number(coupon.valid_to)

    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) {
      throw new HttpsError('invalid-argument', 'Coupon code must contain 2–40 letters, numbers, underscores, or hyphens.')
    }
    if (!validRequiredString(affiliate.name, 120) || !validRequiredString(affiliate.phone, 40)) {
      throw new HttpsError('invalid-argument', 'Affiliate name and phone number are required.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError('invalid-argument', 'Enter a valid affiliate email address.')
    }
    if (!['flat', 'percentage'].includes(commissionType) ||
        !Number.isFinite(commissionValue) || commissionValue <= 0 ||
        (commissionType === 'percentage' && commissionValue > 100)) {
      throw new HttpsError('invalid-argument', 'Enter a valid positive flat or percentage commission.')
    }
    if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || validTo < validFrom) {
      throw new HttpsError('invalid-argument', 'Coupon validity dates are invalid.')
    }
    if (!validRequiredString(coupon.type, 40) ||
        !Number.isFinite(Number(coupon.value)) || Number(coupon.value) < 0) {
      throw new HttpsError('invalid-argument', 'Coupon details are invalid.')
    }

    operation = 'creating-affiliate-account'
    try {
      affiliateUser = await adminAuth.getUserByEmail(email)
    } catch (error) {
      if (!error || error.code !== 'auth/user-not-found') throw error
    }

    if (!affiliateUser) {
      if (password.length < 8 || password.length > 128) {
        throw new HttpsError(
          'invalid-argument',
          'A password of 8 to 128 characters is required when creating a new affiliate account.'
        )
      }

      try {
        affiliateUser = await adminAuth.createUser({
          email: email,
          password: password,
          displayName: affiliate.name.trim(),
        })
        createdAffiliateUser = true
      } catch (error) {
        if (!error || error.code !== 'auth/email-already-exists') throw error
        affiliateUser = await adminAuth.getUserByEmail(email)
      }
    }
    if (affiliateUser.disabled) {
      throw new HttpsError('failed-precondition', 'This Firebase account is disabled and cannot be activated as an affiliate.')
    }

    const couponRef = db.collection('coupons').doc()
    const profileRef = db.collection('affiliate_profiles').doc(affiliateUser.uid)
    const roleRef = db.collection('user_roles').doc(affiliateUser.uid)
    const now = Timestamp.now()

    operation = 'checking-coupon-code'
    await db.runTransaction(async function(transaction) {
      const existing = await transaction.get(
        db.collection('coupons').where('code', '==', code).limit(1)
      )
      if (!existing.empty) {
        throw new HttpsError('already-exists', 'Coupon code already exists.')
      }

      const existingProfile = await transaction.get(profileRef)
      if (existingProfile.exists) {
        throw new HttpsError('already-exists', 'This account is already linked to an affiliate profile.')
      }

      const existingRole = await transaction.get(roleRef)
      const existingRoleData = existingRole.exists ? existingRole.data() : {}
      if (existingRoleData.affiliate_id && existingRoleData.affiliate_id !== affiliateUser.uid) {
        throw new HttpsError('failed-precondition', 'The existing account has conflicting affiliate authorization.')
      }

      const roleNames = new Set(Array.isArray(existingRoleData.roles)
        ? existingRoleData.roles.filter(function(role) { return typeof role === 'string' })
        : [])
      if (typeof existingRoleData.role === 'string') roleNames.add(existingRoleData.role)
      roleNames.add('affiliate')

      operation = 'writing-affiliate-records'
      transaction.create(couponRef, {
        ...coupon,
        code: code,
        valid_from: Timestamp.fromMillis(validFrom),
        valid_to: Timestamp.fromMillis(validTo),
        total_uses: 0,
        affiliate_id: affiliateUser.uid,
        created_at: now,
        updated_at: now,
      })
      transaction.create(profileRef, {
        uid: affiliateUser.uid,
        name: affiliate.name.trim(),
        email: email,
        phone: affiliate.phone.trim(),
        coupon_id: couponRef.id,
        coupon_code: code,
        commission_type: commissionType,
        commission_value: commissionValue,
        is_active: true,
        created_at: now,
      })
      transaction.set(roleRef, {
        ...existingRoleData,
        role: existingRoleData.role || 'affiliate',
        roles: Array.from(roleNames),
        affiliate_id: affiliateUser.uid,
        coupon_id: couponRef.id,
        email: email,
        created_at: existingRoleData.created_at || now,
        updated_at: now,
      }, { merge: true })
    })

    return {
      coupon_id: couponRef.id,
      affiliate_id: affiliateUser.uid,
      reused_existing_account: !createdAffiliateUser,
    }
  } catch (error) {
    if (affiliateUser && createdAffiliateUser) {
      await adminAuth.deleteUser(affiliateUser.uid).catch(function(cleanupError) {
        console.error('[affiliate] Failed to remove account after coupon creation failure:', cleanupError)
      })
    }
    if (error instanceof HttpsError) throw error
    if (error && error.code === 'auth/invalid-email') {
      throw new HttpsError('invalid-argument', 'The affiliate email address is not valid.')
    }
    if (error && (error.code === 'auth/weak-password' ||
        error.code === 'auth/password-does-not-meet-requirements')) {
      throw new HttpsError('invalid-argument', 'The affiliate password does not meet the Firebase password policy.')
    }
    console.error('[affiliate] Coupon/account creation failed:', {
      operation: operation,
      code: error && error.code,
      message: error && error.message,
      error: error,
    })
    throw new HttpsError(
      'internal',
      'Unable to create the affiliate coupon. Please try again.',
      {
        operation: operation,
        causeCode: error && error.code ? String(error.code) : 'unknown',
      }
    )
  }
})

async function writeAffiliateOrderAnalytics(orderId, order) {
  const analyticsRef = db.collection('affiliate_order_analytics').doc(orderId)
  const existingAnalytics = await analyticsRef.get()
  let attribution = existingAnalytics.exists ? existingAnalytics.data() : null

  if (!attribution && typeof order.coupon_code === 'string' && order.coupon_code.trim()) {
    const couponSnap = await db.collection('coupons')
      .where('code', '==', order.coupon_code.trim().toUpperCase())
      .limit(1)
      .get()
    if (couponSnap.empty) return false

    const coupon = couponSnap.docs[0].data()
    if (!coupon.affiliate_id) return false
    const profileSnap = await db.collection('affiliate_profiles').doc(coupon.affiliate_id).get()
    if (!profileSnap.exists) return false
    const profile = profileSnap.data()
    attribution = {
      affiliate_id: profile.uid,
      coupon_id: profile.coupon_id,
      coupon_code: profile.coupon_code,
      commission_type: profile.commission_type,
      commission_value: Number(profile.commission_value),
    }
  }

  if (!attribution) return false

  const items = Array.isArray(order.items) ? order.items : []
  const products = items.map(function(item) {
    return {
      product_id: String(item.product_id || ''),
      name: String(item.name || 'Unnamed product'),
      price: Math.max(0, Number(item.price) || 0),
      quantity: Math.max(0, Number(item.quantity) || 0),
      image: null,
    }
  })
  const quantity = products.reduce(function(sum, item) { return sum + item.quantity }, 0)
  const productSubtotal = products.reduce(function(sum, item) {
    return sum + item.price * item.quantity
  }, 0)
  const normalizedStatus = String(order.status || 'confirmed').toLowerCase()
  const isCancelled = normalizedStatus === 'cancelled' || normalizedStatus === 'canceled'
  const commission = isCancelled ? 0 : attribution.commission_type === 'percentage'
    ? productSubtotal * attribution.commission_value / 100
    : attribution.commission_value

  await analyticsRef.set({
    affiliate_id: attribution.affiliate_id,
    coupon_id: attribution.coupon_id,
    coupon_code: attribution.coupon_code,
    commission_type: attribution.commission_type,
    commission_value: attribution.commission_value,
    order_id: orderId,
    order_number: String(order.order_number || orderId),
    status: normalizedStatus,
    created_at: order.created_at || Timestamp.now(),
    customer_name: String(
      order.guest_name || (order.shipping_address && order.shipping_address.name) || 'Customer'
    ),
    customer_email: String(order.guest_email || order.customer_email || ''),
    customer_phone: String(
      order.guest_phone || (order.shipping_address && order.shipping_address.phone) || ''
    ),
    customer_id: String(order.user_id || order.guest_email || order.customer_email || orderId),
    products: products,
    product_quantity: quantity,
    product_subtotal: productSubtotal,
    commission_earned: Math.round((commission + Number.EPSILON) * 100) / 100,
    updated_at: Timestamp.now(),
  })
  return true
}

exports.syncAffiliateOrderAnalytics = onDocumentWritten(
  { document: 'orders/{orderId}', database: 'festecart', region: 'asia-south1' },
  async function(event) {
    const orderId = event.params.orderId
    const analyticsRef = db.collection('affiliate_order_analytics').doc(orderId)
    const orderSnapshot = await db.collection('orders').doc(orderId).get()

    if (!orderSnapshot.exists) {
      await analyticsRef.delete()
      return
    }

    await writeAffiliateOrderAnalytics(orderId, orderSnapshot.data())
  }
)

exports.rebuildAffiliateCouponAnalytics = onCall(async function(request) {
  await requireSuperAdmin(request)
  const couponId = request.data && request.data.coupon_id
  if (typeof couponId !== 'string' || !couponId.trim()) {
    throw new HttpsError('invalid-argument', 'A coupon ID is required.')
  }

  const couponSnapshot = await db.collection('coupons').doc(couponId).get()
  if (!couponSnapshot.exists) {
    throw new HttpsError('not-found', 'The selected coupon was not found.')
  }
  const coupon = couponSnapshot.data()
  if (!coupon.affiliate_id || typeof coupon.code !== 'string' || !coupon.code.trim()) {
    throw new HttpsError('failed-precondition', 'The selected coupon is not linked to an affiliate.')
  }

  const baseQuery = db.collection('orders')
    .where('coupon_code', '==', coupon.code.trim().toUpperCase())
    .orderBy(FieldPath.documentId())
    .limit(200)
  let lastDocument = null
  let ordersProcessed = 0
  while (true) {
    const pageQuery = lastDocument ? baseQuery.startAfter(lastDocument) : baseQuery
    const page = await pageQuery.get()
    if (page.empty) break

    const results = await Promise.all(page.docs.map(function(orderDocument) {
      return writeAffiliateOrderAnalytics(orderDocument.id, orderDocument.data())
    }))
    ordersProcessed += results.filter(Boolean).length
    if (page.size < 200) break
    lastDocument = page.docs[page.docs.length - 1]
  }

  return { orders_processed: ordersProcessed }
})
