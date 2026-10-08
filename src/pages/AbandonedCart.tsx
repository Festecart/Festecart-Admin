import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { db, collection, getDocs } from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'
import { Search, ShoppingCart, RefreshCw } from 'lucide-react'

interface CartAddress {
  name: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
}

interface CartRow {
  user_id: string; name: string | null; email: string | null; phone: string | null
  address: string | null; city: string | null; state: string | null; pincode: string | null
  products: string; totalItems: number; totalQty: number; total: number; updatedAt: string
}

function coerceNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function coerceString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const str = String(value).trim()
  return str || null
}

function normalizeAddress(raw: unknown, fallback?: Partial<CartAddress>): CartAddress {
  const base: CartAddress = {
    name: fallback?.name ?? null,
    phone: fallback?.phone ?? null,
    address: fallback?.address ?? null,
    city: fallback?.city ?? null,
    state: fallback?.state ?? null,
    pincode: fallback?.pincode ?? null,
  }

  if (!raw) return base

  if (typeof raw === 'string') {
    const val = raw.trim()
    return { ...base, address: val || base.address }
  }

  const record = raw as Record<string, unknown>
  const candidates = [
    record,
    record.shipping_address,
    record.shippingAddress,
    record.address,
    record.delivery_address,
    record.default_address,
    record.customer_address,
    record.location,
  ].filter(Boolean)

  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue
    const current = item as Record<string, unknown>
    const address = coerceString(current.address ?? current.street ?? current.line1 ?? current.line2 ?? current.street_address ?? current.house_no ?? base.address)
    const city = coerceString(current.city ?? current.customer_city ?? current.town ?? base.city)
    const state = coerceString(current.state ?? current.customer_state ?? current.region ?? base.state)
    const pincode = coerceString(current.pincode ?? current.pin_code ?? current.postal_code ?? current.zip ?? current.customer_pincode ?? base.pincode)
    const name = coerceString(current.name ?? current.customer_name ?? current.full_name ?? current.user_name ?? base.name)
    const phone = coerceString(current.phone ?? current.mobile ?? current.contact_number ?? current.contact ?? base.phone)

    if (address || city || state || pincode || name || phone) {
      return {
        name: name ?? base.name,
        phone: phone ?? base.phone,
        address: address ?? base.address,
        city: city ?? base.city,
        state: state ?? base.state,
        pincode: pincode ?? base.pincode,
      }
    }
  }

  const address = coerceString(record.address ?? record.street ?? record.line1 ?? record.line2 ?? record.street_address ?? record.house_no ?? base.address)
  const city = coerceString(record.city ?? record.customer_city ?? record.town ?? base.city)
  const state = coerceString(record.state ?? record.customer_state ?? record.region ?? base.state)
  const pincode = coerceString(record.pincode ?? record.pin_code ?? record.postal_code ?? record.zip ?? record.customer_pincode ?? base.pincode)
  const name = coerceString(record.name ?? record.customer_name ?? record.full_name ?? record.user_name ?? base.name)
  const phone = coerceString(record.phone ?? record.mobile ?? record.contact_number ?? record.contact ?? base.phone)

  return {
    name: name ?? base.name,
    phone: phone ?? base.phone,
    address: address ?? base.address,
    city: city ?? base.city,
    state: state ?? base.state,
    pincode: pincode ?? base.pincode,
  }
}

function extractCartItems(data: Record<string, unknown>) {
  const candidateArrays = [
    data.items,
    data.products,
    data.cart_items,
    data.line_items,
    data.cart,
    data.product_list,
  ]

  const items: Array<{ product_id: string; name: string; price: number; quantity: number; image: string | null; updated_at: string }> = []

  for (const candidate of candidateArrays) {
    if (!Array.isArray(candidate)) continue
    for (const raw of candidate) {
      if (!raw || typeof raw !== 'object') continue
      const item = raw as Record<string, unknown>
      const product = (item.product as Record<string, unknown> | undefined) ?? (item.item as Record<string, unknown> | undefined) ?? (item.product_details as Record<string, unknown> | undefined) ?? {}
      const name = coerceString(item.product_name ?? item.productName ?? item.name ?? item.title ?? product.name ?? product.title ?? product.product_name ?? product.productName) ?? 'Product'
      const productId = coerceString(item.product_id ?? item.productId ?? item.id ?? product.id ?? product.product_id ?? product.productId) ?? name
      const price = coerceNumber(item.product_price ?? item.price ?? item.unit_price ?? product.price ?? product.unit_price ?? product.amount ?? item.amount)
      const quantity = Math.max(1, Math.round(coerceNumber(item.quantity ?? item.qty ?? item.item_quantity ?? item.count ?? product.quantity ?? product.qty ?? 1)))
      const image = coerceString(item.product_image ?? item.image ?? item.image_url ?? item.productImage ?? product.image ?? product.image_url ?? (Array.isArray(product.images) ? product.images[0] : undefined)) ?? null
      const updatedAt = item.updated_at ?? item.created_at ?? product.updated_at ?? product.created_at ?? new Date().toISOString()
      const ts = updatedAt && typeof updatedAt === 'object' && 'toDate' in updatedAt ? (updatedAt as { toDate: () => Date }).toDate().toISOString() : String(updatedAt)
      items.push({ product_id: productId, name, price, quantity, image, updated_at: ts })
    }
  }

  const direct = data.product_id || data.productId || data.name || data.product_name || data.productName || data.price || data.product_price || data.quantity || data.qty
  if (direct) {
    const product = (data.product as Record<string, unknown> | undefined) ?? {}
    const name = coerceString(data.product_name ?? data.productName ?? data.name ?? data.title ?? product.name ?? product.title ?? product.product_name ?? product.productName) ?? 'Product'
    const productId = coerceString(data.product_id ?? data.productId ?? data.id ?? product.id ?? product.product_id ?? product.productId) ?? name
    const price = coerceNumber(data.product_price ?? data.price ?? data.unit_price ?? product.price ?? product.unit_price ?? product.amount ?? data.amount)
    const quantity = Math.max(1, Math.round(coerceNumber(data.quantity ?? data.qty ?? data.item_quantity ?? data.count ?? product.quantity ?? product.qty ?? 1)))
    const image = coerceString(data.product_image ?? data.image ?? data.image_url ?? data.productImage ?? product.image ?? product.image_url ?? (Array.isArray(product.images) ? product.images[0] : undefined)) ?? null
    const updatedAt = data.updated_at ?? data.created_at ?? product.updated_at ?? product.created_at ?? new Date().toISOString()
    const ts = updatedAt && typeof updatedAt === 'object' && 'toDate' in updatedAt ? (updatedAt as { toDate: () => Date }).toDate().toISOString() : String(updatedAt)
    items.push({ product_id: productId, name, price, quantity, image, updated_at: ts })
  }

  const unique = new Map<string, { product_id: string; name: string; price: number; quantity: number; image: string | null; updated_at: string }>()
  for (const item of items) {
    const key = `${item.product_id}-${item.name}`
    const existing = unique.get(key)
    if (existing) {
      existing.quantity += item.quantity
      existing.price = item.price || existing.price
      if (!existing.image && item.image) existing.image = item.image
    } else {
      unique.set(key, item)
    }
  }

  return Array.from(unique.values())
}

function useAbandonedCarts() {
  return useQuery({
    queryKey: ['abandoned-carts'],
    queryFn: async () => {
      // Fetch all cart items — no orderBy to avoid index requirement
      const cartSnap = await getDocs(collection(db, 'cart_items'))
      if (cartSnap.empty) return []

      const userIds = [...new Set(cartSnap.docs.map(d => d.data().user_id).filter(Boolean))]
      const profileMap: Record<string, { name: string | null; email: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; pincode: string | null }> = {}

      if (userIds.length > 0) {
        const profileSnap = await getDocs(collection(db, 'user_profiles'))
        profileSnap.docs.forEach(d => {
          if (userIds.includes(d.id)) {
            const data = d.data() as Record<string, unknown>
            const addr = normalizeAddress(data.shipping_address ?? data.address ?? data.delivery_address ?? data.default_address)
            profileMap[d.id] = {
              name: coerceString(data.name ?? data.customer_name),
              email: coerceString(data.email),
              phone: coerceString(data.phone ?? data.mobile),
              address: addr.address,
              city: addr.city,
              state: addr.state,
              pincode: addr.pincode,
            }
          }
        })
      }

      const grouped: Record<string, CartRow> = {}
      for (const d of cartSnap.docs) {
        const data = d.data() as Record<string, unknown>
        const uid = coerceString(data.user_id)
        if (!uid) continue

        const itemList = extractCartItems(data)
        const tsRaw = data.updated_at ?? data.created_at
        const tsStr = tsRaw && typeof tsRaw === 'object' && 'toDate' in tsRaw ? (tsRaw as { toDate: () => Date }).toDate().toISOString() : (typeof tsRaw === 'string' ? tsRaw : '')
        const profile = profileMap[uid] ?? { name: null, email: null, phone: null, address: null, city: null, state: null, pincode: null }
        const cartAddress = normalizeAddress(
          data.shipping_address ?? data.shippingAddress ?? data.address ?? data.delivery_address ?? data.customer_address ?? data.location,
          { name: profile.name, phone: profile.phone, address: profile.address, city: profile.city, state: profile.state, pincode: profile.pincode }
        )

        if (!grouped[uid]) {
          grouped[uid] = {
            user_id: uid,
            name: coerceString(data.customer_name ?? data.name ?? profile.name),
            email: coerceString(data.customer_email ?? data.email ?? profile.email),
            phone: coerceString(data.customer_phone ?? data.phone ?? profile.phone),
            address: cartAddress.address ?? profile.address,
            city: cartAddress.city ?? profile.city,
            state: cartAddress.state ?? profile.state,
            pincode: cartAddress.pincode ?? profile.pincode,
            products: '',
            totalItems: 0,
            totalQty: 0,
            total: 0,
            updatedAt: tsStr,
          }
        }

        if (itemList.length === 0) {
          grouped[uid].products = grouped[uid].products ? `${grouped[uid].products}, Product` : 'Product'
          grouped[uid].totalItems += 1
          grouped[uid].totalQty += 1
        } else {
          for (const item of itemList) {
            grouped[uid].products = grouped[uid].products
              ? `${grouped[uid].products}, ${item.name} × ${item.quantity}`
              : `${item.name} × ${item.quantity}`
            grouped[uid].totalItems += 1
            grouped[uid].totalQty += item.quantity
            grouped[uid].total += item.price * item.quantity
          }
        }

        if (tsStr > grouped[uid].updatedAt) grouped[uid].updatedAt = tsStr
      }

      // Sort by most recently updated
      return Object.values(grouped).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
      (c.email ?? '').toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q) ||
      (c.address ?? '').toLowerCase().includes(q) || (c.city ?? '').toLowerCase().includes(q)
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
            <label className="block text-xs text-gray-500 mb-1">Customer Name / Email / Phone / Address</label>
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
            <p className="text-gray-500 font-medium">No abandoned carts found</p>
            <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
              {search
                ? 'No carts match your search'
                : 'Carts appear here when the customer app syncs cart data to Firestore (cart_items collection). Check that the connect app writes cart items with user_id, product_id, product_name, product_price, and quantity fields.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Customer Name','Email','Phone','Products','Address','Total Items','Total Qty','Total','Updated On',''].map(h => (
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
                    <td className="px-5 py-3 text-gray-600 max-w-sm">{cart.products || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 max-w-xs">
                      {cart.address ? `${cart.address}${cart.city ? `, ${cart.city}` : ''}${cart.state ? `, ${cart.state}` : ''}${cart.pincode ? ` - ${cart.pincode}` : ''}` : '—'}
                    </td>
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
