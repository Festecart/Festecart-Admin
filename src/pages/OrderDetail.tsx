import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  db, doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, Timestamp,
} from '@/lib/firebase'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Order, Invoice, OrderItem } from '@/types'
import { sendOrderStatusEmail, type OrderForEmail } from '@/lib/emailService'
import {
  ChevronLeft, ChevronRight, User, MapPin, Phone, Mail,
  Package, AlertTriangle, Loader2, IndianRupee, FileText,
  Truck, CheckCircle2, X, Clock, History,
} from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────
function customerName(o: Order)  { return o.guest_name?.trim()  || o.shipping_address?.name?.trim()  || '—' }
function customerPhone(o: Order) { return o.guest_phone?.trim() || o.shipping_address?.phone?.trim() || '—' }
function customerEmail(o: Order) { return o.customer_email?.trim() || o.guest_email?.trim() || '—' }
function isOrderPaid(o: Order)   { return o.payment_method !== 'cod' || o.payment_status === 'paid' }

const STATUS_DOT: Record<string, string> = {
  confirmed: 'bg-gray-400', processing: 'bg-blue-500',
  partially_fulfilled: 'bg-orange-400', fulfilled: 'bg-green-400',
  shipped: 'bg-blue-600', out_for_delivery: 'bg-orange-500',
  partially_delivered: 'bg-orange-500',
  delivered: 'bg-green-600', cancelled: 'bg-gray-300', completed: 'bg-black',
}
const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed', processing: 'Processing',
  partially_fulfilled: 'Partially Fulfilled', fulfilled: 'Fulfilled',
  shipped: 'Shipped', out_for_delivery: 'Out for Delivery',
  partially_delivered: 'Partially Delivered',
  delivered: 'Delivered', cancelled: 'Cancelled', completed: 'Completed',
}
const FULFILLMENT_LABEL: Record<string, string> = {
  pending_shipment: 'Pending Shipment', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
}

// ── Firebase helpers ──────────────────────────────────────────
function tsToStr(ts: unknown): string | null {
  if (!ts) return null
  if (ts instanceof Timestamp) return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return null
}

function toOrder(id: string, data: Record<string, unknown>): Order {
  return {
    id,
    order_number:        String(data.order_number ?? ''),
    user_id:             (data.user_id as string | null) ?? null,
    customer_email:      (data.customer_email as string | null) ?? null,
    guest_name:          (data.guest_name as string | null) ?? null,
    guest_email:         (data.guest_email as string | null) ?? null,
    guest_phone:         (data.guest_phone as string | null) ?? null,
    status:              data.status as Order['status'],
    payment_method:      String(data.payment_method ?? 'cod'),
    payment_status:      (data.payment_status as string | null) ?? null,
    acceptance_status:   (data.acceptance_status as string | null) ?? null,
    fulfillment_status:  (data.fulfillment_status as string | null) ?? null,
    paid_at:             tsToStr(data.paid_at),
    subtotal:            Number(data.subtotal ?? 0),
    shipping_charge:     Number(data.shipping_charge ?? 0),
    total:               Number(data.total ?? 0),
    note:                (data.note as string | null) ?? null,
    coupon_code:         (data.coupon_code as string | null) ?? null,
    shipping_address:    (data.shipping_address as Order['shipping_address']) ?? null,
    items:               (data.items as Order['items']) ?? [],
    tracking_number:     (data.tracking_number as string | null) ?? null,
    courier_name:        (data.courier_name as string | null) ?? null,
    confirmed_at:        tsToStr(data.confirmed_at),
    shipped_at:          tsToStr(data.shipped_at),
    out_for_delivery_at: tsToStr(data.out_for_delivery_at),
    delivered_at:        tsToStr(data.delivered_at),
    cancelled_at:        tsToStr(data.cancelled_at),
    created_at:          tsToStr(data.created_at) ?? new Date().toISOString(),
    updated_at:          tsToStr(data.updated_at) ?? new Date().toISOString(),
  } as Order
}

function toInvoice(id: string, data: Record<string, unknown>): Invoice {
  return {
    id,
    order_id:           String(data.order_id ?? ''),
    invoice_number:     String(data.invoice_number ?? ''),
    invoice_date:       tsToStr(data.invoice_date) ?? tsToStr(data.created_at) ?? '',
    notes:              (data.notes as string | null) ?? null,
    status:             String(data.status ?? 'pending_shipment'),
    courier:            (data.courier as string | null) ?? null,
    tracking_number:    (data.tracking_number as string | null) ?? null,
    sent_at:            tsToStr(data.sent_at),
    estimated_delivery: tsToStr(data.estimated_delivery),
    delivered_at:       tsToStr(data.delivered_at),
    is_prepaid:         Boolean(data.is_prepaid),
    created_at:         tsToStr(data.created_at) ?? '',
    invoice_items:      (data.invoice_items as Invoice['invoice_items']) ?? [],
  }
}

// ── Modal wrapper ─────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

function ConfirmModal({ title, message, onClose, onConfirm, loading }: {
  title: string; message: string; onClose: () => void; onConfirm: () => void; loading?: boolean
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-gray-600 mb-5">{message}</p>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Close</button>
        <button onClick={onConfirm} disabled={loading}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {loading && <Loader2 size={13} className="animate-spin" />} Confirm
        </button>
      </div>
    </Modal>
  )
}

// ── Firebase hooks ────────────────────────────────────────────
function useOrderData(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'orders', id))
      if (!snap.exists()) throw new Error('Order not found')
      return toOrder(snap.id, snap.data() as Record<string, unknown>)
    },
    enabled: !!id,
  })
}

function useInvoices(orderId: string) {
  return useQuery({
    queryKey: ['invoices', orderId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'invoices'), where('order_id', '==', orderId), orderBy('created_at', 'asc'))
      )
      return snap.docs.map(d => toInvoice(d.id, d.data() as Record<string, unknown>))
    },
    enabled: !!orderId,
  })
}

function useOrderHistory(orderId: string) {
  return useQuery({
    queryKey: ['order-history', orderId],
    queryFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'order_status_history'),
          where('order_id', '==', orderId), orderBy('created_at', 'desc'))
      )
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!orderId,
  })
}

async function logHistory(orderId: string, action: string, oldStatus: string | null, newStatus: string | null, remarks?: string) {
  await addDoc(collection(db, 'order_status_history'), {
    order_id: orderId, action,
    old_status: oldStatus ?? null,
    new_status: newStatus ?? null,
    remarks: remarks ?? null,
    created_at: Timestamp.now(),
  })
}

async function sendStatusEmail(order: Order, newStatus: string, invoice?: Partial<Invoice>) {
  const emailOrder: OrderForEmail = {
    id:               order.id,
    order_number:     order.order_number,
    customer_email:   order.customer_email,
    guest_email:      order.guest_email,
    guest_name:       order.guest_name,
    shipping_address: order.shipping_address,
    items:            order.items ?? [],
    subtotal:         order.subtotal,
    shipping_charge:  order.shipping_charge,
    total:            order.total,
    payment_method:   order.payment_method,
    tracking_number:  order.tracking_number,
    courier_name:     order.courier_name,
  };
  await sendOrderStatusEmail(emailOrder, newStatus, {
    courierName:    invoice?.courier    ?? order.courier_name,
    trackingNumber: invoice?.tracking_number ?? order.tracking_number,
  });
}

// ── Generate Invoice Modal ────────────────────────────────────
function GenerateInvoiceModal({ order, invoices, onClose, onSuccess }: {
  order: Order; invoices: Invoice[]; onClose: () => void; onSuccess: () => void
}) {
  const qc = useQueryClient()
  const items = order.items ?? []

  const fulfilledQty = (productId: string) =>
    invoices.flatMap(inv => inv.invoice_items ?? [])
      .filter(ii => ii.product_id === productId)
      .reduce((s, ii) => s + ii.fulfilled_qty, 0)

  const remainingQty = (item: OrderItem) => item.quantity - fulfilledQty(item.product_id)

  const [selected,    setSelected]    = useState<Record<string, boolean>>({})
  const [fulfillQty,  setFulfillQty]  = useState<Record<string, number>>(
    Object.fromEntries(items.map(i => [i.product_id, Math.max(1, remainingQty(i))]))
  )
  const [notes,   setNotes]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const toggleAll = (checked: boolean) =>
    setSelected(Object.fromEntries(items.filter(i => remainingQty(i) > 0).map(i => [i.product_id, checked])))

  const selectedItems = items.filter(i => selected[i.product_id] && remainingQty(i) > 0)

  const handleSubmit = async () => {
    if (selectedItems.length === 0) { setError('Select at least one product'); return }
    setLoading(true); setError(null)
    try {
      // Get next invoice number
      const invSnap = await getDocs(
        query(collection(db, 'invoices'), orderBy('created_at', 'desc'))
      )
      const nextInvNum = invSnap.docs.length + 1
      const invoice_number = `INV-${String(nextInvNum).padStart(6, '0')}`

      const invRef = await addDoc(collection(db, 'invoices'), {
        order_id: order.id,
        invoice_number,
        notes: notes || null,
        status: 'pending_shipment',
        invoice_items: selectedItems.map(i => ({
          product_id: i.product_id,
          product_name: i.name,
          ordered_qty: i.quantity,
          fulfilled_qty: fulfillQty[i.product_id] ?? 1,
          price: i.price,
        })),
        created_at: Timestamp.now(),
        invoice_date: Timestamp.now(),
      })

      const totalFulfilled = items.every(i => {
        const nowFulfilled = fulfilledQty(i.product_id) + (fulfillQty[i.product_id] ?? 0)
        return nowFulfilled >= i.quantity
      })
      const newStatus = totalFulfilled ? 'fulfilled' : 'partially_fulfilled'
      await updateDoc(doc(db, 'orders', order.id), {
        status: newStatus,
        fulfillment_status: 'pending_shipment',
        updated_at: Timestamp.now(),
      })
      await logHistory(order.id, 'Invoice Generated', order.status, newStatus, `Invoice ${invoice_number}`)

      const freshSnap = await getDoc(doc(db, 'orders', order.id))
      if (freshSnap.exists()) {
        sendStatusEmail(toOrder(freshSnap.id, freshSnap.data() as Record<string,unknown>), newStatus)
          .catch(e => console.warn('[Email] Invoice status email failed:', e instanceof Error ? e.message : e))
      }

      qc.invalidateQueries({ queryKey: ['orders', order.id] })
      qc.invalidateQueries({ queryKey: ['invoices', order.id] })
      void invRef // suppress unused warning
      onSuccess()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Generate Invoice" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input type="checkbox" id="all"
            onChange={e => toggleAll(e.target.checked)}
            checked={selectedItems.length === items.filter(i => remainingQty(i) > 0).length && selectedItems.length > 0} />
          <label htmlFor="all" className="text-sm font-medium text-gray-700">Select All Products</label>
        </div>
        {items.filter(i => remainingQty(i) > 0).map(item => (
          <div key={item.product_id} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={!!selected[item.product_id]}
                onChange={e => setSelected(s => ({ ...s, [item.product_id]: e.target.checked }))} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{item.name}</p>
                <p className="text-xs text-gray-500">Ordered: {item.quantity} | Remaining: {remainingQty(item)}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fulfill Qty</label>
                <select value={fulfillQty[item.product_id] ?? 1}
                  onChange={e => setFulfillQty(q => ({ ...q, [item.product_id]: parseInt(e.target.value) }))}
                  className="text-sm border border-gray-300 rounded px-2 py-1">
                  {Array.from({ length: remainingQty(item) }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
        <div>
          <label className="text-xs font-medium text-gray-700 block mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={handleSubmit} disabled={loading}
            className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {loading && <Loader2 size={13} className="animate-spin" />} Submit Invoice
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Tracking Modal ────────────────────────────────────────────
function TrackingModal({ invoice, onClose, onSuccess }: {
  invoice: Invoice; onClose: () => void; onSuccess: () => void
}) {
  const qc = useQueryClient()
  const now = new Date()
  const toLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const defaultDelivery = new Date(now); defaultDelivery.setDate(now.getDate() + 7)

  const [form, setForm] = useState({
    courier:            invoice.courier ?? 'Self-delivery',
    tracking_number:    invoice.tracking_number ?? '',
    sent_at:            invoice.sent_at ? invoice.sent_at.slice(0, 16) : toLocal(now),
    estimated_delivery: invoice.estimated_delivery ? invoice.estimated_delivery.slice(0, 16) : toLocal(defaultDelivery),
  })
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const f = (field: string, val: string) => setForm(p => ({ ...p, [field]: val }))

  const handleSave = async () => {
    if (!form.courier) { setError('Courier is required'); return }
    setLoading(true); setError(null)
    try {
      const sentAt = form.sent_at ? new Date(form.sent_at).toISOString() : new Date().toISOString()
      const estDelivery = form.estimated_delivery ? new Date(form.estimated_delivery).toISOString() : null

      await updateDoc(doc(db, 'invoices', invoice.id), {
        courier: form.courier,
        tracking_number: form.tracking_number || null,
        sent_at: sentAt,
        estimated_delivery: estDelivery,
        status: 'shipped',
        updated_at: Timestamp.now(),
      })
      await updateDoc(doc(db, 'orders', invoice.order_id), {
        status: 'shipped',
        fulfillment_status: 'shipped',
        shipped_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      })

      const freshSnap = await getDoc(doc(db, 'orders', invoice.order_id))
      if (freshSnap.exists()) {
        sendStatusEmail(toOrder(freshSnap.id, freshSnap.data() as Record<string,unknown>), 'shipped', {
          ...invoice, courier: form.courier,
          tracking_number: form.tracking_number || null, sent_at: sentAt, estimated_delivery: estDelivery,
        }).catch(e => console.warn('[Email] Shipped email failed:', e instanceof Error ? e.message : e))
      }
      qc.invalidateQueries({ queryKey: ['invoices', invoice.order_id] })
      qc.invalidateQueries({ queryKey: ['orders', invoice.order_id] })
      onSuccess()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setLoading(false) }
  }

  return (
    <Modal title="Add Tracking Information" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Courier *</label>
          <input type="text" value={form.courier} onChange={e => f('courier', e.target.value)}
            placeholder="e.g. Delhivery, Self-delivery"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tracking Number <span className="text-gray-400 font-normal">(optional)</span></label>
          <input type="text" value={form.tracking_number} onChange={e => f('tracking_number', e.target.value)}
            placeholder="AWB / Tracking No"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sent Date & Time</label>
            <input type="datetime-local" value={form.sent_at} onChange={e => f('sent_at', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Est. Delivery</label>
            <input type="datetime-local" value={form.estimated_delivery} onChange={e => f('estimated_delivery', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none" />
          </div>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
          <button onClick={handleSave} disabled={loading}
            className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg">
            {loading && <Loader2 size={13} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Mark Delivered Modal ──────────────────────────────────────
function MarkDeliveredModal({ invoice, order, onClose, onSuccess }: {
  invoice: Invoice; order: Order; onClose: () => void; onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const paid = isOrderPaid(order)

  const confirm = async () => {
    if (!checked) return
    setLoading(true)
    await updateDoc(doc(db, 'invoices', invoice.id), {
      status: 'delivered', delivered_at: Timestamp.now(), updated_at: Timestamp.now(),
    })
    const invSnap = await getDocs(
      query(collection(db, 'invoices'), where('order_id', '==', invoice.order_id))
    )
    const allInvoices = invSnap.docs.map(d => ({ ...d.data(), id: d.id }) as Invoice & Record<string, unknown>)
    const fulfilledQtyMap: Record<string, number> = {}
    allInvoices.forEach(inv => {
      (inv.invoice_items ?? []).forEach((ii: { product_id: string; fulfilled_qty: number }) => {
        fulfilledQtyMap[ii.product_id] = (fulfilledQtyMap[ii.product_id] ?? 0) + ii.fulfilled_qty
      })
    })
    const allDelivered = (order.items ?? []).every(
      item => (fulfilledQtyMap[item.product_id] ?? 0) >= item.quantity
    )
    const newOrderStatus = allDelivered ? 'delivered' : 'partially_delivered'
    await updateDoc(doc(db, 'orders', invoice.order_id), {
      status: newOrderStatus,
      fulfillment_status: allDelivered ? 'delivered' : 'partially_delivered',
      delivered_at: allDelivered ? Timestamp.now() : null,
      updated_at: Timestamp.now(),
    })
    await logHistory(invoice.order_id, 'Marked Delivered', null, newOrderStatus, `Invoice ${invoice.invoice_number}`)
    if (allDelivered) {
      const freshSnap = await getDoc(doc(db, 'orders', invoice.order_id))
      if (freshSnap.exists()) {
        sendStatusEmail(toOrder(freshSnap.id, freshSnap.data() as Record<string,unknown>), 'delivered', invoice)
          .catch(e => console.warn('[Email] Delivered email failed:', e instanceof Error ? e.message : e))
      }
    }
    qc.invalidateQueries({ queryKey: ['invoices', invoice.order_id] })
    qc.invalidateQueries({ queryKey: ['orders', invoice.order_id] })
    setLoading(false); onSuccess()
  }

  return (
    <Modal title="Mark as Delivered" onClose={onClose}>
      {!paid && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-600 shrink-0" />
          <p className="text-sm text-red-700 font-medium">Payment not received. Mark as Paid before delivering.</p>
        </div>
      )}
      <div className="space-y-3 text-sm text-gray-700">
        {invoice.tracking_number && <p><span className="text-gray-400">Tracking No:</span> <strong>{invoice.tracking_number}</strong></p>}
        {invoice.courier         && <p><span className="text-gray-400">Courier:</span> <strong>{invoice.courier}</strong></p>}
        <div className="flex items-center gap-2 mt-3 p-3 bg-gray-50 rounded-lg">
          <input type="checkbox" id="markdel" checked={checked} onChange={e => setChecked(e.target.checked)} disabled={!paid} />
          <label htmlFor="markdel" className={`text-sm font-medium ${paid ? 'text-gray-800' : 'text-gray-400'}`}>Mark As Delivered</label>
        </div>
      </div>
      <div className="flex gap-3 justify-end mt-4">
        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Close</button>
        <button onClick={confirm} disabled={!checked || loading || !paid}
          className="flex items-center gap-2 bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:bg-gray-400">
          {loading && <Loader2 size={13} className="animate-spin" />} Confirm
        </button>
      </div>
    </Modal>
  )
}

// ── Invoice PDF download ──────────────────────────────────────
function downloadInvoicePdf(invoice: Invoice, order: Order) {
  const items = invoice.invoice_items ?? []
  const total = items.reduce((s, i) => s + i.price * i.fulfilled_qty, 0)
  const addr = order.shipping_address
  const custName  = order.guest_name  || addr?.name  || '—'
  const custEmail = order.customer_email || order.guest_email || '—'
  const payMode   = order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method.toUpperCase()
  const invDate   = new Date(invoice.invoice_date || invoice.created_at || Date.now())
    .toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' })
  const ordDate   = new Date(order.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'2-digit', year:'numeric' })

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Invoice ${invoice.invoice_number}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:12px;padding:32px;}
h1{text-align:center;font-size:17px;margin-bottom:20px;letter-spacing:2px;}
.top{display:flex;justify-content:space-between;margin-bottom:16px;}
.logo{font-size:22px;font-weight:900;}.logo .fest{color:#e05a00;}.logo .ecart{color:#1a5c1a;}
hr{border:none;border-top:1px solid #ddd;margin:10px 0;}
.addr{display:flex;justify-content:space-between;margin-bottom:14px;gap:12px;}
.addr-col{flex:1;font-size:11px;line-height:1.7;}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11px;}
th{background:#f0f0f0;padding:7px 9px;text-align:left;border:1px solid #ccc;}
td{padding:7px 9px;border:1px solid #ddd;}
.tr{text-align:right;}.tc{text-align:center;}
.total-row td{background:#f0f0f0;font-weight:bold;}
@media print{body{padding:16px;}@page{margin:10mm;}}</style></head>
<body>
<h1>INVOICE</h1>
<div class="top">
  <div class="logo"><span class="fest">fest</span><span class="ecart">ecart</span></div>
  <div style="text-align:right;font-size:11px;line-height:1.8;"><strong>Invoice Date:</strong> ${invDate}<br/><strong>Invoice No:</strong> ${invoice.invoice_number.replace('INV-','')}<br/><strong>GSTIN:</strong> 29AFFFS9227M1Z7</div>
</div>
<div style="font-size:11px;line-height:1.6;margin-bottom:14px;"><strong>festecart,</strong><br/>No 861, 2nd floor, 5th Main, Near Hopcoms, BEML Layout, Rajarajeshwari Nagar, Bengaluru — 560098</div>
<hr/>
<div class="addr">
  <div class="addr-col"><h4 style="font-size:10px;font-weight:bold;margin-bottom:4px;text-transform:uppercase;">Shipping Address</h4>
    ${addr ? `${addr.name}<br/>${addr.address}<br/>${addr.city}, ${addr.state} - ${addr.pincode}<br/>Phone: ${addr.phone}` : custName}
  </div>
  <div class="addr-col"><h4 style="font-size:10px;font-weight:bold;margin-bottom:4px;text-transform:uppercase;">Billing Address</h4>
    ${addr ? `${addr.name}<br/>${addr.address}<br/>${addr.city}, ${addr.state} - ${addr.pincode}` : custName}
  </div>
  <div style="text-align:right;font-size:11px;line-height:1.8;"><strong>Order Date:</strong> ${ordDate}<br/><strong>Order No:</strong> ${(order.order_number ?? '').replace('#','')}<br/><strong>Email:</strong> ${custEmail}</div>
</div>
<hr/>
<table><thead><tr><th>Item</th><th class="tc">Qty</th><th class="tr">Price</th><th class="tr">Total</th></tr></thead>
<tbody>${items.map(i=>`<tr><td><strong>${i.product_name}</strong></td><td class="tc">${i.fulfilled_qty}</td><td class="tr">₹${i.price.toFixed(2)}</td><td class="tr">₹${(i.price*i.fulfilled_qty).toFixed(2)}</td></tr>`).join('')}</tbody>
<tfoot><tr class="total-row"><td colspan="3" class="tr">Total:</td><td class="tr">₹${total.toFixed(2)}</td></tr></tfoot></table>
<p style="font-size:11px;margin:6px 0;"><strong>Mode of Payment:</strong> ${payMode}</p>
${invoice.notes ? `<p style="font-size:11px;margin:4px 0;"><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
</body></html>`

  const win = window.open('', '_blank', 'width=900,height=1000')
  if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 600) }
}

// ── Invoice Card ──────────────────────────────────────────────
function InvoiceCard({ invoice, order }: { invoice: Invoice; order: Order }) {
  const qc = useQueryClient()
  const [showTracking,  setShowTracking]  = useState(false)
  const [showDelivered, setShowDelivered] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [pdfLoading,    setPdfLoading]    = useState(false)

  const cancelFulfillment = async () => {
    setCancelLoading(true)
    await updateDoc(doc(db, 'invoices', invoice.id), { status: 'cancelled', updated_at: Timestamp.now() })
    await updateDoc(doc(db, 'orders', order.id), { status: 'processing', fulfillment_status: null, updated_at: Timestamp.now() })
    await logHistory(order.id, 'Fulfillment Cancelled', order.status, 'processing', `Invoice ${invoice.invoice_number} cancelled`)
    qc.invalidateQueries({ queryKey: ['invoices', order.id] })
    qc.invalidateQueries({ queryKey: ['orders', order.id] })
    setCancelLoading(false); setCancelConfirm(false)
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{invoice.invoice_number}</p>
          <p className="text-xs text-gray-400">{formatDate(invoice.invoice_date || invoice.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={async () => { setPdfLoading(true); try { downloadInvoicePdf(invoice, order) } finally { setPdfLoading(false) } }}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60">
            {pdfLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
            {pdfLoading ? 'Generating…' : 'Download Invoice'}
          </button>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            invoice.status === 'delivered' ? 'bg-green-100 text-green-700' :
            invoice.status === 'shipped'   ? 'bg-blue-100 text-blue-700' :
            invoice.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          }`}>{FULFILLMENT_LABEL[invoice.status] ?? invoice.status}</span>
        </div>
      </div>
      <div className="space-y-1">
        {(invoice.invoice_items ?? []).map(ii => (
          <div key={ii.id ?? ii.product_id} className="flex justify-between text-xs text-gray-600">
            <span>{ii.product_name}</span><span>Qty: {ii.fulfilled_qty} / {ii.ordered_qty}</span>
          </div>
        ))}
      </div>
      {invoice.courier && (
        <div className="text-xs text-gray-500 space-y-0.5 bg-gray-50 rounded-lg p-2">
          <p><span className="text-gray-400">Courier:</span> {invoice.courier}</p>
          {invoice.tracking_number && <p><span className="text-gray-400">Tracking:</span> <span className="font-mono">{invoice.tracking_number}</span></p>}
          {invoice.sent_at && <p><span className="text-gray-400">Sent:</span> {formatDate(invoice.sent_at)}</p>}
        </div>
      )}
      {invoice.status !== 'cancelled' && invoice.status !== 'delivered' && (
        <div className="flex flex-wrap gap-2">
          {invoice.status === 'pending_shipment' && (
            <button onClick={() => setShowTracking(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Truck size={12} /> Add Tracking Info
            </button>
          )}
          {invoice.status === 'shipped' && (
            <button onClick={() => setShowDelivered(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700">
              <CheckCircle2 size={12} /> Mark as Delivered
            </button>
          )}
          <button onClick={() => setCancelConfirm(true)}
            className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 border border-red-200 rounded-lg hover:bg-red-50">
            Cancel Fulfillment
          </button>
        </div>
      )}
      {showTracking  && <TrackingModal  invoice={invoice} onClose={() => setShowTracking(false)}  onSuccess={() => setShowTracking(false)}  />}
      {showDelivered && <MarkDeliveredModal invoice={invoice} order={order} onClose={() => setShowDelivered(false)} onSuccess={() => setShowDelivered(false)} />}
      {cancelConfirm && (
        <ConfirmModal title="Cancel Fulfillment" message="Are you sure you want to cancel this fulfillment?"
          onClose={() => setCancelConfirm(false)} onConfirm={cancelFulfillment} loading={cancelLoading} />
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: order, isLoading, error } = useOrderData(id!)
  const { data: invoices = [] } = useInvoices(id!)
  const { data: history  = [] } = useOrderHistory(id!)

  const [modal,       setModal]       = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy,        setBusy]        = useState(false)

  const doUpdate = async (updates: Record<string, unknown>, action: string, newStatus?: string) => {
    if (!order) return
    setBusy(true); setActionError(null)
    try {
      await updateDoc(doc(db, 'orders', order.id), { ...updates, updated_at: Timestamp.now() })
      await logHistory(order.id, action, order.status, newStatus ?? null)
      const freshSnap = await getDoc(doc(db, 'orders', order.id))
      if (newStatus && freshSnap.exists()) {
        const freshOrder = toOrder(freshSnap.id, freshSnap.data() as Record<string, unknown>)
        if (freshOrder.customer_email || freshOrder.guest_email) {
          sendStatusEmail(freshOrder, newStatus)
            .catch(e => console.warn('[Email] Status email failed:', e instanceof Error ? e.message : e))
        }
      }
      qc.invalidateQueries({ queryKey: ['orders', order.id] })
      qc.invalidateQueries({ queryKey: ['orders'] })
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false); setModal(null)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-96">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>
  )
  if (error || !order) return (
    <div className="p-8">
      <p className="text-red-600">Order not found.</p>
      <Link to="/orders" className="text-sm text-red-600 underline">← Back</Link>
    </div>
  )

  const addr = order.shipping_address
  const paid = isOrderPaid(order)

  const fulfilledQtyMap: Record<string, number> = {}
  invoices.forEach(inv => {
    (inv.invoice_items ?? []).forEach(ii => {
      fulfilledQtyMap[ii.product_id] = (fulfilledQtyMap[ii.product_id] ?? 0) + ii.fulfilled_qty
    })
  })
  const hasRemainingItems = (order.items ?? []).some(
    item => (fulfilledQtyMap[item.product_id] ?? 0) < item.quantity
  )

  const canGenerateInvoice = hasRemainingItems &&
    ['processing', 'partially_fulfilled', 'partially_delivered', 'shipped', 'fulfilled'].includes(order.status)
  const canMarkProcessing = order.status === 'confirmed'
  const canCancel = !['cancelled', 'delivered', 'completed'].includes(order.status)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <p className="text-xs text-gray-400 max-w-6xl mx-auto">
          <Link to="/orders" className="hover:text-gray-600">Orders</Link> / View Order
        </p>
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronLeft size={18} />
            </button>
            <h1 className="text-xl font-bold text-gray-900">View Order ({order.order_number})</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"><ChevronLeft size={16} /></button>
            <button onClick={() => navigate(1)}  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"><ChevronRight size={16} /></button>
            <button onClick={() => navigate('/orders')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Go Back</button>
          </div>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5 max-w-6xl mx-auto">
        {/* Meta bar */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-sm text-gray-600 mb-3">Ordered on <strong>{formatDate(order.created_at)}</strong></p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600">
            <span className="flex items-center gap-2 pr-6 border-r border-gray-200">
              <span className="text-gray-500">Order Status:</span>
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[order.status] ?? 'bg-gray-400'}`} />
              <span className="font-medium">{STATUS_LABEL[order.status] ?? order.status}</span>
            </span>
            <span className="flex items-center gap-2 px-6 border-r border-gray-200">
              <span className="text-gray-500">Payment:</span>
              <strong className="uppercase">{order.payment_method}</strong>
            </span>
            <span className="flex items-center gap-2 pl-6">
              <span className="text-gray-500">Payment Status:</span>
              {paid
                ? <span className="flex items-center gap-1 text-green-700 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Paid</span>
                : <span className="flex items-center gap-1 text-gray-500 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Pending</span>
              }
            </span>
          </div>
        </div>

        {/* 3-column cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 text-sm mb-4">Customer Details</h2>
            <div className="space-y-2.5 text-sm text-gray-700">
              <div className="flex items-center gap-2"><User   size={14} className="text-gray-400" /><span>{customerName(order)}</span></div>
              <div className="flex items-center gap-2"><Mail   size={14} className="text-gray-400" /><span className="break-all">{customerEmail(order)}</span></div>
              <div className="flex items-center gap-2"><Phone  size={14} className="text-gray-400" /><span>{customerPhone(order)}</span></div>
            </div>
          </div>
          {(['Billing Address', 'Shipping Address'] as const).map(title => (
            <div key={title} className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">{title}</h2>
              {addr ? (
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex items-center gap-2"><User   size={14} className="text-gray-400" /><span>{addr.name}</span></div>
                  <div className="flex items-start gap-2"><MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <address className="not-italic leading-relaxed">{addr.address}<br />{addr.city}{addr.state ? `, ${addr.state}` : ''} — {addr.pincode}</address>
                  </div>
                  <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /><span>{addr.phone}</span></div>
                </div>
              ) : <p className="text-sm text-gray-400">No address on record</p>}
            </div>
          ))}
        </div>

        {/* Products table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
              {(order.items ?? []).map((item, idx) => (
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

        {/* Notes + Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3 text-sm">Notes</h2>
            <p className="text-sm text-gray-500">{order.note || '—'}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm">Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping {order.shipping_charge === 0 && <span className="text-xs text-green-600 ml-1">[Free]</span>}</span>
                <span>{order.shipping_charge > 0 ? formatCurrency(order.shipping_charge) : '₹0.00'}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900">
                <span>Total</span><span>{formatCurrency(order.total)}</span>
              </div>
            </div>
            <div className="mt-4 bg-gray-900 text-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium">Amount Payable</span>
              <span className="font-bold text-base">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Invoices */}
        {invoices.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2"><FileText size={16} /> Invoices</h2>
            <div className="space-y-3">
              {invoices.map(inv => <InvoiceCard key={inv.id} invoice={inv} order={order} />)}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!['cancelled', 'completed'].includes(order.status) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2">
                <AlertTriangle size={13} />{actionError}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {canCancel && (
                <button onClick={() => setModal('cancel')}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Cancel Order
                </button>
              )}
              {canMarkProcessing && (
                <button onClick={() => setModal('processing')}
                  className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium">
                  Mark as Processing
                </button>
              )}
              {canGenerateInvoice && (
                <button onClick={() => setModal('invoice')}
                  className="flex items-center gap-2 px-5 py-2.5 border border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white rounded-lg text-sm font-medium transition-colors">
                  <FileText size={14} /> Generate Invoice
                </button>
              )}
              {!paid && order.payment_method === 'cod' && (
                <button onClick={() => setModal('markpaid')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                  <IndianRupee size={14} /> Mark as Paid
                </button>
              )}
            </div>
          </div>
        )}

        {/* Audit trail */}
        {history.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><History size={15} /> Audit Trail</h2>
            <div className="space-y-2">
              {(history as Array<{ id: string; action: string; new_status: string | null; remarks: string | null; created_at: unknown }>).map(h => (
                <div key={h.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Clock size={11} className="text-gray-400" />
                    <span className="font-medium text-gray-800">{h.action}</span>
                    {h.new_status && <span className="text-gray-400">→ {STATUS_LABEL[h.new_status] ?? h.new_status}</span>}
                    {h.remarks    && <span className="text-gray-400">({h.remarks})</span>}
                  </div>
                  <span className="text-gray-400 whitespace-nowrap ml-4">{formatDate(tsToStr(h.created_at))}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'cancel' && (
        <ConfirmModal title="Cancel Order" message="Are you sure you want to cancel this order?"
          onClose={() => setModal(null)} loading={busy}
          onConfirm={() => doUpdate({ status: 'cancelled', cancelled_at: Timestamp.now() }, 'Order Cancelled', 'cancelled')} />
      )}
      {modal === 'markpaid' && (
        <ConfirmModal title="Mark as Paid" message="Confirm payment has been received?"
          onClose={() => setModal(null)} loading={busy}
          onConfirm={() => doUpdate({ payment_status: 'paid', paid_at: Timestamp.now() }, 'Payment Received', order.status)} />
      )}
      {modal === 'processing' && (
        <ConfirmModal title="Mark as Processing" message="Mark this order as processing?"
          onClose={() => setModal(null)} loading={busy}
          onConfirm={() => doUpdate({ status: 'processing' }, 'Marked Processing', 'processing')} />
      )}
      {modal === 'invoice' && (
        <GenerateInvoiceModal order={order} invoices={invoices}
          onClose={() => setModal(null)} onSuccess={() => setModal(null)} />
      )}
    </div>
  )
}
