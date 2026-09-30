// Festecart order email webhook.
// In Apps Script Project Settings > Script Properties, add:
//   SPREADSHEET_ID = your Google Sheet ID
//   WEBHOOK_TOKEN = the same long random token configured in Firebase Functions
// Deploy as a Web app, execute as yourself, and allow access to anyone.
// This script contains the existing admin and customer HTML templates.

const SHEET_NAME = 'Order Emails';
const SENDER_NAME = 'Festecart';
const ADMIN_EMAIL = 'festecartdesi@gmail.com';
const ADMIN_URL = 'https://admin.festecart.org';
const LOGO_URL = 'https://admin.festecart.org/logo.png';
const HEADERS = [
  'Received At',
  'Order ID',
  'Order Number',
  'Customer Name',
  'Customer Email',
  'Order Total',
  'Payment Method',
  'Recipients',
  'Email Delivery Status',
  'Order Details JSON',
];

function doPost(e) {
  try {
    const properties = PropertiesService.getScriptProperties();
    const expectedToken = properties.getProperty('WEBHOOK_TOKEN');
    const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
    if (!expectedToken || !spreadsheetId) {
      throw new Error('Set SPREADSHEET_ID and WEBHOOK_TOKEN in Script Properties.');
    }

    const payload = JSON.parse(e.postData.contents || '{}');
    if (payload.token !== expectedToken) {
      return jsonResponse({ ok: false, error: 'Unauthorized request.' });
    }

    const order = payload.order || {};
    const emails = Array.isArray(payload.emails)
      ? payload.emails
      : buildConfirmationEmails(order, payload.invoicePdfBase64);
    if (!emails.length || emails.length > 2) {
      throw new Error('Expected one or two email messages.');
    }

    const customerEmail = order.customer_email || order.guest_email || '';
    const address = order.shipping_address || {};
    const customerName = order.guest_name || address.name || 'Customer';
    const sheet = getOrderSheet(spreadsheetId);
    const rowNumber = sheet.getLastRow() + 1;
    const recipientList = emails.map(function(message) { return message.to; }).join(', ');
    const orderDetails = JSON.stringify(order);

    sheet.appendRow([
      new Date(),
      safeSheetValue(order.id || ''),
      safeSheetValue(order.order_number || ''),
      safeSheetValue(customerName),
      safeSheetValue(customerEmail),
      Number(order.total || 0),
      safeSheetValue(order.payment_method || ''),
      safeSheetValue(recipientList),
      'Sending',
      safeSheetValue(orderDetails),
    ]);

    const outcomes = [];
    emails.forEach(function(message) {
      try {
        sendHtmlEmail(message);
        outcomes.push({ kind: message.kind || 'notification', to: message.to, ok: true });
      } catch (error) {
        outcomes.push({ kind: message.kind || 'notification', to: message.to, ok: false, error: error.message });
      }
    });

    const deliveryStatus = outcomes.map(function(result) {
      return (result.kind + ': ' + (result.ok ? 'sent' : 'failed'));
    }).join('; ');
    sheet.getRange(rowNumber, 9).setValue(deliveryStatus);

    const allSent = outcomes.every(function(result) { return result.ok; });
    return jsonResponse({ ok: allSent, results: outcomes });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  }
}

function sendHtmlEmail(message) {
  if (!message || !message.to || !message.subject || !message.html) {
    throw new Error('Email message is missing to, subject, or html.');
  }

  const options = {
    htmlBody: message.html,
    name: SENDER_NAME,
  };
  const attachments = (message.attachments || []).map(function(attachment) {
    if (!attachment.content) throw new Error('Email attachment content is missing.');
    return Utilities.newBlob(
      Utilities.base64Decode(attachment.content),
      attachment.contentType || 'application/octet-stream',
      attachment.filename || 'attachment'
    );
  });
  if (attachments.length) options.attachments = attachments;

  MailApp.sendEmail(message.to, message.subject, 'Please view this email in an HTML-compatible email client.', options);
}

function buildConfirmationEmails(order, invoicePdfBase64) {
  const orderNumber = order.order_number || '—';
  const orderId = order.id || '';
  const adminLink = orderId ? ADMIN_URL + '/orders/' + orderId : ADMIN_URL + '/orders';
  const messages = [{
    to: ADMIN_EMAIL,
    subject: 'New Order ' + orderNumber + ' — Festecart',
    html: buildAdminOrderEmail(order, adminLink),
    kind: 'admin',
  }];
  const customerEmail = order.customer_email || order.guest_email || '';

  if (customerEmail && customerEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    const customerMessage = {
      to: customerEmail,
      subject: 'Order Confirmed — Festecart (#' + orderNumber + ')',
      html: buildCustomerConfirmationEmail(order),
      kind: 'customer',
    };
    if (invoicePdfBase64) {
      customerMessage.attachments = [{
        filename: 'Invoice-' + orderNumber + '.pdf',
        content: invoicePdfBase64,
        contentType: 'application/pdf',
      }];
    }
    messages.push(customerMessage);
  }
  return messages;
}

function fmtInr(value) {
  return '\u20B9\u00a0' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function buildAdminOrderEmail(order, linkHref) {
  const orderNum = order.order_number || '—';
  const addr = order.shipping_address || null;
  const items = order.items || [];
  const total = Number(order.total || 0);
  const shipping = Number(order.shipping_charge || 0);
  const custName = order.guest_name || (addr && addr.name) || 'Customer';
  const custEmail = order.customer_email || order.guest_email || '';
  const phone = order.guest_phone || (addr && addr.phone) || '';
  const payment = order.payment_method === 'self_pickup' ? 'Self Pickup'
    : order.payment_method === 'cod' ? 'Cash on Delivery'
    : (order.payment_method || '').toUpperCase();
  const couponCode = order.coupon_code || null;
  const couponDiscount = Number(order.coupon_discount || 0);
  const addrName = (addr && addr.name) || custName;
  const addrStreet = (addr && addr.address) || '';
  const addrCity = (addr && addr.city) || '';
  const addrState = (addr && addr.state) || '';
  const addrPin = (addr && addr.pincode) || '';

  function addrCol(title, border) {
    return '<td width="50%" style="padding:14px 16px;vertical-align:top;' + (border ? 'border-right:1px solid #d9d9d9;' : '') + '">'
      + '<p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#000;">' + title + '</p>'
      + '<p style="margin:0;font-size:13px;font-weight:bold;color:#111;">' + addrName + '</p>'
      + (addrStreet ? '<p style="margin:2px 0 0;font-size:12px;color:#444;">' + addrStreet + ' ,</p>' : '')
      + (addrCity ? '<p style="margin:2px 0 0;font-size:12px;color:#444;">' + addrCity + ', ' + addrState + ', India,</p>' : '')
      + (addrState ? '<p style="margin:2px 0 0;font-size:12px;color:#444;">' + addrState + ', India - ' + addrPin + '</p>' : '')
      + (phone ? '<p style="margin:10px 0 0;font-size:12px;color:#333;">&#128222; <a href="tel:' + phone + '" style="color:#333;text-decoration:none;">' + phone + '</a></p>' : '')
      + '</td>';
  }

  const itemRows = items.map(function(item) {
    const quantity = item.quantity || 1;
    const price = Number(item.price || 0);
    const image = (item.image && item.image.indexOf('http') === 0)
      ? '<img src="' + item.image + '" width="72" height="72" style="width:72px;height:72px;object-fit:cover;display:block;border:1px solid #e0e0e0;" />'
      : '<div style="width:72px;height:72px;background:#f0f0f0;display:inline-block;border:1px solid #e0e0e0;"></div>';
    return '<tr>'
      + '<td style="padding:10px 8px;border:1px solid #d9d9d9;vertical-align:top;">'
      + '<table cellpadding="0" cellspacing="0" width="100%"><tr>'
      + '<td style="width:82px;vertical-align:top;padding-right:10px;">' + image + '</td>'
      + '<td style="vertical-align:top;">'
      + '<p style="margin:0;font-size:13px;font-weight:bold;color:#111;line-height:1.3;">' + (item.name || '—') + '</p>'
      + '<p style="margin:4px 0 0;font-size:12px;color:#555;">Price: &#8377; ' + price.toLocaleString('en-IN') + '</p>'
      + '<p style="margin:2px 0 0;font-size:12px;color:#555;">Qty: ' + quantity + '</p>'
      + '</td></tr>'
      + '<tr><td colspan="2" style="padding-top:5px;font-size:11px;color:#999;">HSN: 0000 - CGST 0% - SGST 0%</td></tr>'
      + '</table></td>'
      + '<td style="padding:10px 8px;text-align:right;vertical-align:top;border:1px solid #d9d9d9;font-size:13px;color:#111;white-space:nowrap;">&#8377; ' + (price * quantity).toLocaleString('en-IN') + '</td>'
      + '<td style="padding:10px 8px;text-align:center;vertical-align:top;border:1px solid #d9d9d9;font-size:12px;color:#555;white-space:nowrap;">&#8377; 0<br/>&#8377; 0</td>'
      + '<td style="padding:10px 8px;text-align:right;vertical-align:top;border:1px solid #d9d9d9;font-size:13px;font-weight:bold;color:#111;white-space:nowrap;">&#8377; ' + (price * quantity).toLocaleString('en-IN') + '</td>'
      + '</tr>';
  }).join('');

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
    + '</body></html>';
}

function buildCustomerConfirmationEmail(order) {
  const orderNum = order.order_number || '—';
  const custName = order.guest_name || (order.shipping_address && order.shipping_address.name) || 'Customer';
  const total = Number(order.total || 0);
  const shipping = Number(order.shipping_charge || 0);
  const subtotal = (order.items || []).reduce(function(sum, item) {
    return sum + Number(item.price || 0) * (item.quantity || 1);
  }, 0);
  const payment = order.payment_method === 'self_pickup' ? 'Self Pickup'
    : order.payment_method === 'cod' ? 'Cash on Delivery'
    : (order.payment_method || '').toUpperCase();
  const items = order.items || [];
  const couponCode = order.coupon_code || null;
  const couponDiscount = Number(order.coupon_discount || 0);
  const itemRows = items.map(function(item) {
    const quantity = item.quantity || 1;
    const price = Number(item.price || 0);
    const image = (item.image && item.image.indexOf('http') === 0)
      ? '<img src="' + item.image + '" width="56" height="56" style="width:56px;height:56px;object-fit:cover;border-radius:6px;display:block;" />'
      : '<div style="width:56px;height:56px;background:#f3f4f6;border-radius:6px;"></div>';
    return '<tr>'
      + '<td style="padding:12px 0;border-bottom:1px solid #f0f0f0;vertical-align:middle;">'
      + '<table cellpadding="0" cellspacing="0"><tr>'
      + '<td style="padding-right:14px;vertical-align:middle;">' + image + '</td>'
      + '<td style="vertical-align:middle;">'
      + '<p style="margin:0;font-size:14px;font-weight:600;color:#111;">' + (item.name || '—') + '</p>'
      + '<p style="margin:3px 0 0;font-size:12px;color:#777;">Qty: ' + quantity + ' &nbsp;&bull;&nbsp; &#8377; ' + price.toLocaleString('en-IN') + ' each</p>'
      + '</td></tr></table></td>'
      + '<td style="padding:12px 0 12px 16px;border-bottom:1px solid #f0f0f0;text-align:right;vertical-align:middle;font-size:14px;font-weight:600;color:#111;white-space:nowrap;">&#8377; ' + (price * quantity).toLocaleString('en-IN') + '</td>'
      + '</tr>';
  }).join('');

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
    + '</table></td></tr></table></body></html>';
}

function getOrderSheet(spreadsheetId) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function authorizeFestecartEmail() {
  const properties = PropertiesService.getScriptProperties();
  getOrderSheet(properties.getProperty('SPREADSHEET_ID'));
  MailApp.getRemainingDailyQuota();
}

function safeSheetValue(value) {
  const text = String(value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
