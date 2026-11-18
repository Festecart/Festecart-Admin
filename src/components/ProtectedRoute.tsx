import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAccountsAdmin, isAffiliate, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600" />
      </div>
    )
  }

  if (!user || (!isAccountsAdmin && !isAffiliate)) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export function AdminOnlyRoute() {
  const { isAdmin, isAccountsAdmin, isAffiliate, loading } = useAuth()
  if (loading) return null
  if (!isAdmin) return <Navigate to={isAffiliate ? '/affiliate' : isAccountsAdmin ? '/accounts' : '/login'} replace />
  return <Outlet />
}

export function AccountsOnlyRoute() {
  const { isAccountsAdmin, isAffiliate, loading } = useAuth()
  if (loading) return null
  if (!isAccountsAdmin) return <Navigate to={isAffiliate ? '/affiliate' : '/login'} replace />
  return <Outlet />
}

export function AffiliateOnlyRoute() {
  const { isAdmin, isAffiliate, loading } = useAuth()
  if (loading) return null
  if (!isAffiliate) return <Navigate to={isAdmin ? '/' : '/login'} replace />
  return <Outlet />
}
