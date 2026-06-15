import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Session } from '@supabase/supabase-js'

interface AuthState {
  session: Session | null
  isAdmin: boolean
  loading: boolean
  error: string | null
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    isAdmin: false,
    loading: true,
    error: null,
  })

  const checkAdminRole = useCallback(async (session: Session) => {
    const { data: roleRow, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .single()

    if (error || roleRow?.role !== 'super_admin') {
      await supabase.auth.signOut()
      setState({ session: null, isAdmin: false, loading: false, error: 'Access denied. Super admin role required.' })
      return false
    }
    setState({ session, isAdmin: true, loading: false, error: null })
    return true
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkAdminRole(session)
      } else {
        setState({ session: null, isAdmin: false, loading: false, error: null })
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        checkAdminRole(session)
      } else {
        setState({ session: null, isAdmin: false, loading: false, error: null })
      }
    })

    return () => subscription.unsubscribe()
  }, [checkAdminRole])

  const login = useCallback(async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }))
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setState(s => ({ ...s, loading: false, error: error.message }))
      return false
    }
    return true
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setState({ session: null, isAdmin: false, loading: false, error: null })
  }, [])

  return { ...state, login, logout }
}
