# Google Apps Script Order Email Setup

Firebase remains the order database. On order confirmation, the Firebase Function forwards the order and generated invoice PDF to Apps Script. Apps Script renders the existing admin and customer HTML, appends order details to the Google Sheet, and sends both emails through the Google account that owns the script.

## Apps Script

1. Create or open the Google Sheet that should receive order details. Copy the spreadsheet ID from its URL (`/spreadsheets/d/{ID}/edit`).
2. Create an Apps Script project and paste the contents of [`scripts/google-apps-script/Code.gs`](scripts/google-apps-script/Code.gs) into `Code.gs`.
3. In **Project Settings > Script Properties**, add `SPREADSHEET_ID` and `WEBHOOK_TOKEN`. Use a long random token, and keep it private.
4. Run `authorizeFestecartEmail` once from the editor and approve the requested spreadsheet and mail permissions.
5. Deploy as a **Web app**, executing as your account, with access available to **Anyone**. The shared token protects the endpoint. The configured deployment URL is `https://script.google.com/macros/s/AKfycbxnq3FedbLxZ1ficbJTFD1kEOufULtvDX8SaXes8uzzCuvPSsJETUCvKunPVaAgQ-4m/exec`.

The existing admin and customer HTML templates are included in `scripts/google-apps-script/Code.gs`, ready to paste into Apps Script.

## Firebase Functions

Select the Festecart Firebase project in the CLI, then set the same token configured in Apps Script and deploy the Function:

```sh
firebase functions:secrets:set GOOGLE_APPS_SCRIPT_TOKEN
firebase deploy --only functions
```

The Firebase CLI prompts for the token. This workspace's Firebase CLI account currently has no Festecart project selected; select the correct project with `firebase use YOUR_FESTECART_PROJECT_ID` before setting the secret and deploying. Do not put the token in a `VITE_` variable or frontend code.

If the legacy Supabase Edge Function is also deployed, set the same values as Supabase function secrets and redeploy `send-order-email`:

```sh
supabase secrets set GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbxnq3FedbLxZ1ficbJTFD1kEOufULtvDX8SaXes8uzzCuvPSsJETUCvKunPVaAgQ-4m/exec GOOGLE_APPS_SCRIPT_TOKEN=YOUR_SHARED_TOKEN
supabase functions deploy send-order-email
```
