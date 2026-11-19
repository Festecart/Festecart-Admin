import { createContext, createElement, useState, useEffect, useCallback, useContext, useRef, type ReactNode } from 'react'
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

type UserRole = 'super_admin' | 'admin' | 'affiliate' | null

interface AuthState {
  user:    User | null
  session: User | null
  isAdmin: boolean
  isAccountsAdmin: boolean
  isAffiliate: boolean
  role: UserRole
  affiliateId: string | null
  loading: boolean
  error:   string | null
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<boolean>
  loginWithGoogle: () => Promise<boolean>
  resetPassword: (email: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Super admin email — only this email can self-provision ─────────
const SUPER_ADMIN_EMAIL = 'festecartdesi@gmail.com'

async function getUserRole(user: User): Promise<{ role: UserRole; affiliateId: string | null }> {
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
  if (primaryRole === 'admin' || roles.includes('admin')) {
    return { role: 'admin', affiliateId: null }
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
}

const initialState: AuthState = {
  user: null,
  session: null,
  isAdmin: false,
  isAccountsAdmin: false,
  isAffiliate: false,
  role: null,
  affiliateId: null,
  loading: true,
  error: null,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    ...initialState,
  })
  const authCheckId = useRef(0)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      const checkId = ++authCheckId.current
      if (!user) {
        setState({ ...initialState, loading: false })
        return
      }

      setState({ ...initialState, user, session: user, loading: true })
      try {
        const { role, affiliateId } = await getUserRole(user)
        if (checkId !== authCheckId.current) return

        setState({
          user,
          session: user,
          isAdmin: role === 'super_admin',
          isAccountsAdmin: role === 'admin' || role === 'super_admin',
          isAffiliate: role === 'affiliate',
          role,
          affiliateId,
          loading: false,
          error: role ? null : 'Access denied. An authorized admin or affiliate account is required.',
        })
      } catch (error: unknown) {
        console.error('[useAuth] Role check failed:', error)
        if (checkId !== authCheckId.current) return
        setState({
          ...initialState,
          user,
          session: user,
          loading: false,
          error: 'Unable to verify your account access. Check your connection and try again.',
        })
      }
    })
    return () => {
      authCheckId.current += 1
      unsub()
    }
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
    setState({ ...initialState, loading: false })
  }, [])

  const value: AuthContextValue = { ...state, login, loginWithGoogle, resetPassword, logout }
  return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
