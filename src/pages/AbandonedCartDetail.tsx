import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Phone, Mail, Package, Loader2, ShoppingBag, AlertTriangle } from 'lucide-react'

interface CartItem {
  product_id: string
  name: string
  price: number
  quantity: number
  image: string | null
  updated_at: string
}

interface CartDetail {
  user_id: string
  name: string | null
  email: string | null
  phone: string | null
  items: CartItem[]
}

function useCartDetail(userId: string) {
  return useQuery({
    queryKey: ['abandoned-carts', userId],
    queryFn: async () => {
      const { data: cartData, error } = await supabase
        .from('cart_items')
        .select('id, user_id, quantity, updated_at, products(id, name, price, images)')
        .eq('user_id', userId)

      if (error) throw new Error(error.message)
      if (!cartData || cartData.length === 0) throw new Error('Cart not found')

      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('name, email, phone')
        .eq('user_id', userId)
        .limit(1)

      const profile = profiles?.[0] ?? { name: null, email: null, phone: null }

      const items: CartItem[] = cartData.map(row => {
        const product = (row.products as unknown as { id: string; name: string; price: number; images: string[] | null } | null)
        return {
          product_id: product?.id ?? '',
          name: product?.name ?? '—',
          price: product?.price ?? 0,
          quantity: row.quantity,
          image: product?.images?.[0] ?? null,
          updated_at: row.updated_at,
        }
      })

      return { user_id: userId, name: profile.name, email: profile.email, phone: profile.phone, items } as CartDetail
    },
    enabled: !!userId,
  })
}

function formatDateTime(str: string) {
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

  const [convertError, setConvertError] = useState<string | null>(null)
  const [convertedOrderId, setConvertedOrderId] = useState<string | null>(null)

  const convertToOrder = useMutation({
    mutationFn: async (c: CartDetail) => {
      const subtotal = c.items.reduce((s, i) => s + i.price * i.quantity, 0)

      const orderItems = c.items.map(i => ({
        product_id: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        image: i.image,
      }))

      const { data, error } = await supabase
        .from('orders')
        .insert({
          user_id: c.user_id,
          guest_name: c.name,
          guest_email: c.email,
          guest_phone: c.phone,
          status: 'confirmed',
          payment_method: 'cod',
          subtotal,
          shipping_charge: 0,
          total: subtotal,
          items: orderItems,
          note: 'Converted from abandoned cart by admin',
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      // Clear the cart items after converting
      await supabase.from('cart_items').delete().eq('user_id', c.user_id)

      return data.id as string
    },
    onSuccess: (orderId) => {
      setConvertedOrderId(orderId)
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['abandoned-carts'] })
    },
    onError: (e) => {
      setConvertError(e instanceof Error ? e.message : 'Failed to convert')
    },
  })

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-96"><Loader2 className="animate-spin text-red-600" size={28} /></div>
  }

  if (error || !cart) {
    return (
      <div className="p-8">
        <p className="text-red-600 mb-2">Cart not found.</p>
        <Link to="/abandoned-cart" className="text-sm text-red-600 underline">← Back</Link>
      </div>
    )
  }

  const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <p className="text-xs text-gray-400">
          <Link to="/orders" className="hover:text-gray-600">Orders</Link>{' / '}
          <Link to="/abandoned-cart" className="hover:text-gray-600">Abandoned Cart</Link>{' / '}
          <span className="text-gray-600">View Abandoned Cart</span>
        </p>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">View Abandoned Cart</h1>
        <button onClick={() => navigate('/abandoned-cart')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
          Go Back
        </button>
      </div>

      <div className="px-6 py-5 space-y-5 max-w-6xl">

        {/* Converted success banner */}
        {convertedOrderId && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-800">
              <ShoppingBag size={16} />
              <span className="font-medium text-sm">Cart successfully converted to an order</span>
            </div>
            <button
              onClick={() => navigate(`/orders/${convertedOrderId}`)}
              className="text-sm text-green-700 font-semibold underline hover:text-green-900"
            >
              View Order →
            </button>
          </div>
        )}

        {/* Customer card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 max-w-sm">
          <div className="space-y-3 text-sm text-gray-700">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Full Name</p>
              <p className="font-bold text-gray-900 text-base">{cart.name || '—'}</p>
            </div>
            <div className="flex items-center gap-2"><Mail size={13} className="text-gray-400" /><span>{cart.email || '—'}</span></div>
            <div className="flex items-center gap-2"><Phone size={13} className="text-gray-400" /><span>{cart.phone || '—'}</span></div>
          </div>
        </div>

        {/* Products table + Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" colSpan={2}>Product</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cart.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-5 py-4 w-16">
                      {item.image
                        ? <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                        : <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center"><Package size={16} className="text-gray-400" /></div>
                      }
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

          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm self-start">
            <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="flex justify-between text-gray-600"><span>Order Total</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-gray-600"><span>GST 0%</span><span>₹0.00</span></div>
            <div className="flex justify-between text-gray-500 text-xs"><span>Shipping</span><span>Free</span></div>
            <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900"><span>Total</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="mt-3 bg-gray-900 text-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium">Amount Payable</span>
              <span className="font-bold">{formatCurrency(subtotal)}</span>
            </div>
          </div>
        </div>

        {/* Convert to Order + Activity Log */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          {/* Convert button row */}
          <div className="flex items-center justify-between mb-5 pb-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {!convertedOrderId && (
                <button
                  onClick={() => { setConvertError(null); convertToOrder.mutate(cart) }}
                  disabled={convertToOrder.isPending || !!convertedOrderId}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {convertToOrder.isPending
                    ? <><Loader2 size={14} className="animate-spin" /> Converting…</>
                    : <><ShoppingBag size={14} /> Convert to Order</>
                  }
                </button>
              )}
              {convertError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertTriangle size={14} />
                  <span>{convertError}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => navigate('/abandoned-cart')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          {/* Activity Log */}
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
