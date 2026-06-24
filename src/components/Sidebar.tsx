import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ShoppingBag, Truck, LogOut, ChevronUp, ChevronDown, Package, Globe, Layout } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  onLogout: () => void
}

function NavGroup({ icon: Icon, label, basePath, children }: {
  icon: React.ElementType
  label: string
  basePath: string
  children: React.ReactNode
}) {
  const location = useLocation()
  const isActive = location.pathname.startsWith(basePath)
  const [open, setOpen] = useState(isActive)

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          isActive ? 'text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white',
        )}
      >
        <span className="flex items-center gap-3"><Icon size={18} />{label}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div className="mt-1 ml-8 space-y-0.5">{children}</div>}
    </div>
  )
}

function Sub({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn('block px-3 py-2 rounded-lg text-sm transition-colors',
          isActive ? 'text-white font-medium' : 'text-gray-400 hover:text-white hover:bg-gray-800')
      }
    >
      {label}
    </NavLink>
  )
}

export function Sidebar({ onLogout }: SidebarProps) {
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

        {/* Orders group */}
        <NavGroup icon={ShoppingBag} label="Orders" basePath="/orders">
          <Sub to="/orders" label="Orders" />
          <Sub to="/abandoned-cart" label="Abandoned Cart" />
          <Sub to="/contact-enquiries" label="Contact Enquires" />
        </NavGroup>

        {/* Catalog group */}
        <NavGroup icon={Package} label="Catalog" basePath="/catalog">
          <Sub to="/catalog/products" label="Products" />
          <Sub to="/catalog/categories" label="Categories" />
        </NavGroup>

        {/* Website group — Navigation + Footer */}
        <NavGroup icon={Globe} label="Website" basePath="/site/navbar">
          <Sub to="/site/navbar" label="Navigation" />
        </NavGroup>

        {/* Website Builder group — Featured Products, Testimonials, Why Packages */}
        <NavGroup icon={Layout} label="Website Builder" basePath="/site">
          <Sub to="/site/featured-products" label="Featured Products" />
          <Sub to="/site/testimonials" label="Testimonials" />
          <Sub to="/site/why-packages" label="Why Packages" />
        </NavGroup>

        {/* Shipments */}
        <NavLink
          to="/shipments"
          className={({ isActive }) =>
            cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white')
          }
        >
          <Truck size={18} />Shipments
        </NavLink>

        {/* Shipping Zones */}
        <NavLink
          to="/shipping-zones"
          className={({ isActive }) =>
            cn('flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-red-600 text-white' : 'text-gray-300 hover:bg-gray-800 hover:text-white')
          }
        >
          <Truck size={18} />Shipping Zones
        </NavLink>

      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-gray-700">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white w-full transition-colors"
        >
          <LogOut size={18} />Sign Out
        </button>
      </div>
    </aside>
  )
}
