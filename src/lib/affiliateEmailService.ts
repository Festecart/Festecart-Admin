import { auth } from '@/lib/firebase'

export interface AffiliateCouponEmail {
  couponId: string
  name: string
  email: string
  password: string | null
  loginUrl: string
  couponCode: string
  commissionType: 'flat' | 'percentage'
  commissionValue: number
}

export async function sendAffiliateCouponEmail(
  details: AffiliateCouponEmail
): Promise<void> {
  const endpoint = import.meta.env.VITE_AFFILIATE_EMAIL_WEBHOOK_URL
  if (!endpoint) {
    throw new Error('Affiliate email is not configured. Set VITE_AFFILIATE_EMAIL_WEBHOOK_URL and rebuild the app.')
  }

  const parsedEndpoint = new URL(endpoint)
  if (parsedEndpoint.protocol !== 'https:' ||
      parsedEndpoint.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[^/]+\/exec$/.test(parsedEndpoint.pathname)) {
    throw new Error('The affiliate email URL must be a deployed Google Apps Script web app URL.')
  }

  const user = auth.currentUser
  if (!user) throw new Error('Your admin session has expired. Sign in again before sending the affiliate email.')
  const idToken = await user.getIdToken()

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 20000)
  try {
    await fetch(parsedEndpoint.toString(), {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        couponId: details.couponId,
        name: details.name,
        email: details.email,
        password: details.password,
        loginUrl: details.loginUrl,
        couponCode: details.couponCode,
        commissionType: details.commissionType,
        commissionValue: details.commissionValue,
        idToken,
      }),
      signal: controller.signal,
    })
  } catch (failure) {
    if (controller.signal.aborted) {
      throw new Error('The email request timed out. Check the Affiliate Emails sheet before retrying.')
    }
    throw failure
  } finally {
    window.clearTimeout(timeoutId)
  }
}
