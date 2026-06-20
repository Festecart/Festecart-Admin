import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import {
  User, Mail, Phone, MapPin, X,
  Plus, Minus, Loader2, ChevronLeft
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────
interface CustomerProfile {
  user_id: string
  name: string | null
  email: string | null
  phone: string | null
  address: string | null
}

interface WalkInCustomer {
  name: string
  email: string
  phone: string
  address: string
}

interface ProductResult {
  id: string
  name: string
  price: number
  compare_at_price: number | null
  images: string[]
  inventory_count: number | null
}

interface OrderItem {
  product_id: string
  name: string
  price: number
  compare_at_price: number | null
  quantity: number
  image: string | null
}

type CustomerMode = 'customer' | 'walkin'

type SaveAsWorkflow =
  | 'order_only'
  | 'order_processing'
  | 'order_processing_invoice'
  | 'order_processing_invoice_delivered'

const SAVE_AS_OPTIONS: { value: SaveAsWorkflow; label: string }[] = [
  { value: 'order_only',                        label: 'Order' },
  { value: 'order_processing',                  label: 'Order + Mark as Processing' },
  { value: 'order_processing_invoice',          label: 'Order + Mark as Processing + Generate Invoice' },
  { value: 'order_processing_invoice_delivered',label: 'Order + Mark as Processing + Generate Invoice + Mark as Delivered' },
]

// ── Save as Order Modal ───────────────────────────────────────────
interface SaveModalProps {
  onClose: () => void
  onConfirm: (opts: SaveModalResult) => void
  loading: boolean
  error: string | null
}
interface SaveModalResult {
  deliveryType: 'self_pickup' | 'delivery'
  workflow: SaveAsWorkflow
  paymentMethod: string
  markAsPaid: boolean
  transactionNote: string
}

function SaveAsOrderModal({ onClose, onConfirm, loading, error }: SaveModalProps) {
  const [deliveryType, setDeliveryType] = useState<'self_pickup' | 'delivery'>('self_pickup')
  const [workflow, setWorkflow]         = useState<SaveAsWorkflow>('order_processing_invoice_delivered')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [markAsPaid, setMarkAsPaid]     = useState(false)
  const [transactionNote, setTransactionNote] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-base">Save as Order</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Delivery */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Delivery</label>
            <select value={deliveryType} onChange={e => setDeliveryType(e.target.value as 'self_pickup' | 'delivery')}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="self_pickup">Self Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>

          {/* Save as workflow */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Save as</label>
            <select value={workflow} onChange={e => setWorkflow(e.target.value as SaveAsWorkflow)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              {SAVE_AS_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Mode of Payment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mode of Payment <span className="text-red-500">*</span>
            </label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="cod">COD</option>
              <option value="upi">UPI</option>
              <option value="neft">NEFT</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>

          {/* Mark as Paid */}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="markpaid" checked={markAsPaid}
              onChange={e => setMarkAsPaid(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 accent-gray-900" />
            <label htmlFor="markpaid" className="text-sm text-gray-700 font-medium">Mark as Paid</label>
          </div>

          {/* Transaction Details / Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Transaction Details/Notes</label>
            <textarea value={transactionNote} onChange={e => setTransactionNote(e.target.value)}
              rows={3} placeholder="Enter transaction ID, reference, or notes…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => onConfirm({ deliveryType, workflow, paymentMethod, markAsPaid, transactionNote })}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-60">
            {loading && <Loader2 size={13} className="animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────
function buildShippingAddress(
  isWalkin: boolean,
  walkin: WalkInCustomer,
  customer: CustomerProfile | null
) {
  if (isWalkin && walkin.address)
    return { name: walkin.name, phone: walkin.phone, address: walkin.address, city: '', state: '', pincode: '' }
  if (!isWalkin && customer?.address)
    return { name: customer.name ?? '', phone: customer.phone ?? '', address: customer.address, city: '', state: '', pincode: '' }
  return null
}

// ── Main component ────────────────────────────────────────────────
export default function AddOrder() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Customer
  const [mode, setMode] = useState<CustomerMode>('customer')
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerProfile[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null)
  const [walkin, setWalkin] = useState<WalkInCustomer>({ name: '', email: '', phone: '', address: '' })
  const [searchingCustomer, setSearchingCustomer] = useState(false)

  // Products
  const [productSearch, setProductSearch] = useState('')
  const [productResults, setProductResults] = useState<ProductResult[]>([])
  const [searchingProduct, setSearchingProduct] = useState(false)
  const [showProductDropdown, setShowProductDropdown] = useState(false)

  // Cart items
  const [items, setItems] = useState<OrderItem[]>([])

  // Order meta
  const [notes, setNotes] = useState('')
  const [additionalDiscount, setAdditionalDiscount] = useState('')
  const [shippingCharge, setShippingCharge] = useState('0')
  const [formError, setFormError] = useState<string | null>(null)

  // Modal
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const productSearchRef = useRef<HTMLInputElement>(null)

  // ── Customer search ────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'customer') return
    if (!customerSearch.trim()) { setCustomerResults([]); return }
    const timer = setTimeout(async () => {
      setSearchingCustomer(true)
      const { data } = await supabase
        .from('user_profiles')
        .select('user_id, name, email, phone, address')
        .or(`name.ilike.%${customerSearch}%,email.ilike.%${customerSearch}%,phone.ilike.%${customerSearch}%`)
        .limit(8)
      setCustomerResults((data ?? []) as CustomerProfile[])
      setSearchingCustomer(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [customerSearch, mode])

  // ── Product search ─────────────────────────────────────────────
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return }
    const timer = setTimeout(async () => {
      setSearchingProduct(true)
      const { data } = await supabase
        .from('products')
        .select('id, name, price, compare_at_price, images, inventory_count')
        .eq('status', 'published')
        .ilike('name', `%${productSearch}%`)
        .limit(8)
      setProductResults((data ?? []) as ProductResult[])
      setSearchingProduct(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [productSearch])

  // ── Cart helpers ───────────────────────────────────────────────
  const addProduct = (p: ProductResult) => {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === p.id)
      if (existing) return prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product_id: p.id, name: p.name, price: p.price,
        compare_at_price: p.compare_at_price, quantity: 1, image: p.images?.[0] ?? null }]
    })
    setProductSearch(''); setProductResults([]); setShowProductDropdown(false)
  }

  const updateQty = (productId: string, delta: number) =>
    setItems(prev => prev.map(i => i.product_id === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))

  const removeItem = (productId: string) =>
    setItems(prev => prev.filter(i => i.product_id !== productId))

  // ── Totals ─────────────────────────────────────────────────────
  const subtotalOriginal = items.reduce((s, i) => s + (i.compare_at_price ?? i.price) * i.quantity, 0)
  const subtotal         = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const itemDiscount     = subtotalOriginal - subtotal
  const addDiscount      = parseFloat(additionalDiscount) || 0
  const shipping         = parseFloat(shippingCharge) || 0
  const total            = Math.max(0, subtotal - addDiscount + shipping)

  // ── Draft save ─────────────────────────────────────────────────
  const draftMutation = useMutation({
    mutationFn: async () => {
      if (items.length === 0) throw new Error('Add at least one product')
      const isWalkin   = mode === 'walkin'
      const guestName  = isWalkin ? walkin.name  : (selectedCustomer?.name  ?? null)
      const guestEmail = isWalkin ? walkin.email : (selectedCustomer?.email ?? null)
      const guestPhone = isWalkin ? walkin.phone : (selectedCustomer?.phone ?? null)
      const userId     = isWalkin ? null : (selectedCustomer?.user_id ?? null)
      const shippingAddress = buildShippingAddress(isWalkin, walkin, selectedCustomer)
      const { error } = await supabase.from('orders').insert({
        user_id: userId, guest_name: guestName, guest_email: guestEmail, guest_phone: guestPhone,
        status: 'draft', payment_method: 'cod',
        subtotal, shipping_charge: shipping, total,
        note: notes.trim() || null, shipping_address: shippingAddress,
        items: items.map(i => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity, image: i.image })),
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); navigate('/orders') },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Failed'),
  })

  // ── Validate before showing modal ──────────────────────────────
  const handleSaveAsOrderClick = () => {
    if (items.length === 0) { setFormError('Add at least one product'); return }
    if (mode === 'walkin' && !walkin.name.trim()) { setFormError('Customer name is required'); return }
    if (mode === 'customer' && !selectedCustomer) { setFormError('Select a customer'); return }
    setFormError(null)
    setModalError(null)
    setShowSaveModal(true)
  }

  // ── Execute workflow after modal confirm ───────────────────────
  const handleModalConfirm = async (opts: SaveModalResult) => {
    setSaving(true); setModalError(null)
    try {
      const isWalkin   = mode === 'walkin'
      const guestName  = isWalkin ? walkin.name  : (selectedCustomer?.name  ?? null)
      const guestEmail = isWalkin ? walkin.email : (selectedCustomer?.email ?? null)
      const guestPhone = isWalkin ? walkin.phone : (selectedCustomer?.phone ?? null)
      const userId     = isWalkin ? null : (selectedCustomer?.user_id ?? null)
      const shippingAddress = buildShippingAddress(isWalkin, walkin, selectedCustomer)

      const initialStatus = 'confirmed'
      const paymentStatus = opts.markAsPaid ? 'paid' : 'pending'

      // 1. Insert order
      const { data: newOrder, error: orderErr } = await supabase.from('orders').insert({
        user_id: userId, guest_name: guestName, guest_email: guestEmail, guest_phone: guestPhone,
        status: initialStatus,
        payment_method: opts.paymentMethod,
        payment_status: paymentStatus,
        paid_at: opts.markAsPaid ? new Date().toISOString() : null,
        delivery_type: opts.deliveryType,
        subtotal, shipping_charge: shipping, total,
        note: [notes.trim(), opts.transactionNote.trim()].filter(Boolean).join(' | ') || null,
        shipping_address: shippingAddress,
        items: items.map(i => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity, image: i.image })),
      }).select('*').single()
      if (orderErr || !newOrder) throw new Error(orderErr?.message ?? 'Failed to create order')

      let currentStatus = initialStatus

      // 2. Mark as Processing
      if (['order_processing', 'order_processing_invoice', 'order_processing_invoice_delivered'].includes(opts.workflow)) {
        await supabase.from('orders').update({ status: 'processing' }).eq('id', newOrder.id)
        await supabase.from('order_status_history').insert({ order_id: newOrder.id, action: 'Marked Processing', old_status: currentStatus, new_status: 'processing' })
        currentStatus = 'processing'
      }

      let invoiceData: Record<string, unknown> | null = null

      // 3. Generate Invoice
      if (['order_processing_invoice', 'order_processing_invoice_delivered'].includes(opts.workflow)) {
        const { data: inv, error: invErr } = await supabase.from('invoices')
          .insert({ order_id: newOrder.id, notes: opts.transactionNote || null, status: 'pending_shipment' })
          .select('id, invoice_number').single()
        if (invErr || !inv) throw new Error(invErr?.message ?? 'Failed to generate invoice')

        await supabase.from('invoice_items').insert(
          items.map(i => ({
            invoice_id: inv.id, product_id: i.product_id,
            product_name: i.name, ordered_qty: i.quantity,
            fulfilled_qty: i.quantity, price: i.price,
          }))
        )
        const newStatus = 'fulfilled'
        await supabase.from('orders').update({ status: newStatus, fulfillment_status: 'pending_shipment' }).eq('id', newOrder.id)
        await supabase.from('order_status_history').insert({ order_id: newOrder.id, action: 'Invoice Generated', old_status: currentStatus, new_status: newStatus, remarks: `Invoice ${inv.invoice_number}` })
        currentStatus = newStatus
        invoiceData = inv
      }

      // 4. Mark as Delivered
      if (opts.workflow === 'order_processing_invoice_delivered') {
        await supabase.from('invoices').update({ status: 'delivered', delivered_at: new Date().toISOString() })
          .eq('order_id', newOrder.id)
        await supabase.from('orders').update({ status: 'delivered', fulfillment_status: 'delivered' }).eq('id', newOrder.id)
        await supabase.from('order_status_history').insert({ order_id: newOrder.id, action: 'Marked Delivered', old_status: currentStatus, new_status: 'delivered' })
        currentStatus = 'delivered'
      }

      // 5. Send confirmation email
      const { data: finalOrder } = await supabase.from('orders').select('*').eq('id', newOrder.id).single()
      if (finalOrder && (finalOrder.guest_email || finalOrder.customer_email)) {
        try {
          await supabase.functions.invoke('send-order-email', {
            body: { order: finalOrder, new_status: currentStatus, invoice: invoiceData ?? null },
          })
        } catch (emailErr) {
          console.error('[AddOrder] Email failed:', emailErr)
        }
      }

      qc.invalidateQueries({ queryKey: ['orders'] })
      navigate('/orders')
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/orders')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <ChevronLeft size={18} />
            </button>
            <div>
              <p className="text-xs text-gray-400">
                <Link to="/orders" className="hover:text-gray-600">Orders</Link> / Add Order
              </p>
              <h1 className="text-xl font-bold text-gray-900">Add Order</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/orders')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={() => draftMutation.mutate()} disabled={draftMutation.isPending}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              {draftMutation.isPending && <Loader2 size={13} className="animate-spin inline mr-1" />}
              Save as Draft
            </button>
            <button onClick={handleSaveAsOrderClick}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              Save as Order
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-5xl mx-auto space-y-5">
        {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{formError}</p>}

        {/* ── Customer section ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => { setMode('customer'); setSelectedCustomer(null); setCustomerSearch('') }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${mode === 'customer' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${mode === 'customer' ? 'border-white' : 'border-gray-400'}`}>
                {mode === 'customer' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              Customer
            </button>
            <button onClick={() => { setMode('walkin'); setSelectedCustomer(null) }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${mode === 'walkin' ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${mode === 'walkin' ? 'border-white' : 'border-gray-400'}`}>
                {mode === 'walkin' && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              Walk-In
            </button>
          </div>

          {/* Customer search */}
          {mode === 'customer' && !selectedCustomer && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">Select Customer</label>
              <div className="relative">
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Search by name, email, or phone"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                {searchingCustomer && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-gray-400" />}
                {customerResults.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-gray-900 rounded-lg shadow-xl overflow-hidden">
                    {customerResults.map(c => (
                      <button key={c.user_id} onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustomerResults([]) }}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-gray-700 border-b border-gray-700 last:border-0">
                        <span className="font-medium">{c.name}</span>
                        {c.email && <span className="text-gray-300 ml-2">[{c.email}]</span>}
                        {c.phone && <span className="text-gray-300 ml-2">[{c.phone}]</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Walk-in form */}
          {mode === 'walkin' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { field: 'name',    label: 'Full Name *',  placeholder: 'Customer name' },
                { field: 'phone',   label: 'Phone',        placeholder: '+91 XXXXX XXXXX' },
                { field: 'email',   label: 'Email',        placeholder: 'customer@email.com' },
                { field: 'address', label: 'Address',      placeholder: 'Full address' },
              ] as { field: keyof WalkInCustomer; label: string; placeholder: string }[]).map(({ field, label, placeholder }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input type="text" value={walkin[field]}
                    onChange={e => setWalkin(w => ({ ...w, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              ))}
            </div>
          )}

          {/* Selected customer display */}
          {mode === 'customer' && selectedCustomer && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Customer Details</p>
                  <button onClick={() => setSelectedCustomer(null)} className="text-xs text-gray-400 hover:text-gray-700">Change</button>
                </div>
                <div className="flex items-center gap-2 text-sm"><User size={13} className="text-gray-400" /><span>{selectedCustomer.name}</span></div>
                {selectedCustomer.email && <div className="flex items-center gap-2 text-sm"><Mail size={13} className="text-gray-400" /><span className="text-gray-600">{selectedCustomer.email}</span></div>}
                {selectedCustomer.phone && <div className="flex items-center gap-2 text-sm"><Phone size={13} className="text-gray-400" /><span className="text-gray-600">{selectedCustomer.phone}</span></div>}
              </div>
              {['Billing Address', 'Shipping Address'].map(title => (
                <div key={title} className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</p>
                  {selectedCustomer.address
                    ? <div className="flex items-start gap-2 text-sm"><MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" /><span className="text-gray-600">{selectedCustomer.address}</span></div>
                    : <p className="text-xs text-gray-400">No address on file</p>}
                  {selectedCustomer.phone && <div className="flex items-center gap-2 text-sm"><Phone size={13} className="text-gray-400" /><span className="text-gray-600">{selectedCustomer.phone}</span></div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Product search & items ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">Select Product</label>
            <div className="flex gap-2 relative">
              <div className="relative flex-1">
                <input ref={productSearchRef} type="text" value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true) }}
                  onFocus={() => setShowProductDropdown(true)}
                  placeholder="Type and Search"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                {searchingProduct && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-gray-400" />}
                {showProductDropdown && productResults.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                    {productResults.map(p => (
                      <button key={p.id} onClick={() => addProduct(p)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                        {p.images?.[0]
                          ? <img src={p.images[0]} alt={p.name} className="w-8 h-8 rounded object-cover shrink-0" />
                          : <div className="w-8 h-8 rounded bg-gray-100 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-500">{formatCurrency(p.price)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => productSearchRef.current?.focus()}
                className="px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 flex items-center gap-1.5 whitespace-nowrap">
                <Plus size={14} /> Add Product
              </button>
            </div>
          </div>

          {items.length > 0 && (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase" colSpan={2}>Product</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Price</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Quantity</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Total</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => (
                    <tr key={item.product_id}>
                      <td className="px-4 py-3 w-12">
                        {item.image ? <img src={item.image} alt={item.name} className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 rounded bg-gray-100" />}
                      </td>
                      <td className="px-2 py-3">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        {item.compare_at_price && item.compare_at_price > item.price && (
                          <p className="text-xs text-gray-400 line-through">{formatCurrency(item.compare_at_price)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.price)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => updateQty(item.product_id, -1)}
                            className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50">
                            <Minus size={12} />
                          </button>
                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <button onClick={() => updateQty(item.product_id, 1)}
                            className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50">
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.price * item.quantity)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => removeItem(item.product_id)} className="text-red-400 hover:text-red-600"><X size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Notes + Summary ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 text-sm">Notes</h2>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              placeholder="Add a note for this order…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm">
            <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="flex justify-between text-gray-600"><span>Order Total</span><span>{formatCurrency(subtotalOriginal)}</span></div>
            {itemDiscount > 0 && <div className="flex justify-between text-red-600"><span>Item Discount</span><span>(-) {formatCurrency(itemDiscount)}</span></div>}
            <div className="flex justify-between items-center text-gray-600">
              <span>Additional Discount</span>
              <input type="number" value={additionalDiscount} onChange={e => setAdditionalDiscount(e.target.value)}
                min="0" placeholder="0"
                className="w-24 px-2 py-1 text-xs border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-gray-900" />
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span>Shipping Charges</span>
              <input type="number" value={shippingCharge} onChange={e => setShippingCharge(e.target.value)}
                min="0" placeholder="0"
                className="w-24 px-2 py-1 text-xs border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-gray-900" />
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900">
              <span>Total</span><span>{formatCurrency(total)}</span>
            </div>
            <div className="mt-3 bg-gray-900 text-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="font-medium">Amount Payable</span>
              <span className="font-bold text-base">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button onClick={() => navigate('/orders')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={() => draftMutation.mutate()} disabled={draftMutation.isPending}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            {draftMutation.isPending && <Loader2 size={13} className="animate-spin inline mr-1" />}
            Save as Draft
          </button>
          <button onClick={handleSaveAsOrderClick}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg">
            Save as Order
          </button>
        </div>
      </div>

      {/* Save as Order Modal */}
      {showSaveModal && (
        <SaveAsOrderModal
          onClose={() => setShowSaveModal(false)}
          onConfirm={handleModalConfirm}
          loading={saving}
          error={modalError}
        />
      )}
    </div>
  )
}
