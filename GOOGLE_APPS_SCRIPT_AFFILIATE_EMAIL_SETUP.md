# Affiliate Coupon Email Setup

Affiliate coupon creation and Firebase storage continue to use the existing application flow. After that succeeds, the admin app submits the affiliate's login details, coupon, and commission to a **separate** Google Apps Script web app. This script uses a separate Affiliate Emails spreadsheet and does not read or write the orders sheet.

## 1. Create a separate Google Sheet

1. Create a new Google Sheet for affiliate emails. Do not use the orders spreadsheet.
2. Copy the spreadsheet ID from its URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`.
3. Keep access to this sheet limited to trusted administrators. It records affiliate email addresses and coupon/commission details; it never stores passwords.

## 2. Create and authorize the Apps Script

1. From the new spreadsheet, open **Extensions > Apps Script**. This creates a separate script project.
2. Replace the editor contents with [`scripts/google-apps-script/affiliate/Code.gs`](scripts/google-apps-script/affiliate/Code.gs), then save.
3. Open **Project Settings > Script Properties** and add:

   | Property | Value |
   | --- | --- |
   | `SPREADSHEET_ID` | ID of the new affiliate spreadsheet |
   | `FIREBASE_PROJECT_ID` | Firebase project ID used by this admin app |
   | `FIRESTORE_DATABASE_ID` | `festecart` |
   | `SHEET_NAME` | `Affiliate Emails` (optional; this is the default) |

4. In the Apps Script editor, select and run `authorizeAffiliateEmail`. Approve the spreadsheet, email, and external-request permissions.
5. Choose **Deploy > New deployment > Web app**. Set **Execute as** to your account and **Who has access** to **Anyone**. Deploy and copy the URL ending in `/exec`.

The web app is callable publicly because it must receive requests from the admin browser. It does **not** trust a client-side shared secret: for each request it validates the Firebase ID token against the `user_roles/{uid}` document in the `festecart` Firestore database and accepts only `super_admin`. The spreadsheet and script should remain restricted to trusted administrators.

## 3. Configure and publish the admin app

Add the deployed URL to the frontend build environment:

```env
VITE_AFFILIATE_EMAIL_WEBHOOK_URL=https://script.google.com/macros/s/AKfycbweMLKBuydfYkMurT03Wh01b2Ob0IEuwnYLnJcDNogYJ76kI6vwtOBrJm6bdFhoSrVzMg/exec
```

Rebuild and deploy the admin app after setting this variable. No Firebase Functions changes, Firebase data changes, or changes to the existing order-email integration are needed.

## 4. Verify delivery

1. Create an affiliate coupon from the admin app.
2. The success screen reports that the email request was submitted. Because Google Apps Script does not provide browser-readable CORS responses, the browser cannot confirm the final mail result.
3. Check the `Email Delivery Status` column in the **Affiliate Emails** sheet. It will show `Sent` or `Failed`; failed rows include the error and may be retried from the coupon-created screen.
4. The script deduplicates successful requests by coupon ID so retries do not send a second email after an acknowledged delivery.

The email contains the affiliate's email, login URL, coupon code, and commission. A temporary password is included only when this flow created a new Firebase account; an existing account's password is not available to the app and is never changed. Temporary passwords are sent by email only and are not written to the spreadsheet. For stronger credential security, use a password-reset/set-password link instead of sending a temporary password.

## Email and quota notes

The Apps Script owner is the email sender. Google account quotas and sending policies apply. Monitor the delivery-status column and Apps Script **Executions** for failures. The email template is responsive, branded, and includes a plain-text alternative; all dynamic HTML fields are escaped before rendering.
