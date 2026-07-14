import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, limit, Timestamp,
  runTransaction, type Transaction,
} from '@/lib/firebase'
import { formatCurrency } from '@/lib/utils'
import { sendOrderStatusEmail, type OrderForEmail } from '@/lib/emailService'
import { User, Mail, Phone, MapPin, X, Plus, Minus, Loader2, ChevronLeft } from 'lucide-react'

interface CustomerProfile { user_id: string; name: string | null; email: string | null; phone: string | null; address: string | null }
interface WalkInCustomer  { name: string; email: string; phone: string; address: string }
interface ProductResult   { id: string; name: string; price: number; compare_at_price: number | null; images: string[]; inventory_count: number | null }
interface OrderItem       { product_id: string; name: string; price: number; compare_at_price: number | null; quantity: number; image: string | null }
type CustomerMode   = 'customer' | 'walkin'
type SaveAsWorkflow = 'order_only' | 'order_processing' | 'order_processing_invoice' | 'order_processing_invoice_delivered'

const SAVE_AS_OPTIONS: { value: SaveAsWorkflow; label: string }[] = [
  { value: 'order_only',                         label: 'Order' },
  { value: 'order_processing',                   label: 'Order + Mark as Processing' },
  { value: 'order_processing_invoice',           label: 'Order + Processing + Generate Invoice' },
  { value: 'order_processing_invoice_delivered', label: 'Order + Processing + Invoice + Delivered' },
]

interface SaveModalResult { deliveryType: 'self_pickup' | 'delivery'; workflow: SaveAsWorkflow; paymentMethod: string; markAsPaid: boolean; transactionNote: string }

function SaveAsOrderModal({ onClose, onConfirm, loading, error }: {
  onClose: () => void; onConfirm: (opts: SaveModalResult) => void; loading: boolean; error: string | null
}) {
  const [deliveryType,    setDeliveryType]    = useState<'self_pickup' | 'delivery'>('self_pickup')
  const [workflow,        setWorkflow]        = useState<SaveAsWorkflow>('order_processing_invoice_delivered')
  const [paymentMethod,   setPaymentMethod]   = useState('cod')
  const [markAsPaid,      setMarkAsPaid]      = useState(false)
  const [transactionNote, setTransactionNote] = useState('')
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-base">Save as Order</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Delivery</label>
            <select value={deliveryType} onChange={e => setDeliveryType(e.target.value as 'self_pickup' | 'delivery')}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="self_pickup">Self Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Save as</label>
            <select value={workflow} onChange={e => setWorkflow(e.target.value as SaveAsWorkflow)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              {SAVE_AS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Mode of Payment *</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="cod">COD</option><option value="upi">UPI</option>
              <option value="neft">NEFT</option><option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="markpaid" checked={markAsPaid} onChange={e => setMarkAsPaid(e.target.checked)} className="w-4 h-4 rounded border-gray-300 accent-gray-900" />
            <label htmlFor="markpaid" className="text-sm text-gray-700 font-medium">Mark as Paid</label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Transaction Details / Notes</label>
            <textarea value={transactionNote} onChange={e => setTransactionNote(e.target.value)} rows={3}
              placeholder="Transaction ID, reference, or notes…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
          <button onClick={() => onConfirm({ deliveryType, workflow, paymentMethod, markAsPaid, transactionNote })}
            disabled={loading}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-60">
            {loading && <Loader2 size={13} className="animate-spin" />} Confirm
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Generate order number (atomic counter, shared with connect app) ──
async function nextOrderNumber(): Promise<string> {
  const counterRef = doc(db, 'counters', 'order_counter');
  const newValue = await runTransaction(db, async (tx: Transaction) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? (snap.data().value as number) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next }, { merge: true });
    return next;
  });
  return `FST${String(newValue).padStart(3, '0')}`;
}

export default function AddOrder() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [mode,            setMode]            = useState<CustomerMode>('customer')
  const [customerSearch,  setCustomerSearch]  = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerProfile[]>([])
  const [selectedCustomer,setSelectedCustomer]= useState<CustomerProfile | null>(null)
  const [walkin,          setWalkin]          = useState<WalkInCustomer>({ name: '', email: '', phone: '', address: '' })
  const [searchingCust,   setSearchingCust]   = useState(false)
  const [productSearch,   setProductSearch]   = useState('')
  const [productResults,  setProductResults]  = useState<ProductResult[]>([])
  const [searchingProd,   setSearchingProd]   = useState(false)
  const [showProdDrop,    setShowProdDrop]    = useState(false)
  const [items,           setItems]           = useState<OrderItem[]>([])
  const [notes,           setNotes]           = useState('')
  const [additionalDiscount, setAdditionalDiscount] = useState('')
  const [shippingCharge,  setShippingCharge]  = useState('0')
  const [formError,       setFormError]       = useState<string | null>(null)
  const [showSaveModal,   setShowSaveModal]   = useState(false)
  const [modalError,      setModalError]      = useState<string | null>(null)
  const [saving,          setSaving]          = useState(false)
  const productSearchRef = useRef<HTMLInputElement>(null)

  // Customer search
  useEffect(() => {
    if (mode !== 'customer' || !customerSearch.trim()) { setCustomerResults([]); return }
    const t = setTimeout(async () => {
      setSearchingCust(true)
      const q = customerSearch.toLowerCase()
      const snap = await getDocs(collection(db, 'user_profiles'))
      const results = snap.docs
        .map(d => ({ user_id: d.id, ...d.data() } as CustomerProfile))
        .filter(c => (c.name ?? '').toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q))
        .slice(0, 8)
      setCustomerResults(results); setSearchingCust(false)
    }, 300)
    return () => clearTimeout(t)
  }, [customerSearch, mode])

  // Product search
  useEffect(() => {
    if (!productSearch.trim()) { setProductResults([]); return }
    const t = setTimeout(async () => {
      setSearchingProd(true)
      const snap = await getDocs(query(collection(db, 'products'), where('status', '==', 'published')))
      const q = productSearch.toLowerCase()
      const results = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ProductResult))
        .filter(p => p.name.toLowerCase().includes(q))
        .slice(0, 8)
      setProductResults(results); setSearchingProd(false)
    }, 300)
    return () => clearTimeout(t)
  }, [productSearch])

  const addProduct = (p: ProductResult) => {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === p.id)
      if (existing) return prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product_id: p.id, name: p.name, price: p.price, compare_at_price: p.compare_at_price, quantity: 1, image: p.images?.[0] ?? null }]
    })
    setProductSearch(''); setProductResults([]); setShowProdDrop(false)
  }
  const updateQty  = (pid: string, delta: number) => setItems(prev => prev.map(i => i.product_id === pid ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i))
  const removeItem = (pid: string) => setItems(prev => prev.filter(i => i.product_id !== pid))

  const subtotalOrig = items.reduce((s, i) => s + (i.compare_at_price ?? i.price) * i.quantity, 0)
  const subtotal     = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const itemDiscount = subtotalOrig - subtotal
  const addDiscount  = parseFloat(additionalDiscount) || 0
  const shipping     = parseFloat(shippingCharge) || 0
  const total        = Math.max(0, subtotal - addDiscount + shipping)

  const buildShippingAddress = () => {
    const isWalkin = mode === 'walkin'
    if (isWalkin && walkin.address) return { name: walkin.name, phone: walkin.phone, address: walkin.address, city: '', state: '', pincode: '' }
    if (!isWalkin && selectedCustomer?.address) return { name: selectedCustomer.name ?? '', phone: selectedCustomer.phone ?? '', address: selectedCustomer.address, city: '', state: '', pincode: '' }
    return null
  }

  const handleSaveAsOrderClick = () => {
    if (items.length === 0)                         { setFormError('Add at least one product'); return }
    if (mode === 'walkin' && !walkin.name.trim())   { setFormError('Customer name is required'); return }
    setFormError(null); setModalError(null); setShowSaveModal(true)
  }

  const handleModalConfirm = async (opts: SaveModalResult) => {
    setSaving(true); setModalError(null)
    try {
      const isWalkin    = mode === 'walkin'
      const guestName   = isWalkin ? walkin.name  : (selectedCustomer?.name  ?? null)
      const guestEmail  = isWalkin ? walkin.email : (selectedCustomer?.email ?? null)
      const guestPhone  = isWalkin ? walkin.phone : (selectedCustomer?.phone ?? null)
      const userId      = isWalkin ? null : (selectedCustomer?.user_id ?? null)
      const shippingAddr = buildShippingAddress()
      const order_number = await nextOrderNumber()
      const now = Timestamp.now()

      const orderRef = await addDoc(collection(db, 'orders'), {
        user_id: userId, guest_name: guestName, guest_email: guestEmail, guest_phone: guestPhone,
        order_number, status: 'confirmed',
        payment_method: opts.paymentMethod,
        payment_status: opts.markAsPaid ? 'paid' : 'pending',
        paid_at: opts.markAsPaid ? now : null,
        subtotal, shipping_charge: shipping, total,
        note: [notes.trim(), opts.transactionNote.trim()].filter(Boolean).join(' | ') || null,
        shipping_address: shippingAddr,
        items: items.map(i => ({ product_id: i.product_id, name: i.name, price: i.price, quantity: i.quantity, image: i.image })),
        confirmed_at: now, created_at: now, updated_at: now,
      })

      // ── Decrement inventory_count for tracked products ──────────
      await Promise.all(
        items.map(async (item) => {
          await runTransaction(db, async (tx: Transaction) => {
            const ref = doc(db, 'products', item.product_id)
            const snap = await tx.get(ref)
            if (!snap.exists()) return
            const inv = snap.data()?.inventory_count
            if (inv === null || inv === undefined) return
            tx.update(ref, { inventory_count: Math.max(0, inv - item.quantity) })
          })
        })
      )

      let currentStatus = 'confirmed'

      // Mark as Processing
      if (['order_processing','order_processing_invoice','order_processing_invoice_delivered'].includes(opts.workflow)) {
        await updateDoc(doc(db, 'orders', orderRef.id), { status: 'processing', updated_at: now })
        await addDoc(collection(db, 'order_status_history'), {
          order_id: orderRef.id, action: 'Marked Processing', old_status: currentStatus, new_status: 'processing', created_at: now,
        })
        currentStatus = 'processing'
      }

      // Generate Invoice
      if (['order_processing_invoice','order_processing_invoice_delivered'].includes(opts.workflow)) {
        const invSnap = await getDocs(query(collection(db, 'invoices'), orderBy('created_at', 'desc'), limit(1)))
        const invNum  = invSnap.docs.length + 1
        const invoice_number = `INV-${String(invNum).padStart(6, '0')}`
        await addDoc(collection(db, 'invoices'), {
          order_id: orderRef.id, invoice_number, status: 'pending_shipment',
          notes: opts.transactionNote || null,
          invoice_items: items.map(i => ({ product_id: i.product_id, product_name: i.name, ordered_qty: i.quantity, fulfilled_qty: i.quantity, price: i.price })),
          created_at: now, invoice_date: now,
        })
        await updateDoc(doc(db, 'orders', orderRef.id), { status: 'fulfilled', fulfillment_status: 'pending_shipment', updated_at: now })
        currentStatus = 'fulfilled'
      }

      // Mark as Delivered
      if (opts.workflow === 'order_processing_invoice_delivered') {
        await updateDoc(doc(db, 'orders', orderRef.id), { status: 'delivered', fulfillment_status: 'delivered', delivered_at: now, updated_at: now })
        currentStatus = 'delivered'
      }

      // Send confirmation email
      try {
        const freshSnap = await getDoc(doc(db, 'orders', orderRef.id))
        if (freshSnap.exists()) {
          const freshOrder = freshSnap.data()
          const toEmail = freshOrder.guest_email || freshOrder.customer_email
          if (toEmail) {
            const emailOrder: OrderForEmail = {
              id:               orderRef.id,
              order_number:     freshOrder.order_number,
              customer_email:   freshOrder.customer_email ?? null,
              guest_email:      freshOrder.guest_email ?? null,
              guest_name:       freshOrder.guest_name ?? null,
              shipping_address: freshOrder.shipping_address ?? null,
              items:            freshOrder.items ?? [],
              subtotal:         freshOrder.subtotal,
              shipping_charge:  freshOrder.shipping_charge,
              total:            freshOrder.total,
              payment_method:   freshOrder.payment_method,
              tracking_number:  freshOrder.tracking_number ?? null,
              courier_name:     freshOrder.courier_name ?? null,
            }
            await sendOrderStatusEmail(emailOrder, currentStatus)
          }
        }
      } catch { /* email non-critical */ }

      qc.invalidateQueries({ queryKey: ['orders'] })
      navigate('/orders')
    } catch (e) { setModalError(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/orders')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
            <div>
              <p className="text-xs text-gray-400"><Link to="/orders" className="hover:text-gray-600">Orders</Link> / Add Order</p>
              <h1 className="text-xl font-bold text-gray-900">Add Order</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/orders')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSaveAsOrderClick}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              Save as Order
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 max-w-5xl mx-auto space-y-5">
        {formError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{formError}</p>}

        {/* Customer section */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="flex gap-2">
            {(['customer', 'walkin'] as CustomerMode[]).map(m => (
              <button key={m} onClick={() => { setMode(m); setSelectedCustomer(null); setCustomerSearch('') }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${mode === m ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {m === 'customer' ? 'Customer' : 'Walk-In'}
              </button>
            ))}
          </div>

          {mode === 'customer' && !selectedCustomer && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-700">Select Customer</label>
              <div className="relative">
                <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="Search by name, email, or phone"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                {searchingCust && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-gray-400" />}
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

          {mode === 'walkin' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { field: 'name' as const, label: 'Full Name *', placeholder: 'Customer name' },
                { field: 'phone' as const, label: 'Phone', placeholder: '+91 XXXXX XXXXX' },
                { field: 'email' as const, label: 'Email', placeholder: 'customer@email.com' },
                { field: 'address' as const, label: 'Address', placeholder: 'Full address' },
              ]).map(({ field, label, placeholder }) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input type="text" value={walkin[field]} onChange={e => setWalkin(w => ({ ...w, [field]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              ))}
            </div>
          )}

          {mode === 'customer' && selectedCustomer && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Customer Details</p>
                  <button onClick={() => setSelectedCustomer(null)} className="text-xs text-gray-400 hover:text-gray-700">Change</button>
                </div>
                <div className="flex items-center gap-2 text-sm"><User size={13} className="text-gray-400" /><span>{selectedCustomer.name}</span></div>
                {selectedCustomer.email && <div className="flex items-center gap-2 text-sm"><Mail size={13} className="text-gray-400" /><span>{selectedCustomer.email}</span></div>}
                {selectedCustomer.phone && <div className="flex items-center gap-2 text-sm"><Phone size={13} className="text-gray-400" /><span>{selectedCustomer.phone}</span></div>}
              </div>
              {['Billing Address', 'Shipping Address'].map(title => (
                <div key={title} className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</p>
                  {selectedCustomer.address
                    ? <div className="flex items-start gap-2 text-sm"><MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" /><span className="text-gray-600">{selectedCustomer.address}</span></div>
                    : <p className="text-xs text-gray-400">No address on file</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product search */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">Select Product</label>
            <div className="flex gap-2 relative">
              <div className="relative flex-1">
                <input ref={productSearchRef} type="text" value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProdDrop(true) }}
                  onFocus={() => setShowProdDrop(true)}
                  placeholder="Type and Search"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                {searchingProd && <Loader2 size={14} className="absolute right-3 top-3 animate-spin text-gray-400" />}
                {showProdDrop && productResults.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                    {productResults.map(p => (
                      <button key={p.id} onClick={() => addProduct(p)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                        {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-8 h-8 rounded object-cover shrink-0" /> : <div className="w-8 h-8 rounded bg-gray-100 shrink-0" />}
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
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Qty</th>
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
                      <td className="px-2 py-3"><p className="font-medium text-gray-900">{item.name}</p></td>
                      <td className="px-4 py-3 text-right">{formatCurrency(item.price)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button onClick={() => updateQty(item.product_id, -1)} className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50"><Minus size={12} /></button>
                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <button onClick={() => updateQty(item.product_id, 1)}  className="w-6 h-6 border border-gray-300 rounded flex items-center justify-center hover:bg-gray-50"><Plus size={12} /></button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{formatCurrency(item.price * item.quantity)}</td>
                      <td className="px-4 py-3"><button onClick={() => removeItem(item.product_id)} className="text-red-400 hover:text-red-600"><X size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Notes + Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 text-sm">Notes</h2>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Add a note for this order…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-2 text-sm">
            <h2 className="font-semibold text-gray-900 mb-3">Summary</h2>
            <div className="flex justify-between text-gray-600"><span>Order Total</span><span>{formatCurrency(subtotalOrig)}</span></div>
            {itemDiscount > 0 && <div className="flex justify-between text-red-600"><span>Item Discount</span><span>(-) {formatCurrency(itemDiscount)}</span></div>}
            <div className="flex justify-between items-center text-gray-600">
              <span>Additional Discount</span>
              <input type="number" value={additionalDiscount} onChange={e => setAdditionalDiscount(e.target.value)} min="0" placeholder="0"
                className="w-24 px-2 py-1 text-xs border border-gray-200 rounded text-right focus:outline-none" />
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span>Shipping Charges</span>
              <input type="number" value={shippingCharge} onChange={e => setShippingCharge(e.target.value)} min="0" placeholder="0"
                className="w-24 px-2 py-1 text-xs border border-gray-200 rounded text-right focus:outline-none" />
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900"><span>Total</span><span>{formatCurrency(total)}</span></div>
            <div className="mt-3 bg-gray-900 text-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="font-medium">Amount Payable</span><span className="font-bold text-base">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pb-6">
          <button onClick={() => navigate('/orders')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSaveAsOrderClick}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg">
            Save as Order
          </button>
        </div>
      </div>

      {showSaveModal && (
        <SaveAsOrderModal onClose={() => setShowSaveModal(false)} onConfirm={handleModalConfirm} loading={saving} error={modalError} />
      )}
    </div>
  )
}
