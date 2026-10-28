const AFFILIATE_EMAIL_SHEET_NAME = 'Affiliate Emails';
const AFFILIATE_EMAIL_SENDER_NAME = 'Festecart Affiliates';
const AFFILIATE_LOGIN_URL = 'https://affiliate.festecart.com/';
const AFFILIATE_EMAIL_HEADERS = [
  'Received At',
  'Coupon ID',
  'Affiliate Name',
  'Affiliate Email',
  'Coupon Code',
  'Commission Type',
  'Commission Value',
  'Affiliate Login URL',
  'Account Setup',
  'Email Delivery Status',
  'Delivery Error',
];

function doPost(e) {
  let sheet = null;
  let rowNumber = null;
  let lock = null;

  try {
    const payload = JSON.parse(e && e.postData && e.postData.contents || '{}');
    const properties = PropertiesService.getScriptProperties();
    const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
    const projectId = properties.getProperty('FIREBASE_PROJECT_ID');
    const databaseId = properties.getProperty('FIRESTORE_DATABASE_ID') || 'festecart';

    if (!spreadsheetId || !projectId) {
      throw new Error('Set SPREADSHEET_ID and FIREBASE_PROJECT_ID in Script Properties.');
    }

    const affiliate = validateAffiliatePayload(payload);
    authorizeAdmin(payload.idToken, projectId, databaseId);

    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('Another affiliate email is being processed. Try again shortly.');

    sheet = getAffiliateEmailSheet(spreadsheetId, properties.getProperty('SHEET_NAME'));
    rowNumber = findCouponRow(sheet, affiliate.couponId);
    if (rowNumber) {
      const currentStatus = String(sheet.getRange(rowNumber, 10).getValue());
      if (currentStatus === 'Sent') {
        return jsonResponse({ ok: true, duplicate: true });
      }
      if (currentStatus === 'Sending') {
        const startedAt = sheet.getRange(rowNumber, 1).getValue();
        const isStale = startedAt instanceof Date &&
          Date.now() - startedAt.getTime() > 15 * 60 * 1000;
        if (!isStale) {
          return jsonResponse({ ok: false, error: 'This affiliate email is already being processed.' });
        }
      }
      sheet.getRange(rowNumber, 10, 1, 2).setValues([['Sending', '']]);
    } else {
      rowNumber = sheet.getLastRow() + 1;
      sheet.appendRow([
        new Date(),
        safeSheetText(affiliate.couponId),
        safeSheetText(affiliate.name),
        safeSheetText(affiliate.email),
        safeSheetText(affiliate.couponCode),
        affiliate.commissionType,
        affiliate.commissionValue,
        AFFILIATE_LOGIN_URL,
        affiliate.password ? 'New account' : 'Existing account',
        'Sending',
        '',
      ]);
    }

    try {
      MailApp.sendEmail(buildAffiliateEmail(affiliate));
      sheet.getRange(rowNumber, 10, 1, 2).setValues([['Sent', '']]);
      return jsonResponse({ ok: true });
    } catch (mailError) {
      const errorMessage = String(mailError && mailError.message || mailError).slice(0, 500);
      sheet.getRange(rowNumber, 10, 1, 2).setValues([['Failed', safeSheetText(errorMessage)]]);
      return jsonResponse({ ok: false, error: 'Email delivery failed. Check the Affiliate Emails sheet.' });
    }
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || String(error) });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function validateAffiliatePayload(payload) {
  const requiredText = ['couponId', 'name', 'email', 'couponCode'];
  requiredText.forEach(function(field) {
    if (typeof payload[field] !== 'string' || !payload[field].trim()) {
      throw new Error('Missing required affiliate email field: ' + field);
    }
  });

  const email = payload.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Affiliate email address is invalid.');
  }
  if (payload.couponId.length > 150 || payload.name.trim().length > 120 ||
      payload.couponCode.trim().length > 64) {
    throw new Error('Affiliate email details exceed the allowed length.');
  }
  if (payload.loginUrl !== AFFILIATE_LOGIN_URL) {
    throw new Error('Affiliate login URL is not allowed.');
  }
  if (payload.commissionType !== 'flat' && payload.commissionType !== 'percentage') {
    throw new Error('Commission type is invalid.');
  }

  const commissionValue = Number(payload.commissionValue);
  if (!Number.isFinite(commissionValue) || commissionValue <= 0 ||
      (payload.commissionType === 'percentage' && commissionValue > 100)) {
    throw new Error('Commission value is invalid.');
  }
  if (payload.password !== null &&
      (typeof payload.password !== 'string' || payload.password.length < 8 || payload.password.length > 128)) {
    throw new Error('Temporary password is invalid.');
  }

  return {
    couponId: payload.couponId.trim(),
    name: payload.name.trim(),
    email: email,
    password: payload.password,
    couponCode: payload.couponCode.trim(),
    commissionType: payload.commissionType,
    commissionValue: commissionValue,
  };
}

function authorizeAdmin(idToken, projectId, databaseId) {
  if (typeof idToken !== 'string' || !idToken) throw new Error('An active admin sign-in is required.');

  const tokenParts = idToken.split('.');
  if (tokenParts.length !== 3) throw new Error('The admin sign-in token is invalid.');
  let encodedPayload = tokenParts[1];
  while (encodedPayload.length % 4 !== 0) encodedPayload += '=';
  const tokenPayloadText = Utilities.newBlob(
    Utilities.base64DecodeWebSafe(encodedPayload)
  ).getDataAsString('UTF-8');
  const tokenPayload = JSON.parse(tokenPayloadText);
  if (tokenPayload.aud !== projectId ||
      tokenPayload.iss !== 'https://securetoken.google.com/' + projectId ||
      typeof tokenPayload.sub !== 'string' ||
      Number(tokenPayload.exp) <= Math.floor(Date.now() / 1000)) {
    throw new Error('The admin sign-in token is expired or belongs to a different Firebase project.');
  }

  const roleUrl = 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(projectId) + '/databases/' + encodeURIComponent(databaseId) +
    '/documents/user_roles/' + encodeURIComponent(tokenPayload.sub);
  const response = UrlFetchApp.fetch(roleUrl, {
    headers: { Authorization: 'Bearer ' + idToken },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Could not verify admin access. Sign in again or contact your administrator.');
  }

  const roleDocument = JSON.parse(response.getContentText());
  const fields = roleDocument.fields || {};
  const role = fields.role && fields.role.stringValue;
  const roles = fields.roles && fields.roles.arrayValue && fields.roles.arrayValue.values || [];
  const isSuperAdmin = role === 'super_admin' ||
    roles.some(function(value) { return value.stringValue === 'super_admin'; });
  if (!isSuperAdmin) throw new Error('Only a Festecart super admin can send affiliate emails.');
}

function getAffiliateEmailSheet(spreadsheetId, configuredSheetName) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheetName = configuredSheetName || AFFILIATE_EMAIL_SHEET_NAME;
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(AFFILIATE_EMAIL_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, AFFILIATE_EMAIL_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#312e81')
      .setFontColor('#ffffff');
  } else {
    const actualHeaders = sheet.getRange(1, 1, 1, AFFILIATE_EMAIL_HEADERS.length).getValues()[0];
    if (AFFILIATE_EMAIL_HEADERS.some(function(header, index) {
      return actualHeaders[index] !== header;
    })) {
      throw new Error('The Affiliate Emails sheet headers do not match the expected template.');
    }
  }
  return sheet;
}

function findCouponRow(sheet, couponId) {
  if (sheet.getLastRow() < 2) return null;
  const couponIds = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
  for (let index = 0; index < couponIds.length; index += 1) {
    if (String(couponIds[index][0]) === couponId) return index + 2;
  }
  return null;
}

function buildAffiliateEmail(affiliate) {
  const commission = affiliate.commissionType === 'flat'
    ? formatInr(affiliate.commissionValue) + ' per eligible order'
    : affiliate.commissionValue + '% of product subtotal';
  const passwordSection = affiliate.password
    ? '<p style="margin:0 0 8px;color:#475569"><strong>Temporary password</strong></p>' +
      '<p style="margin:0 0 20px;padding:14px 16px;background:#fff7ed;border:1px solid #fed7aa;' +
      'border-radius:8px;font-family:monospace;font-size:16px;letter-spacing:1px;color:#9a3412">' +
      escapeHtml(affiliate.password) + '</p>' +
      '<p style="margin:0 0 22px;color:#9a3412;font-size:13px">For your security, keep this password private and change it after signing in.</p>'
    : '<p style="margin:0 0 22px;color:#475569">Use your existing password to sign in. If you need help accessing your account, use the password reset option on the login page.</p>';
  const loginUrl = escapeHtml(AFFILIATE_LOGIN_URL);
  const name = escapeHtml(affiliate.name);
  const couponCode = escapeHtml(affiliate.couponCode);
  const email = escapeHtml(affiliate.email);
  const plainPassword = affiliate.password
    ? '\nTemporary password: ' + affiliate.password +
      '\nFor your security, keep this password private and change it after signing in.\n'
    : '\nSign in using your existing password. Use the password reset option on the login page if needed.\n';
  const htmlBody = '<div style="margin:0;padding:32px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">' +
    '<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">' +
    '<div style="padding:30px 32px;background:#312e81;color:#ffffff">' +
    '<p style="margin:0 0 10px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#c7d2fe">Festecart Partner Program</p>' +
    '<h1 style="margin:0;font-size:26px;line-height:1.3">Your affiliate coupon is ready</h1></div>' +
    '<div style="padding:30px 32px"><p style="margin:0 0 18px;font-size:16px">Hello ' + name + ',</p>' +
    '<p style="margin:0 0 24px;line-height:1.7;color:#475569">Welcome to the Festecart affiliate program. Your account and personal coupon are ready. Share your coupon with your audience and earn commission on eligible orders.</p>' +
    '<div style="margin:0 0 24px;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">' +
    '<p style="margin:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px">Your coupon code</p>' +
    '<p style="margin:0 0 18px;font-family:monospace;font-size:24px;font-weight:bold;letter-spacing:2px;color:#312e81">' + couponCode + '</p>' +
    '<p style="margin:0 0 6px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:1px">Your commission</p>' +
    '<p style="margin:0;font-size:18px;font-weight:bold;color:#047857">' + escapeHtml(commission) + '</p></div>' +
    '<h2 style="margin:0 0 14px;font-size:17px">Your account details</h2>' +
    '<p style="margin:0 0 8px;color:#475569"><strong>Email</strong>: ' + email + '</p>' +
    passwordSection +
    '<div style="margin:26px 0 22px;text-align:center"><a href="' + loginUrl + '" style="display:inline-block;padding:14px 24px;background:#4f46e5;border-radius:8px;color:#ffffff;text-decoration:none;font-weight:bold">Sign in to your affiliate account</a></div>' +
    '<p style="margin:0 0 22px;text-align:center;font-size:13px;color:#64748b">Or open: <a href="' + loginUrl + '" style="color:#4338ca">' + loginUrl + '</a></p>' +
    '<p style="margin:0;line-height:1.7;color:#475569">Thank you for partnering with Festecart. We look forward to growing together.</p>' +
    '<p style="margin:22px 0 0;line-height:1.6;color:#475569">Warm regards,<br><strong>Festecart Affiliate Team</strong></p></div>' +
    '<div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;line-height:1.6">This email contains account information intended for the named recipient. Please do not share your sign-in details.</div>' +
    '</div></div>';

  return {
    to: affiliate.email,
    subject: 'Your Festecart Affiliate Coupon and Account Details',
    body: 'Hello ' + affiliate.name + ',\n\nWelcome to the Festecart affiliate program.' +
      '\n\nCoupon code: ' + affiliate.couponCode +
      '\nCommission: ' + commission +
      '\nEmail: ' + affiliate.email + plainPassword +
      '\nSign in: ' + AFFILIATE_LOGIN_URL +
      '\n\nWarm regards,\nFestecart Affiliate Team',
    htmlBody: htmlBody,
    name: AFFILIATE_EMAIL_SENDER_NAME,
  };
}

function formatInr(value) {
  return '\u20B9' + Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function(character) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character];
  });
}

function safeSheetText(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorizeAffiliateEmail() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty('SPREADSHEET_ID');
  if (!spreadsheetId || !properties.getProperty('FIREBASE_PROJECT_ID')) {
    throw new Error('Set SPREADSHEET_ID and FIREBASE_PROJECT_ID in Script Properties first.');
  }
  SpreadsheetApp.openById(spreadsheetId);
  MailApp.getRemainingDailyQuota();
  return 'Affiliate email permissions authorized.';
}
