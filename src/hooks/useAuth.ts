import { useState, useEffect, useCallback } from 'react'
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { auth, db, doc, getDoc, setDoc, Timestamp } from '@/lib/firebase'

type UserRole = 'super_admin' | 'affiliate' | null

interface AuthState {
  user:    User | null
  session: User | null
  isAdmin: boolean
  isAffiliate: boolean
  role: UserRole
  affiliateId: string | null
  loading: boolean
  error:   string | null
}

// ── Super admin email — only this email can self-provision ─────────
const SUPER_ADMIN_EMAIL = 'festecartdesi@gmail.com'

async function getUserRole(user: User): Promise<{ role: UserRole; affiliateId: string | null }> {
  try {
    let snap = await getDoc(doc(db, 'user_roles', user.uid))

    if (!snap.exists() && user.email === SUPER_ADMIN_EMAIL) {
      await setDoc(doc(db, 'user_roles', user.uid), {
        role:       'super_admin',
        email:      user.email,
        created_at: Timestamp.now(),
      })
      console.log('[useAuth] Super admin role auto-provisioned for', user.email)
      snap = await getDoc(doc(db, 'user_roles', user.uid))
    }

    const roleData = snap.data()
    const roles = Array.isArray(roleData?.roles) ? roleData.roles : []
    const primaryRole = roleData?.role
    if (primaryRole === 'super_admin' || roles.includes('super_admin')) {
      return { role: 'super_admin', affiliateId: null }
    }
    if (primaryRole === 'affiliate' || roles.includes('affiliate')) {
      const affiliateId = roleData?.affiliate_id
      if (affiliateId !== user.uid) return { role: null, affiliateId: null }
      const profile = await getDoc(doc(db, 'affiliate_profiles', user.uid))
      if (profile.exists() && profile.data()?.is_active === true) {
        return { role: 'affiliate', affiliateId: user.uid }
      }
    }
    return { role: null, affiliateId: null }
  } catch (e) {
    console.error('[useAuth] Role check failed:', e)
    return { role: null, affiliateId: null }
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user:    null,
    session: null,
    isAdmin: false,
    isAffiliate: false,
    role: null,
    affiliateId: null,
    loading: true,
    error:   null,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({
          user: null, session: null, isAdmin: false, isAffiliate: false,
          role: null, affiliateId: null, loading: false, error: null,
        })
        return
      }
      const { role, affiliateId } = await getUserRole(user)
      if (!role) {
        await firebaseSignOut(auth)
        setState({
          user: null, session: null, isAdmin: false, isAffiliate: false,
          role: null, affiliateId: null, loading: false,
          error: 'Access denied. An authorized admin or affiliate account is required.',
        })
        return
      }
      setState({
        user,
        session: user,
        isAdmin: role === 'super_admin',
        isAffiliate: role === 'affiliate',
        role,
        affiliateId,
        loading: false,
        error: null,
      })
    })
    return unsub
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      await signInWithEmailAndPassword(auth, email, password)
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      setState(s => ({ ...s, loading: false, error: msg }))
      return false
    }
  }, [])

  const loginWithGoogle = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
      return true
    } catch (err: unknown) {
      const code = typeof err === 'object' && err !== null && 'code' in err
        ? String(err.code)
        : ''
      const message = code === 'auth/popup-closed-by-user'
        ? 'Google sign-in was cancelled.'
        : code === 'auth/popup-blocked'
          ? 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.'
          : err instanceof Error
            ? err.message
            : 'Google sign-in failed.'
      setState(s => ({ ...s, loading: false, error: message }))
      return false
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim())
  }, [])

  const logout = useCallback(async () => {
    await firebaseSignOut(auth)
    setState({
      user: null, session: null, isAdmin: false, isAffiliate: false,
      role: null, affiliateId: null, loading: false, error: null,
    })
  }, [])

  return { ...state, login, loginWithGoogle, resetPassword, logout }
}
