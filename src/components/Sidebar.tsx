import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ShoppingBag, Truck, MapPin, LogOut, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onLogout: () => void
}

export function Sidebar({ onLogout }: SidebarProps) {
  const location = useLocation()
  const ordersActive = location.pathname.startsWith('/orders') ||
    location.pathname.startsWith('/abandoned-cart') ||
    location.pathname.startsWith('/contact-enquiries')
  const [ordersOpen, setOrdersOpen] = useState(ordersActive)

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col min-h-screen shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">F</div>
          <div>
            <p className="font-bold text-sm leading-none">Festecart</p>
            <p className="text-xs text-gray-400 leading-none mt-0.5">Admin Panel</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">

        {/* Orders group — expandable */}
        <div>
          <button
            onClick={() => setOrdersOpen(o => !o)}
            className={cn(
              'flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              ordersActive ? 'text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white',
            )}
          >
            <span className="flex items-center gap-3">
              <ShoppingBag size={18} />
              Orders
            </span>
            {ordersOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {ordersOpen && (
            <div className="mt-1 ml-8 space-y-0.5">
              <NavLink
                to="/orders"
                end
                className={({ isActive }) =>
                  cn(
                    'block px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive ? 'text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800',
                  )
                }
              >
                Orders
              </NavLink>
              <NavLink
                to="/abandoned-cart"
                className={({ isActive }) =>
                  cn(
                    'block px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive ? 'text-white font-semibold' : 'text-gray-400 hover:text-white hover:bg-gray-800',
                  )
                }
              >
                Abandoned Cart
              </NavLink>
              <NavLink
                to="/contact-enquiries"
                className={({ isActive }) =>
                  cn(
                    'block px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive ? 'text-white font-semibold' : 'text-gray-400 hover:text-white hover:bg-gray-800',
                  )
                }
              >
                Contact Enquires
              </NavLink>
            </div>
          )}
        </div>

        {/* Shipments */}
        <NavLink
          to="/shipments"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white',
            )
          }
        >
          <Truck size={18} />
          Shipments
        </NavLink>

        {/* Delivery Zones */}
        <NavLink
          to="/delivery-zones"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white',
            )
          }
        >
          <MapPin size={18} />
          Delivery Zones
        </NavLink>

      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white w-full transition-colors"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
