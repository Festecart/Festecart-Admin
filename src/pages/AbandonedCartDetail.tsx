import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDocs, getDoc, addDoc, deleteDoc,
  query, where, Timestamp,
} from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'
import { Phone, Mail, Package, Loader2, ShoppingBag, AlertTriangle } from 'lucide-react'

interface CartItem {
  product_id: string; name: string; price: number; quantity: number
  image: string | null; updated_at: string
}

interface CartAddress {
  name: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
}

interface CartDetail {
  user_id: string; name: string | null; email: string | null; phone: string | null
  address: CartAddress | null; items: CartItem[]
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

function normalizeAddress(raw: unknown, fallback?: Partial<CartAddress>): CartAddress | null {
  const base: CartAddress = {
    name: fallback?.name ?? null,
    phone: fallback?.phone ?? null,
    address: fallback?.address ?? null,
    city: fallback?.city ?? null,
    state: fallback?.state ?? null,
    pincode: fallback?.pincode ?? null,
  }

  if (!raw) return base.address || base.city || base.state || base.pincode || base.name || base.phone ? base : null

  if (typeof raw === 'string') {
    const val = raw.trim()
    return val ? { ...base, address: val || base.address } : base.address || base.city || base.state || base.pincode || base.name || base.phone ? base : null
  }

  const record = raw as Record<string, unknown>
  const candidateObjects = [
    record,
    record.shipping_address,
    record.shippingAddress,
    record.address,
    record.delivery_address,
    record.default_address,
    record.customer_address,
    record.location,
  ].filter(Boolean)

  for (const item of candidateObjects) {
    if (!item || typeof item !== 'object') continue
    const current = item as Record<string, unknown>
    const name = coerceString(current.name ?? current.customer_name ?? current.full_name ?? current.user_name ?? base.name)
    const phone = coerceString(current.phone ?? current.mobile ?? current.contact_number ?? current.contact ?? base.phone)
    const address = coerceString(current.address ?? current.street ?? current.line1 ?? current.line2 ?? current.street_address ?? current.house_no ?? base.address)
    const city = coerceString(current.city ?? current.customer_city ?? current.town ?? base.city)
    const state = coerceString(current.state ?? current.customer_state ?? current.region ?? base.state)
    const pincode = coerceString(current.pincode ?? current.pin_code ?? current.postal_code ?? current.zip ?? current.customer_pincode ?? base.pincode)

    if (name || phone || address || city || state || pincode) {
      return { name, phone, address, city, state, pincode }
    }
  }

  const name = coerceString(record.name ?? record.customer_name ?? record.full_name ?? record.user_name ?? base.name)
  const phone = coerceString(record.phone ?? record.mobile ?? record.contact_number ?? record.contact ?? base.phone)
  const address = coerceString(record.address ?? record.street ?? record.line1 ?? record.line2 ?? record.street_address ?? record.house_no ?? base.address)
  const city = coerceString(record.city ?? record.customer_city ?? record.town ?? base.city)
  const state = coerceString(record.state ?? record.customer_state ?? record.region ?? base.state)
  const pincode = coerceString(record.pincode ?? record.pin_code ?? record.postal_code ?? record.zip ?? record.customer_pincode ?? base.pincode)

  if (!name && !phone && !address && !city && !state && !pincode) return null
  return { name, phone, address, city, state, pincode }
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

function useCartDetail(userId: string) {
  return useQuery({
    queryKey: ['abandoned-carts', userId],
    queryFn: async () => {
      const cartSnap = await getDocs(query(collection(db, 'cart_items'), where('user_id', '==', userId)))
      if (cartSnap.empty) throw new Error('Cart not found')

      let name: string | null = null, email: string | null = null, phone: string | null = null
      let resolvedAddress: CartAddress | null = null

      try {
        const profDoc = await getDoc(doc(db, 'user_profiles', userId))
        if (profDoc.exists()) {
          const p = profDoc.data() as Record<string, unknown>
          name = coerceString(p.name ?? p.customer_name) ?? name
          email = coerceString(p.email) ?? email
          phone = coerceString(p.phone ?? p.mobile) ?? phone
          const fromProfile = normalizeAddress(
            p.shipping_address ?? p.shippingAddress ?? p.address ?? p.delivery_address ?? p.default_address ?? p.customer_address ?? p.location,
            { name: coerceString(p.name ?? p.customer_name), phone: coerceString(p.phone ?? p.mobile), address: coerceString(p.address ?? p.street), city: coerceString(p.city), state: coerceString(p.state), pincode: coerceString(p.pincode ?? p.pin_code) }
          )
          if (fromProfile) resolvedAddress = fromProfile
        }
      } catch { /* no profile */ }

      const allItems: CartItem[] = []
      for (const docSnap of cartSnap.docs) {
        const data = docSnap.data() as Record<string, unknown>
        const itemList = extractCartItems(data)
        if (!name) name = coerceString(data.customer_name ?? data.name)
        if (!email) email = coerceString(data.customer_email ?? data.email)
        if (!phone) phone = coerceString(data.customer_phone ?? data.phone)

        const itemAddress = normalizeAddress(
          data.shipping_address ?? data.shippingAddress ?? data.address ?? data.delivery_address ?? data.customer_address ?? data.location,
          { name: coerceString(data.customer_name ?? data.name), phone: coerceString(data.customer_phone ?? data.phone), address: coerceString(data.address ?? data.street), city: coerceString(data.city), state: coerceString(data.state), pincode: coerceString(data.pincode ?? data.pin_code) }
        )
        if (!resolvedAddress && itemAddress) resolvedAddress = itemAddress

        if (itemList.length > 0) {
          allItems.push(...itemList.map(item => ({
            product_id: item.product_id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            updated_at: item.updated_at,
          })))
        }
      }

      const firstRecord = cartSnap.docs[0]?.data() as Record<string, unknown> | undefined
      const cartAddress = normalizeAddress(
        firstRecord?.shipping_address ??
        firstRecord?.shippingAddress ??
        firstRecord?.address ??
        firstRecord?.delivery_address ??
        firstRecord?.customer_address ??
        firstRecord?.location ??
        {
          name: coerceString(firstRecord?.customer_name ?? firstRecord?.name ?? name),
          phone: coerceString(firstRecord?.customer_phone ?? firstRecord?.phone ?? phone),
          address: coerceString(firstRecord?.address ?? firstRecord?.street),
          city: coerceString(firstRecord?.city),
          state: coerceString(firstRecord?.state),
          pincode: coerceString(firstRecord?.pincode ?? firstRecord?.pin_code),
        },
        { name, phone, address: resolvedAddress?.address ?? null, city: resolvedAddress?.city ?? null, state: resolvedAddress?.state ?? null, pincode: resolvedAddress?.pincode ?? null }
      )

      return { user_id: userId, name, email, phone, address: cartAddress ?? resolvedAddress, items: allItems } as CartDetail
    },
    enabled: !!userId,
  })
}

function formatDateTime(str: string) {
  if (!str) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(str))
}

export default function AbandonedCartDetail() {
  const { id: userId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: cart, isLoading, error } = useCartDetail(userId!)
  const [convertError,    setConvertError]    = useState<string | null>(null)
  const [convertedOrderId, setConvertedOrderId] = useState<string | null>(null)

  const convertToOrder = useMutation({
    mutationFn: async (c: CartDetail) => {
      const subtotal = c.items.reduce((s, i) => s + i.price * i.quantity, 0)
      const orderItems = c.items.map(i => ({
        product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity, image: i.image,
      }))

      const shippingAddress = c.address ? {
        name: c.address.name ?? c.name ?? '',
        phone: c.address.phone ?? c.phone ?? '',
        address: c.address.address ?? '',
        city: c.address.city ?? '',
        state: c.address.state ?? '',
        pincode: c.address.pincode ?? '',
      } : null

      // Generate order number
      const ordSnap = await getDocs(collection(db, 'orders'))
      const nextNum = ordSnap.docs.length + 1
      const order_number = `#OD${String(nextNum).padStart(6, '0')}`
      const now = Timestamp.now()

      const ref = await addDoc(collection(db, 'orders'), {
        user_id: c.user_id, guest_name: c.name, guest_email: c.email, guest_phone: c.phone,
        order_number, status: 'confirmed', payment_method: 'cod',
        subtotal, shipping_charge: 0, total: subtotal,
        shipping_address: shippingAddress,
        items: orderItems, note: 'Converted from abandoned cart by admin',
        confirmed_at: now, created_at: now, updated_at: now,
      })

      // Delete cart items
      const cartDocs = await getDocs(query(collection(db, 'cart_items'), where('user_id', '==', c.user_id)))
      await Promise.all(cartDocs.docs.map(d => deleteDoc(doc(db, 'cart_items', d.id))))

      return ref.id
    },
    onSuccess: (orderId) => {
      setConvertedOrderId(orderId)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['abandoned-carts'] })
    },
    onError: (e) => setConvertError(e instanceof Error ? e.message : 'Failed to convert'),
  })

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-96">
      <Loader2 className="animate-spin text-red-600" size={28} />
    </div>
  )
  if (error || !cart) return (
    <div className="p-8">
      <p className="text-red-600 mb-2">Cart not found.</p>
      <Link to="/abandoned-cart" className="text-sm text-red-600 underline">← Back</Link>
    </div>
  )

  const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <p className="text-xs text-gray-400">
          <Link to="/orders" className="hover:text-gray-600">Orders</Link>{' / '}
          <Link to="/abandoned-cart" className="hover:text-gray-600">Abandoned Cart</Link>{' / '}
          <span className="text-gray-600">View Abandoned Cart</span>
        </p>
      </div>
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">View Abandoned Cart</h1>
        <button onClick={() => navigate('/abandoned-cart')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Go Back</button>
      </div>

      <div className="px-6 py-5 space-y-5 max-w-6xl">
        {convertedOrderId && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-800">
              <ShoppingBag size={16} />
              <span className="font-medium text-sm">Cart successfully converted to an order</span>
            </div>
            <button onClick={() => navigate(`/orders/${convertedOrderId}`)}
              className="text-sm text-green-700 font-semibold underline hover:text-green-900">
              View Order →
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 max-w-sm">
            <div className="space-y-3 text-sm text-gray-700">
              <div><p className="text-xs text-gray-400 mb-0.5">Full Name</p><p className="font-bold text-gray-900 text-base">{cart.name || '—'}</p></div>
              <div className="flex items-center gap-2"><Mail size={13} className="text-gray-400" /><span>{cart.email || '—'}</span></div>
              <div className="flex items-center gap-2"><Phone size={13} className="text-gray-400" /><span>{cart.phone || '—'}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 max-w-md">
            <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Shipping Address</p>
            <div className="space-y-1 text-sm text-gray-700">
              <p className="font-semibold text-gray-900">{cart.address?.name || cart.name || '—'}</p>
              <p>{cart.address?.address || 'No address available'}</p>
              <p>{[cart.address?.city, cart.address?.state].filter(Boolean).join(', ') || '—'}</p>
              <p>{cart.address?.pincode ? `PIN: ${cart.address.pincode}` : 'PIN: —'}</p>
              <div className="flex items-center gap-2 pt-2"><Phone size={13} className="text-gray-400" /><span>{cart.address?.phone || cart.phone || '—'}</span></div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Product</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Price</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cart.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-5 py-4 w-16">
                      {item.image
                        ? <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                        : <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><Package size={16} className="text-gray-400" /></div>}
                    </td>
                    <td className="px-2 py-4"><p className="font-medium text-gray-900">{item.name}</p></td>
                    <td className="px-5 py-4 text-right text-gray-700">{formatCurrency(item.price)}</td>
                    <td className="px-5 py-4 text-center text-gray-700">{item.quantity}</td>
                    <td className="px-5 py-4 text-right font-semibold">{formatCurrency(item.price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm self-start">
            <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="flex justify-between text-gray-600"><span>Order Total</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-gray-500 text-xs"><span>Shipping</span><span>Free</span></div>
            <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900"><span>Total</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="mt-3 bg-gray-900 text-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium">Amount Payable</span>
              <span className="font-bold">{formatCurrency(subtotal)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {!convertedOrderId && (
                <button onClick={() => { setConvertError(null); convertToOrder.mutate(cart) }}
                  disabled={convertToOrder.isPending || !!convertedOrderId}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium">
                  {convertToOrder.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Converting…</>
                    : <><ShoppingBag size={14} /> Convert to Order</>}
                </button>
              )}
              {convertError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertTriangle size={14} /><span>{convertError}</span>
                </div>
              )}
            </div>
            <button onClick={() => navigate('/abandoned-cart')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          </div>

          <h2 className="font-semibold text-gray-900 mb-3 text-sm">Activity Log</h2>
          <div className="space-y-2">
            {cart.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2 last:border-0">
                <span className="text-blue-600">{item.name} — added to cart</span>
                <span className="text-gray-400 text-xs whitespace-nowrap ml-4">{formatDateTime(item.updated_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
