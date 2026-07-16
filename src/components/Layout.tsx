import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuth } from '@/hooks/useAuth'

export function Layout() {
  const { logout } = useAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar onLogout={logout} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}
