import { useState, useEffect, useCallback } from 'react'
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { auth, db, doc, getDoc, setDoc, Timestamp } from '@/lib/firebase'

interface AuthState {
  user:    User | null
  session: User | null
  isAdmin: boolean
  loading: boolean
  error:   string | null
}

// ── Super admin email — only this email can self-provision ─────────
const SUPER_ADMIN_EMAIL = 'festecartdesi@gmail.com'

async function checkSuperAdmin(user: User): Promise<boolean> {
  try {
    const snap = await getDoc(doc(db, 'user_roles', user.uid))

    // If doc exists, check role
    if (snap.exists()) {
      return snap.data()?.role === 'super_admin'
    }

    // ── Auto-provision: if this is the designated super admin email
    //    and no role doc exists yet, create it automatically.
    //    This solves the chicken-and-egg problem on first deploy. ──
    if (user.email === SUPER_ADMIN_EMAIL) {
      await setDoc(doc(db, 'user_roles', user.uid), {
        role:       'super_admin',
        email:      user.email,
        created_at: Timestamp.now(),
      })
      console.log('[useAuth] Super admin role auto-provisioned for', user.email)
      return true
    }

    return false
  } catch (e) {
    console.error('[useAuth] Role check failed:', e)
    return false
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user:    null,
    session: null,
    isAdmin: false,
    loading: true,
    error:   null,
  })

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, session: null, isAdmin: false, loading: false, error: null })
        return
      }
      const isAdmin = await checkSuperAdmin(user)
      if (!isAdmin) {
        await firebaseSignOut(auth)
        setState({
          user: null, session: null, isAdmin: false, loading: false,
          error: 'Access denied. Super admin role required.',
        })
        return
      }
      setState({ user, session: user, isAdmin: true, loading: false, error: null })
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

  const logout = useCallback(async () => {
    await firebaseSignOut(auth)
    setState({ user: null, session: null, isAdmin: false, loading: false, error: null })
  }, [])

  return { ...state, login, logout }
}
