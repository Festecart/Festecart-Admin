# WhatsApp Order Confirmation via Google Sheets

This flow uses a Google Apps Script time trigger to read newly created orders from the existing Firestore database, append each order once to a dedicated Google Sheet, and send the approved Payperwa template. It does not use Firebase Functions and does not expose the Payperwa API key to the website.

The trigger runs once per minute, so a confirmation may take up to about a minute after order placement. The order must have `whatsapp_opt_in: true`. The admin app's Add Order form records this consent. The separate customer checkout source at `scripts/CheckoutPage.tsx` is not part of this admin app's Vite build or routes, so adding a checkbox there does not update a deployed storefront by itself. Integrate and deploy the consent field in the actual storefront before expecting customer checkout orders to send; without it, those orders are skipped.

## 1. Prepare Payperwa

The approved template must have exactly five body variables in this order:

1. Customer name
2. Order number
3. Product names and quantities, for example `Gift Box x 2, Candle x 1`
4. Payment mode
5. Order total, for example `INR 1,299.00`

The worker reads the order total from the Firestore `total` field, stores it in the Sheet's `Order Amount` column, and sends it as the fifth template variable. The amount is the order grand total, not a calculated outstanding balance. Prefer template wording such as `Order total: {{5}}`; for an unpaid-only message, ensure the template wording matches which payment statuses are eligible.

The default template name is `order_confirmation` and language is `en`. The template name and language are configurable through Script Properties. Update the approved Payperwa template to include the fifth variable and obtain approval before enabling this payload. Set the variable order to match your approved template exactly.

## 2. Create the Sheet and Apps Script

1. Create a new Google Sheet and copy its spreadsheet ID from its URL.
2. Create a standalone Apps Script project and paste [`scripts/google-apps-script/whatsapp/Code.gs`](scripts/google-apps-script/whatsapp/Code.gs) into `Code.gs`.
3. In **Project Settings > Script Properties**, add the properties below. Keep the Apps Script project access limited to trusted operators.

| Property | Value |
| --- | --- |
| `SPREADSHEET_ID` | ID of the new Google Sheet |
| `FIREBASE_PROJECT_ID` | Firebase project ID used by the storefront |
| `FIRESTORE_DATABASE_ID` | `festecart` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON key for a service account in that Firebase project |
| `PAYPERWA_API_KEY` | Payperwa API key; never put this in the website or sheet |
| `PAYPERWA_CHANNEL_ID` | Optional Payperwa channel ID for multi-WABA accounts |
| `PAYPERWA_TEMPLATE_NAME` | `order_confirmation` or the exact approved template name |
| `PAYPERWA_LANGUAGE` | `en` or the exact approved template language code |

Create a Google Cloud service account in the Firebase project's Google Cloud project, enable the Cloud Firestore API, and grant the account the **Cloud Datastore Viewer** role. Create a JSON key and store its complete contents in `FIREBASE_SERVICE_ACCOUNT_JSON`. This is a private credential; do not commit it or put it in a Sheet cell.

## 3. Authorize and Start the Trigger

1. In the Apps Script editor, select and run `initializeWhatsAppOrderAutomation` once.
2. Approve access to the Sheet, external URL requests, and time-driven triggers.
3. The script creates the `WhatsApp Orders` tab and a one-minute trigger. It starts scanning from approximately three minutes before setup; older orders are not intentionally backfilled.
4. Place a test order with WhatsApp opt-in checked and confirm the row and message status.

The Sheet tracks `PENDING`, `SENDING`, `SENT`, `FAILED`, skipped orders, and `NEEDS_REVIEW`. `FAILED` rows are not automatically retried; correct the issue and set the status back to `PENDING` only after confirming Payperwa did not already deliver the message. A stale `SENDING` row is moved to `NEEDS_REVIEW` to avoid accidental duplicate messages after an interrupted request.

## Operations and limitations

- A customer without opt-in, a valid Indian mobile number, an order number, or items is recorded as skipped and is not sent.
- Product summaries are capped at 800 characters. Keep the approved template suitable for that variable length and test multi-item orders.
- The Google Apps Script trigger has execution and URL-fetch quotas. This implementation sends up to 20 queued messages per run.
- The Firestore sync uses cursor-based pages of up to 1,000 orders and queues all matching orders before advancing its scan checkpoint.
- Payperwa's API documentation supplied for this integration does not describe an idempotency key. Rows left in `NEEDS_REVIEW` must be checked in Payperwa before manually retrying.
- The existing email notification workflow is unchanged; this WhatsApp flow does not call or deploy Firebase Functions.