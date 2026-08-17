'use strict'
const { onRequest } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const { initializeApp } = require('firebase-admin/app')
const { Resend } = require('resend')
const PDFDocument = require('pdfkit')

initializeApp()
setGlobalOptions({ region: 'us-central1' })

const FROM_EMAIL = 'Festecart <noreply@festecart.org>'
const LOGO_URL   = 'https://admin.festecart.org/logo.png'
const ADMIN_URL  = 'https://admin.festecart.org'
const ADMIN_EMAIL = 'festecartdesi@gmail.com'

const STORE_NAME    = 'festecart'
const STORE_ADDRESS = 'No-204 , 2nd Floor, Surya Prema Building, 1st Cross Rd, Manjunatha nagar, Raghuvanahalli, Bengaluru, Karnataka 560109'
const STORE_GSTIN   = '29AFFF S9227M1Z7'

// ── helpers ──────────────────────────────────────────────────────
function fmtInr(n) {
  return '\u20B9\u00a0' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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
    var couponDiscount = Number(order.coupon_discount || 0)
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
    var colW = 150

    // Shipping Address
    doc.fontSize(9).font('Helvetica-Bold').text('Shipping Address', 40, rowY)
    doc.font('Helvetica').fontSize(8)
    var saLines = [addr.name, addr.address, addr.city + ', ' + addr.state + ', India,', addr.state + ', India - ' + addr.pincode, 'Phone: ' + (addr.phone || '')].filter(Boolean)
    saLines.forEach(function(l) { doc.text(l, 40) })

    // Billing Address (same as shipping)
    doc.fontSize(9).font('Helvetica-Bold').text('Billing Address', 200, rowY)
    doc.font('Helvetica').fontSize(8)
    var currY2 = rowY + 12
    saLines.forEach(function(l) { doc.text(l, 200, currY2); currY2 += 10 })

    // Order meta (right)
    doc.fontSize(9).font('Helvetica-Bold').text('Order Date: ', 400, rowY, { continued: true }).font('Helvetica').text(todayStr())
    doc.font('Helvetica-Bold').text('Order No. ', 400, rowY + 12, { continued: true }).font('Helvetica').text(orderNum)
    doc.font('Helvetica-Bold').text('Email: ', 400, rowY + 24, { continued: true }).font('Helvetica').text(custEmail || '—', { width: 140 })

    doc.y = rowY + Math.max(saLines.length * 10 + 20, 60)
    doc.moveDown(0.5)

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
  var couponDiscount = Number(order.coupon_discount || 0)
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
  var couponDiscount = Number(order.coupon_discount || 0)

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


// ── doSendEmail ──────────────────────────────────────────────────
// Sends two emails on every confirmed order:
//   1. Admin notification  → festecartdesi@gmail.com (admin template)
//   2. Customer confirmation → customer email (customer template + PDF invoice)
// Only fires for 'confirmed' status — all other statuses are ignored.
async function doSendEmail(order, new_status) {
  if (new_status !== 'confirmed') {
    console.log('[email] status "' + new_status + '" — no email sent (only confirmed triggers emails)')
    return { skipped: true }
  }

  var orderId      = order.id || null
  var orderNum     = order.order_number || '—'
  var customerEmail = order.customer_email || order.guest_email || null
  var resend       = new Resend(process.env.RESEND_API_KEY)

  // ── 1. Admin notification ────────────────────────────────────
  var adminLink    = orderId ? (ADMIN_URL + '/orders/' + orderId) : (ADMIN_URL + '/orders')
  var adminHtml    = buildAdminOrderEmail(order, adminLink)
  var adminSubject = 'New Order ' + orderNum + ' — Festecart'

  try {
    var adminResult = await resend.emails.send({
      from:    FROM_EMAIL,
      to:      ADMIN_EMAIL,
      subject: adminSubject,
      html:    adminHtml,
    })
    console.log('[email] admin notification ' + orderNum + ' -> ' + ADMIN_EMAIL + ':', adminResult)
  } catch (adminErr) {
    console.error('[email] admin notification failed:', adminErr)
  }

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
    }

    var customerHtml    = buildCustomerConfirmationEmail(order)
    var customerSubject = 'Order Confirmed — Festecart (#' + orderNum + ')'

    try {
      var custResult = await resend.emails.send({
        from:        FROM_EMAIL,
        to:          customerEmail,
        subject:     customerSubject,
        html:        customerHtml,
        attachments: pdfBase64 ? [{
          filename:    'Invoice-' + orderNum + '.pdf',
          content:     pdfBase64,
          contentType: 'application/pdf',
        }] : [],
      })
      console.log('[email] customer confirmation ' + orderNum + ' -> ' + customerEmail + ':', custResult)
      return custResult
    } catch (custErr) {
      console.error('[email] customer confirmation failed:', custErr)
    }
  }

  return { ok: true }
}

// ── HTTP endpoint ────────────────────────────────────────────────
exports.sendOrderEmail = onRequest({ cors: true, secrets: ['RESEND_API_KEY'] }, async function(req, res) {
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
