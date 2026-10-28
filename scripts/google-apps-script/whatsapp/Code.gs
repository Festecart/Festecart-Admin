const WHATSAPP_SHEET_NAME = 'WhatsApp Orders';
const WHATSAPP_HEADERS = [
  'Firestore Order ID',
  'Order Number',
  'Order Created At',
  'Customer Name',
  'WhatsApp Number',
  'Products and Quantities',
  'Payment Mode',
  'Opt-in',
  'Send Status',
  'Payperwa Message ID',
  'Attempts',
  'Last Attempt At',
  'Error',
  'Order Amount',
];
const PAYPERWA_SEND_URL = 'https://payperwa.com/api/v1/messages/send';
const MAX_MESSAGES_PER_RUN = 20;

function initializeWhatsAppOrderAutomation() {
  const properties = PropertiesService.getScriptProperties();
  const required = [
    'SPREADSHEET_ID',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'PAYPERWA_API_KEY',
    'PAYPERWA_TEMPLATE_NAME',
  ];
  const missing = required.filter(function(key) { return !properties.getProperty(key); });
  if (missing.length) throw new Error('Missing Script Properties: ' + missing.join(', '));

  const serviceAccount = JSON.parse(properties.getProperty('FIREBASE_SERVICE_ACCOUNT_JSON'));
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be a service account JSON key.');
  }

  const sheet = getWhatsAppSheet_();
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, WHATSAPP_HEADERS.length).setValues([WHATSAPP_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, WHATSAPP_HEADERS.length).setFontWeight('bold');
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    if (existingHeaders.indexOf('Order Amount') === -1) {
      const amountColumn = WHATSAPP_HEADERS.indexOf('Order Amount') + 1;
      sheet.getRange(1, amountColumn).setValue('Order Amount').setFontWeight('bold');
    }
  }

  if (!properties.getProperty('WHATSAPP_LAST_SCAN_AT')) {
    properties.setProperty('WHATSAPP_LAST_SCAN_AT', new Date(Date.now() - 3 * 60 * 1000).toISOString());
  }

  const exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === 'runWhatsAppOrderAutomation';
  });
  if (!exists) {
    ScriptApp.newTrigger('runWhatsAppOrderAutomation').timeBased().everyMinutes(1).create();
  }
}

function runWhatsAppOrderAutomation() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    const sheet = getWhatsAppSheet_();
    markStaleSendingRowsForReview_(sheet);
    syncNewOrdersToSheet_(sheet);
    sendPendingWhatsAppMessages_(sheet);
  } finally {
    lock.releaseLock();
  }
}

function syncNewOrdersToSheet_(sheet) {
  const properties = PropertiesService.getScriptProperties();
  const lastScan = new Date(properties.getProperty('WHATSAPP_LAST_SCAN_AT') || Date.now() - 5 * 60 * 1000);
  const scanFrom = new Date(lastScan.getTime() - 2 * 60 * 1000);
  const orders = fetchRecentOrders_(scanFrom);
  const seenOrderIds = getExistingOrderIds_(sheet);

  orders.forEach(function(order) {
    if (!order.id || seenOrderIds.has(order.id)) return;
    const values = orderToQueueRow_(order);
    sheet.appendRow(values);
    seenOrderIds.add(order.id);
  });

  properties.setProperty('WHATSAPP_LAST_SCAN_AT', new Date().toISOString());
}

function fetchRecentOrders_(fromDate) {
  const properties = PropertiesService.getScriptProperties();
  const projectId = properties.getProperty('FIREBASE_PROJECT_ID');
  const databaseId = properties.getProperty('FIRESTORE_DATABASE_ID') || 'festecart';
  const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(projectId) +
    '/databases/' + encodeURIComponent(databaseId) + '/documents:runQuery';
  const pageSize = 1000;
  const orders = [];
  let cursor = null;

  while (true) {
    const structuredQuery = {
      from: [{ collectionId: 'orders' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'created_at' },
          op: 'GREATER_THAN_OR_EQUAL',
          value: { timestampValue: fromDate.toISOString() },
        },
      },
      orderBy: [
        { field: { fieldPath: 'created_at' }, direction: 'ASCENDING' },
        { field: { fieldPath: '__name__' }, direction: 'ASCENDING' },
      ],
      limit: pageSize,
    };
    if (cursor) {
      structuredQuery.startAt = {
        values: [{ timestampValue: cursor.createdAt }, { referenceValue: cursor.documentName }],
        before: false,
      };
    }

    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + getFirestoreAccessToken_() },
      payload: JSON.stringify({ structuredQuery: structuredQuery }),
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
      throw new Error('Firestore query failed (' + response.getResponseCode() + '): ' + response.getContentText().slice(0, 500));
    }

    const documents = parseRunQueryResponse_(response.getContentText()).filter(function(result) {
      return result.document && result.document.name;
    }).map(function(result) { return result.document; });

    documents.forEach(function(document) {
      const id = document.name.split('/').pop();
      orders.push(Object.assign({ id: id }, decodeFirestoreMap_(document.fields || {})));
    });

    if (documents.length < pageSize) break;
    const lastDocument = documents[documents.length - 1];
    const createdAt = lastDocument.fields && lastDocument.fields.created_at;
    if (!createdAt || !createdAt.timestampValue) {
      throw new Error('Firestore order is missing a timestamp created_at field; refusing to advance the scan checkpoint.');
    }
    cursor = { createdAt: createdAt.timestampValue, documentName: lastDocument.name };
  }

  return orders;
}

function getFirestoreAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('firestore_access_token');
  if (cached) return cached;

  const serviceAccount = JSON.parse(PropertiesService.getScriptProperties().getProperty('FIREBASE_SERVICE_ACCOUNT_JSON'));
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64UrlEncode_(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsignedToken = header + '.' + claims;
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsignedToken, serviceAccount.private_key)
  ).replace(/=+$/, '');
  const assertion = unsignedToken + '.' + signature;
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion,
    },
    muteHttpExceptions: true,
  });
  const tokenData = JSON.parse(response.getContentText() || '{}');
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300 || !tokenData.access_token) {
    throw new Error('Could not authenticate to Firestore: ' + (tokenData.error_description || tokenData.error || response.getResponseCode()));
  }
  cache.put('firestore_access_token', tokenData.access_token, Math.min(Number(tokenData.expires_in) - 60, 3300));
  return tokenData.access_token;
}

function orderToQueueRow_(order) {
  const address = order.shipping_address || {};
  const phone = normalizeIndianPhone_(order.guest_phone || address.phone || '');
  const name = String(order.guest_name || address.name || 'Customer').trim().slice(0, 120);
  const orderNumber = String(order.order_number || '').trim().slice(0, 80);
  const orderAmount = formatOrderAmount_(order.total);
  const productSummary = (order.items || []).map(function(item) {
    return String(item.name || 'Item').trim() + ' x ' + Math.max(1, Number(item.quantity) || 1);
  }).join(', ').slice(0, 800);
  const paymentMode = formatPaymentMode_(order.payment_method);
  const optedIn = order.whatsapp_opt_in === true;
  let status = 'PENDING';
  let error = '';

  if (!optedIn) status = 'SKIPPED_NO_OPT_IN';
  else if (!phone) { status = 'SKIPPED_INVALID_PHONE'; error = 'Customer phone number is missing or invalid.'; }
  else if (!orderNumber || !productSummary || !orderAmount) { status = 'SKIPPED_INVALID_ORDER'; error = 'Order number, order items, or order total are missing or invalid.'; }

  return [
    String(order.id),
    safeSheetText_(orderNumber),
    order.created_at || '',
    safeSheetText_(name),
    phone,
    safeSheetText_(productSummary),
    safeSheetText_(paymentMode),
    optedIn ? 'YES' : 'NO',
    status,
    '',
    '0',
    '',
    safeSheetText_(error),
    safeSheetText_(orderAmount),
  ];
}

function formatOrderAmount_(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return '';
  return 'INR ' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sendPendingWhatsAppMessages_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 1, lastRow - 1, WHATSAPP_HEADERS.length).getValues();
  let attemptedThisRun = 0;

  values.forEach(function(row, index) {
    if (attemptedThisRun >= MAX_MESSAGES_PER_RUN || row[8] !== 'PENDING') return;
    attemptedThisRun += 1;
    const rowNumber = index + 2;
    const attempts = Number(row[10] || 0) + 1;
    sheet.getRange(rowNumber, 9, 1, 5).setValues([['SENDING', '', String(attempts), new Date().toISOString(), '']]);

    try {
      const result = sendPayperwaTemplate_(row);
      sheet.getRange(rowNumber, 9, 1, 5).setValues([[
        'SENT',
        safeSheetText_(result.messageId || ''),
        String(attempts),
        new Date().toISOString(),
        '',
      ]]);
    } catch (error) {
      const status = error && error.retryable === true ? 'FAILED' : 'NEEDS_REVIEW';
      sheet.getRange(rowNumber, 9, 1, 5).setValues([[
        status,
        '',
        String(attempts),
        new Date().toISOString(),
        safeSheetText_(String(error && error.message || error).slice(0, 500)),
      ]]);
    }
  });
}

function sendPayperwaTemplate_(row) {
  const properties = PropertiesService.getScriptProperties();
  const apiKey = properties.getProperty('PAYPERWA_API_KEY');
  const templateName = properties.getProperty('PAYPERWA_TEMPLATE_NAME');
  if (!row[13]) {
    throw new Error('Order amount is missing from the Sheet row. Verify the order total and update the Order Amount column before retrying.');
  }
  const body = {
    to: String(row[4]),
    template_name: templateName,
    language: properties.getProperty('PAYPERWA_LANGUAGE') || 'en',
    variables: [String(row[3]), String(row[1]), String(row[5]), String(row[6]), String(row[13])],
  };
  const headers = {
    Authorization: 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
  };
  const channelId = properties.getProperty('PAYPERWA_CHANNEL_ID');
  if (channelId) headers['X-Channel-Id'] = channelId;

  const response = UrlFetchApp.fetch(PAYPERWA_SEND_URL, {
    method: 'post',
    headers: headers,
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const responseCode = response.getResponseCode();
  const data = JSON.parse(response.getContentText() || '{}');
  if (responseCode >= 200 && responseCode < 300 && data.success === true) {
    return { messageId: data.data && data.data.message_id || '' };
  }

  const error = new Error(String(data.error || data.message || 'Payperwa rejected the message (HTTP ' + responseCode + ').').slice(0, 500));
  error.retryable = responseCode === 429 || responseCode >= 500;
  throw error;
}

function markStaleSendingRowsForReview_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = sheet.getRange(2, 9, lastRow - 1, 5).getValues();
  const staleBefore = Date.now() - 15 * 60 * 1000;
  values.forEach(function(row, index) {
    if (row[0] !== 'SENDING') return;
    const attemptDate = new Date(row[3]).getTime();
    if (Number.isFinite(attemptDate) && attemptDate < staleBefore) {
      sheet.getRange(index + 2, 9).setValue('NEEDS_REVIEW');
      sheet.getRange(index + 2, 13).setValue('Previous send attempt did not finish. Verify delivery before retrying.');
    }
  });
}

function getExistingOrderIds_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();
  return new Set(sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues().map(function(row) { return row[0]; }));
}

function getWhatsAppSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Set SPREADSHEET_ID in Script Properties.');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(WHATSAPP_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(WHATSAPP_SHEET_NAME);
  return sheet;
}

function normalizeIndianPhone_(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) digits = '91' + digits;
  else if (digits.length === 11 && digits.charAt(0) === '0') digits = '91' + digits.slice(1);
  return /^91[6-9]\d{9}$/.test(digits) ? digits : '';
}

function formatPaymentMode_(value) {
  const mode = String(value || '').toLowerCase();
  const labels = {
    cod: 'Cash on Delivery',
    online: 'Online Payment',
    upi: 'UPI',
    card: 'Card',
    neft: 'NEFT',
    bank_transfer: 'Bank Transfer',
    self_pickup: 'Self Pickup',
  };
  return labels[mode] || String(value || 'Not specified').slice(0, 80);
}

function parseRunQueryResponse_(content) {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    return content.split(/\r?\n/).filter(Boolean).map(function(line) { return JSON.parse(line); });
  }
}

function decodeFirestoreMap_(fields) {
  const result = {};
  Object.keys(fields).forEach(function(key) { result[key] = decodeFirestoreValue_(fields[key]); });
  return result;
}

function decodeFirestoreValue_(value) {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.nullValue !== undefined) return null;
  if (value.mapValue) return decodeFirestoreMap_(value.mapValue.fields || {});
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeFirestoreValue_);
  return null;
}

function base64UrlEncode_(value) {
  return Utilities.base64EncodeWebSafe(value).replace(/=+$/, '');
}

function safeSheetText_(value) {
  const text = String(value || '');
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}