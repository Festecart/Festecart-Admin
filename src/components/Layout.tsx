import { NavLink, Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { useAuth } from '@/hooks/useAuth'
import { BadgePercent, LogOut } from 'lucide-react'

export function Layout() {
  const { logout, isAffiliate } = useAuth()

  if (isAffiliate) {
    return (
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <aside className="flex w-64 shrink-0 flex-col bg-gray-950 text-white">
          <div className="border-b border-white/10 px-6 py-5">
            <p className="text-sm font-bold">Festecart</p>
            <p className="mt-1 text-xs text-gray-400">Affiliate portal</p>
          </div>
          <nav className="flex-1 px-3 py-4">
            <NavLink
              to="/affiliate"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <BadgePercent size={18} />
              Coupon
            </NavLink>
          </nav>
          <div className="border-t border-white/10 px-3 py-4">
            <button
              type="button"
              onClick={() => void logout()}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar onLogout={logout} />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  )
}
