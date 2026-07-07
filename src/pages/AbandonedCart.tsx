import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { db, collection, getDocs, query, orderBy } from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'
import { Search, ShoppingCart, RefreshCw } from 'lucide-react'

interface CartRow {
  user_id: string; name: string | null; email: string | null; phone: string | null
  totalItems: number; totalQty: number; total: number; updatedAt: string
}

function useAbandonedCarts() {
  return useQuery({
    queryKey: ['abandoned-carts'],
    queryFn: async () => {
      const cartSnap = await getDocs(query(collection(db, 'cart_items'), orderBy('updated_at', 'desc')))
      if (cartSnap.empty) return []

      const userIds = [...new Set(cartSnap.docs.map(d => d.data().user_id).filter(Boolean))]
      const profileMap: Record<string, { name: string | null; email: string | null; phone: string | null }> = {}

      if (userIds.length > 0) {
        const profileSnap = await getDocs(collection(db, 'user_profiles'))
        profileSnap.docs.forEach(d => {
          const data = d.data()
          if (userIds.includes(d.id)) {
            profileMap[d.id] = { name: data.name ?? null, email: data.email ?? null, phone: data.phone ?? null }
          }
        })
      }

      const grouped: Record<string, CartRow> = {}
      for (const d of cartSnap.docs) {
        const data = d.data()
        const uid     = data.user_id
        const price   = Number(data.product_price ?? 0)
        const qty     = Number(data.quantity ?? 1)
        const tsRaw   = data.updated_at
        const tsStr   = tsRaw?.toDate ? tsRaw.toDate().toISOString() : (tsRaw ?? '')
        const profile = profileMap[uid] ?? { name: null, email: null, phone: null }

        if (!grouped[uid]) {
          grouped[uid] = { user_id: uid, ...profile, totalItems: 0, totalQty: 0, total: 0, updatedAt: tsStr }
        }
        grouped[uid].totalItems += 1
        grouped[uid].totalQty  += qty
        grouped[uid].total     += price * qty
        if (tsStr > grouped[uid].updatedAt) grouped[uid].updatedAt = tsStr
      }
      return Object.values(grouped)
    },
    staleTime: 1000 * 60,
  })
}

function formatDateTime(str: string) {
  if (!str) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(str))
}

export default function AbandonedCart() {
  const navigate = useNavigate()
  const { data: carts, isLoading, refetch } = useAbandonedCarts()
  const [search, setSearch] = useState('')

  const filtered = (carts ?? []).filter(c => {
    const q = search.toLowerCase()
    return !q || (c.name ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q)
  })

  return (
    <div className="p-6 space-y-5">
      <p className="text-xs text-gray-400">
        <Link to="/orders" className="hover:text-gray-600">Orders</Link>{' / '}
        <span className="text-gray-600">Abandoned Cart</span>
      </p>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Abandoned Cart</h1>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Customer Name / Email / Phone</label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search customer…" value={search} onChange={e => setSearch(e.target.value)}
                className="pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 w-64" />
            </div>
          </div>
          <button onClick={() => setSearch('')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Reset</button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No abandoned carts</p>
            <p className="text-sm text-gray-400 mt-1">
              {search ? 'No carts match your search' : 'Customers with items in cart but no order placed will appear here'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Customer Name','Email','Phone','Total Items','Total Qty','Total','Updated On',''].map(h => (
                    <th key={h} className={`px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${h === 'Total Items' || h === 'Total Qty' ? 'text-center' : h === 'Total' ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(cart => (
                  <tr key={cart.user_id} className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/abandoned-cart/${cart.user_id}`)}>
                    <td className="px-5 py-3 font-medium text-gray-900">{cart.name || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{cart.email || '—'}</td>
                    <td className="px-5 py-3 text-gray-500">{cart.phone || '—'}</td>
                    <td className="px-5 py-3 text-center text-gray-600">{cart.totalItems}</td>
                    <td className="px-5 py-3 text-center text-gray-600">{cart.totalQty}</td>
                    <td className="px-5 py-3 text-right font-semibold">{formatCurrency(cart.total)}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDateTime(cart.updatedAt)}</td>
                    <td className="px-5 py-3"><span className="text-red-600 text-xs font-medium">View →</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
