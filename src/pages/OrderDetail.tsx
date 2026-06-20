import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Order, Invoice, OrderItem } from '@/types'
import {
  ChevronLeft, ChevronRight, User, MapPin, Phone, Mail,
  Package, AlertTriangle, Loader2, IndianRupee, FileText,
  Truck, CheckCircle2, X, Clock, History
} from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ── helpers ───────────────────────────────────────────────────
function customerName(o: Order) { return o.guest_name?.trim() || o.shipping_address?.name?.trim() || '—' }
function customerPhone(o: Order) { return o.guest_phone?.trim() || o.shipping_address?.phone?.trim() || '—' }
function customerEmail(o: Order) { return o.customer_email?.trim() || o.guest_email?.trim() || '—' }
function isOrderPaid(o: Order) { return o.payment_method !== 'cod' || o.payment_status === 'paid' }

const STATUS_DOT: Record<string, string> = {
  confirmed: 'bg-gray-400', processing: 'bg-blue-500',
  partially_fulfilled: 'bg-orange-400', fulfilled: 'bg-green-400',
  shipped: 'bg-blue-600', out_for_delivery: 'bg-orange-500',
  delivered: 'bg-green-600', cancelled: 'bg-gray-300', completed: 'bg-black',
}
const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed', processing: 'Processing',
  partially_fulfilled: 'Partially Fulfilled', fulfilled: 'Fulfilled',
  shipped: 'Shipped', out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered', cancelled: 'Cancelled', completed: 'Completed',
}
const FULFILLMENT_LABEL: Record<string, string> = {
  pending_shipment: 'Pending Shipment', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled',
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

// ── Confirm dialog ────────────────────────────────────────────
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

// ── Hooks ────────────────────────────────────────────────────
function useOrder(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('*').eq('id', id).single()
      if (error) throw error
      return data as Order
    },
    enabled: !!id,
  })
}

function useInvoices(orderId: string) {
  return useQuery({
    queryKey: ['invoices', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices').select('*, invoice_items(*)').eq('order_id', orderId).order('created_at')
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
    enabled: !!orderId,
  })
}

function useOrderHistory(orderId: string) {
  return useQuery({
    queryKey: ['order-history', orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from('order_status_history').select('*').eq('order_id', orderId).order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!orderId,
  })
}

async function logHistory(orderId: string, action: string, oldStatus: string | null, newStatus: string | null, remarks?: string) {
  await supabase.from('order_status_history').insert({ order_id: orderId, action, old_status: oldStatus, new_status: newStatus, remarks: remarks ?? null })
}

async function sendStatusEmail(order: Order, newStatus: string, invoice?: Invoice) {
  try {
    console.log('[sendStatusEmail] Invoking for:', order.order_number, '→', newStatus, 'email:', (order as unknown as Record<string,unknown>).customer_email || order.guest_email)
    const result = await supabase.functions.invoke('send-order-email', {
      body: { order, new_status: newStatus, invoice: invoice ?? null },
    })
    console.log('[sendStatusEmail] Result:', JSON.stringify(result.data))
  } catch (e) {
    console.error('[Email] Failed to send status email:', e)
  }
}

// ── Generate Invoice Modal ────────────────────────────────────
function GenerateInvoiceModal({ order, invoices, onClose, onSuccess }: {
  order: Order; invoices: Invoice[]; onClose: () => void; onSuccess: () => void
}) {
  const qc = useQueryClient()
  const items = order.items ?? []

  const fulfilledQty = (productId: string) =>
    invoices.flatMap(inv => inv.invoice_items ?? [])
      .filter(ii => ii.product_id === productId && ii.invoice_id !== undefined)
      .reduce((s, ii) => s + ii.fulfilled_qty, 0)

  const remainingQty = (item: OrderItem) => item.quantity - fulfilledQty(item.product_id)

  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [fulfillQty, setFulfillQty] = useState<Record<string, number>>(
    Object.fromEntries(items.map(i => [i.product_id, Math.max(1, remainingQty(i))]))
  )
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const toggleAll = (checked: boolean) =>
    setSelected(Object.fromEntries(items.filter(i => remainingQty(i) > 0).map(i => [i.product_id, checked])))

  const selectedItems = items.filter(i => selected[i.product_id] && remainingQty(i) > 0)

  const handleSubmit = async () => {
    if (selectedItems.length === 0) { setError('Select at least one product'); return }
    setLoading(true); setError(null)
    try {
      const { data: inv, error: invErr } = await supabase.from('invoices')
        .insert({ order_id: order.id, notes: notes || null, status: 'pending_shipment' })
        .select('id, invoice_number').single()
      if (invErr) throw new Error(invErr.message)

      await supabase.from('invoice_items').insert(
        selectedItems.map(i => ({
          invoice_id: inv.id, product_id: i.product_id,
          product_name: i.name, ordered_qty: i.quantity,
          fulfilled_qty: fulfillQty[i.product_id] ?? 1, price: i.price,
        }))
      )

      const totalFulfilled = items.every(i => {
        const nowFulfilled = fulfilledQty(i.product_id) + (fulfillQty[i.product_id] ?? 0)
        return nowFulfilled >= i.quantity
      })
      const newStatus = totalFulfilled ? 'fulfilled' : 'partially_fulfilled'
      await supabase.from('orders').update({ status: newStatus, fulfillment_status: 'pending_shipment' }).eq('id', order.id)
      await logHistory(order.id, 'Invoice Generated', order.status, newStatus, `Invoice ${inv.invoice_number}`)
      // Send email for fulfillment status change
      const { data: updatedOrder } = await supabase.from('orders').select('*').eq('id', order.id).single()
      if (updatedOrder) await sendStatusEmail(updatedOrder as Order, newStatus)

      qc.invalidateQueries({ queryKey: ['orders', order.id] })
      qc.invalidateQueries({ queryKey: ['invoices', order.id] })
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
            placeholder="Add notes in invoice…"
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
  const [form, setForm] = useState({
    courier: invoice.courier ?? '',
    tracking_number: invoice.tracking_number ?? '',
    sent_at: invoice.sent_at ? invoice.sent_at.slice(0, 16) : '',
    estimated_delivery: invoice.estimated_delivery ? invoice.estimated_delivery.slice(0, 16) : '',
    is_prepaid: invoice.is_prepaid ?? false,
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    if (!form.courier) { setError('Courier is required'); return }
    if (!form.tracking_number) { setError('Tracking number is required'); return }
    if (!form.sent_at) { setError('Sent date is required'); return }
    if (!form.estimated_delivery) { setError('Estimated delivery date is required'); return }
    setLoading(true); setError(null)
    try {
      const { error: trackErr } = await supabase.from('invoices').update({
        courier: form.courier, tracking_number: form.tracking_number,
        sent_at: new Date(form.sent_at).toISOString(),
        estimated_delivery: new Date(form.estimated_delivery).toISOString(),
        is_prepaid: form.is_prepaid, status: 'shipped',
      }).eq('id', invoice.id)
      if (trackErr) throw new Error(trackErr.message)
      await supabase.from('orders').update({ status: 'shipped', fulfillment_status: 'shipped' }).eq('id', invoice.order_id)
      // Fetch updated order for email
      const { data: updatedOrder } = await supabase.from('orders').select('*').eq('id', invoice.order_id).single()
      if (updatedOrder) {
        await sendStatusEmail(updatedOrder as Order, 'shipped', {
          ...invoice,
          courier: form.courier,
          tracking_number: form.tracking_number,
          sent_at: new Date(form.sent_at).toISOString(),
          estimated_delivery: new Date(form.estimated_delivery).toISOString(),
        })
      }
      qc.invalidateQueries({ queryKey: ['invoices', invoice.order_id] })
      qc.invalidateQueries({ queryKey: ['orders', invoice.order_id] })
      onSuccess()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setLoading(false) }
  }

  const f = (field: string, val: string | boolean) => setForm(p => ({ ...p, [field]: val }))

  return (
    <Modal title="Add Tracking Information" onClose={onClose}>
      <div className="space-y-4">
        {[
          { label: 'Courier *', field: 'courier', placeholder: 'e.g. Delhivery, Self-delivery' },
          { label: 'Tracking Number *', field: 'tracking_number', placeholder: 'AWB / Tracking No' },
        ].map(({ label, field, placeholder }) => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
            <input type="text" value={(form as Record<string, string | boolean>)[field] as string}
              onChange={e => f(field, e.target.value)} placeholder={placeholder}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Sent Date & Time *</label>
            <input type="datetime-local" value={form.sent_at} onChange={e => f('sent_at', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Estimated Delivery *</label>
            <input type="datetime-local" value={form.estimated_delivery} onChange={e => f('estimated_delivery', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
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
    await supabase.from('invoices').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', invoice.id)
    await supabase.from('orders').update({ fulfillment_status: 'delivered', status: 'delivered' }).eq('id', invoice.order_id)
    await logHistory(invoice.order_id, 'Marked Delivered', null, 'delivered', `Invoice ${invoice.invoice_number}`)
    // Send delivered email with invoice info
    const { data: updatedOrder } = await supabase.from('orders').select('*').eq('id', invoice.order_id).single()
    if (updatedOrder) {
      await sendStatusEmail(updatedOrder as Order, 'delivered', invoice)
    }
    qc.invalidateQueries({ queryKey: ['invoices', invoice.order_id] })
    qc.invalidateQueries({ queryKey: ['orders', invoice.order_id] })
    setLoading(false)
    onSuccess()
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
        {invoice.courier && <p><span className="text-gray-400">Courier:</span> <strong>{invoice.courier}</strong></p>}
        {invoice.sent_at && <p><span className="text-gray-400">Sent Date:</span> {formatDate(invoice.sent_at)}</p>}
        {invoice.estimated_delivery && <p><span className="text-gray-400">Estimated Date:</span> {formatDate(invoice.estimated_delivery)}</p>}
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

// ── Generate Invoice PDF ──────────────────────────────────────
async function downloadInvoicePdf(invoice: Invoice, order: Order) {
  const items = invoice.invoice_items ?? []
  const total = items.reduce((s, i) => s + i.price * i.fulfilled_qty, 0)
  const addr = order.shipping_address

  const toWords = (n: number): string => {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
    if (n === 0) return 'Zero'
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + toWords(n % 100) : '')
    if (n < 100000) return toWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + toWords(n % 1000) : '')
    return toWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + toWords(n % 100000) : '')
  }

  const amountInWords = toWords(Math.round(total)) + ' Rupees Only'
  const invoiceDate = new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const orderDate = new Date(order.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const custName = order.guest_name || addr?.name || '—'
  const custEmail = order.customer_email || order.guest_email || '—'
  const payMode = order.payment_method === 'cod' ? 'Cash on Delivery' : order.payment_method.toUpperCase()

  // Build a hidden div, render it, capture to canvas, save as PDF
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;'
  container.innerHTML = `
  <div style="font-family:Arial,sans-serif;font-size:13px;color:#222;padding:40px;width:714px;">
    <h1 style="text-align:center;font-size:18px;font-weight:bold;margin:0 0 24px;letter-spacing:2px;">INVOICE</h1>
    <div style="display:flex;justify-content:space-between;margin-bottom:20px;align-items:flex-start;">
      <div style="font-size:28px;font-weight:900;color:#b91c1c;line-height:1;">fest<span style="color:#1d6b2e;">ecart</span></div>
      <div style="text-align:right;font-size:12px;line-height:1.8;">
        <strong>Invoice Date:</strong> ${invoiceDate}<br/>
        <strong>Invoice No:</strong> ${invoice.invoice_number.replace('INV-', '')}<br/>
        <strong>GSTIN:</strong> 29AFFFS9227M1Z7
      </div>
    </div>
    <div style="font-size:12px;line-height:1.6;margin-bottom:16px;">
      <strong>festecart,</strong><br/>
      No 861, 2nd floor, 5th Main, Near Hopcoms, BEML Layout, 3rd Stage,<br/>
      Rajarajeshwari Nagar, Bengaluru South, RR Nagar, BBMP West,<br/>
      Bengaluru, Karnataka, India - 560098
    </div>
    <hr style="border:none;border-top:1px solid #ddd;margin:12px 0;"/>
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
      <div style="font-size:12px;flex:1;margin-right:16px;">
        <strong>Shipping Address</strong><br/>
        ${addr ? `${addr.name}<br/>${addr.address}<br/>${addr.city}, ${addr.state}, India - ${addr.pincode}<br/>Phone: ${addr.phone}` : custName}
      </div>
      <div style="font-size:12px;flex:1;margin-right:16px;">
        <strong>Billing Address</strong><br/>
        ${addr ? `${addr.name}<br/>${addr.address}<br/>${addr.city}, ${addr.state}, India - ${addr.pincode}<br/>Phone: ${addr.phone}` : custName}
      </div>
      <div style="text-align:right;font-size:12px;line-height:1.8;">
        <strong>Order Date:</strong> ${orderDate}<br/>
        <strong>Order No.</strong> ${order.order_number?.replace('#', '')}<br/>
        <strong>Email:</strong> ${custEmail}
      </div>
    </div>
    <hr style="border:none;border-top:1px solid #ddd;margin:12px 0;"/>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="text-align:left;padding:8px 10px;font-size:12px;border:1px solid #ddd;">Item</th>
          <th style="text-align:center;padding:8px 10px;font-size:12px;border:1px solid #ddd;">Qty</th>
          <th style="text-align:right;padding:8px 10px;font-size:12px;border:1px solid #ddd;">Price</th>
          <th style="text-align:right;padding:8px 10px;font-size:12px;border:1px solid #ddd;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(i => `
          <tr>
            <td style="padding:8px 10px;font-size:12px;border:1px solid #ddd;"><strong>${i.product_name}</strong></td>
            <td style="text-align:center;padding:8px 10px;font-size:12px;border:1px solid #ddd;">${i.fulfilled_qty}</td>
            <td style="text-align:right;padding:8px 10px;font-size:12px;border:1px solid #ddd;">₹${i.price.toFixed(2)}</td>
            <td style="text-align:right;padding:8px 10px;font-size:12px;border:1px solid #ddd;">₹${(i.price * i.fulfilled_qty).toFixed(2)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f5f5f5;">
          <td colspan="3" style="text-align:right;padding:8px 10px;font-weight:bold;border:1px solid #ddd;">Total:</td>
          <td style="text-align:right;padding:8px 10px;font-weight:bold;font-size:14px;border:1px solid #ddd;">₹${total.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="font-size:12px;color:#444;margin:8px 0;"><strong>In words:</strong> ${amountInWords}</p>
    <p style="font-size:12px;margin:8px 0;"><strong>Mode of Payment:</strong> ${payMode}</p>
    ${invoice.notes ? `<p style="font-size:12px;margin:8px 0;"><strong>Notes:</strong> ${invoice.notes}</p>` : ''}
  </div>`

  document.body.appendChild(container)
  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' })
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height)
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width * ratio, canvas.height * ratio)
    pdf.save(`${invoice.invoice_number}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}
function InvoiceCard({ invoice, order }: { invoice: Invoice; order: Order }) {
  const qc = useQueryClient()
  const [showTracking, setShowTracking] = useState(false)
  const [showDelivered, setShowDelivered] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const cancelFulfillment = async () => {
    setCancelLoading(true)
    await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', invoice.id)
    await supabase.from('orders').update({ status: 'processing', fulfillment_status: null }).eq('id', order.id)
    await logHistory(order.id, 'Fulfillment Cancelled', order.status, 'processing', `Invoice ${invoice.invoice_number} cancelled`)
    qc.invalidateQueries({ queryKey: ['invoices', order.id] })
    qc.invalidateQueries({ queryKey: ['orders', order.id] })
    setCancelLoading(false)
    setCancelConfirm(false)
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900 text-sm">{invoice.invoice_number}</p>
          <p className="text-xs text-gray-400">{formatDate(invoice.invoice_date)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setPdfLoading(true)
              try { await downloadInvoicePdf(invoice, order) }
              finally { setPdfLoading(false) }
            }}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
            title="Download Invoice PDF"
          >
            {pdfLoading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
            {pdfLoading ? 'Generating…' : 'Download Invoice'}
          </button>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          invoice.status === 'delivered' ? 'bg-green-100 text-green-700' :
          invoice.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
          invoice.status === 'cancelled' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-600'
        }`}>{FULFILLMENT_LABEL[invoice.status] ?? invoice.status}</span>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1">
        {(invoice.invoice_items ?? []).map(ii => (
          <div key={ii.id} className="flex justify-between text-xs text-gray-600">
            <span>{ii.product_name}</span>
            <span>Qty: {ii.fulfilled_qty} / {ii.ordered_qty}</span>
          </div>
        ))}
      </div>

      {/* Tracking info */}
      {invoice.courier && (
        <div className="text-xs text-gray-500 space-y-0.5 bg-gray-50 rounded-lg p-2">
          <p><span className="text-gray-400">Courier:</span> {invoice.courier}</p>
          {invoice.tracking_number && <p><span className="text-gray-400">Tracking:</span> <span className="font-mono">{invoice.tracking_number}</span></p>}
          {invoice.sent_at && <p><span className="text-gray-400">Sent:</span> {formatDate(invoice.sent_at)}</p>}
          {invoice.estimated_delivery && <p><span className="text-gray-400">Est. Delivery:</span> {formatDate(invoice.estimated_delivery)}</p>}
        </div>
      )}

      {/* Actions */}
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

      {showTracking && <TrackingModal invoice={invoice} onClose={() => setShowTracking(false)} onSuccess={() => setShowTracking(false)} />}
      {showDelivered && <MarkDeliveredModal invoice={invoice} order={order} onClose={() => setShowDelivered(false)} onSuccess={() => setShowDelivered(false)} />}
      {cancelConfirm && (
        <ConfirmModal title="Cancel Fulfillment"
          message="Are you sure you want to cancel this fulfillment? Fulfilled quantities will be reversed."
          onClose={() => setCancelConfirm(false)}
          onConfirm={cancelFulfillment}
          loading={cancelLoading} />
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────
export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: order, isLoading, error } = useOrder(id!)
  const { data: invoices = [] } = useInvoices(id!)
  const { data: history = [] } = useOrderHistory(id!)

  const [modal, setModal] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const doUpdate = async (updates: Record<string, unknown>, action: string, newStatus?: string) => {
    if (!order) return
    setBusy(true); setActionError(null)
    const { error } = await supabase.from('orders').update(updates).eq('id', order.id)
    if (error) { setActionError(error.message); setBusy(false); return }
    await logHistory(order.id, action, order.status, newStatus ?? null)
    // Re-fetch the order fresh from DB to get customer_email before sending
    const { data: freshOrder } = await supabase.from('orders').select('*').eq('id', order.id).single()
    console.log('[Email] freshOrder:', freshOrder?.order_number, 'customer_email:', freshOrder?.customer_email, 'guest_email:', freshOrder?.guest_email)
    if (newStatus && freshOrder && (freshOrder.customer_email || freshOrder.guest_email)) {
      console.log('[Email] Sending to:', freshOrder.customer_email || freshOrder.guest_email)
      await sendStatusEmail(freshOrder as Order, newStatus)
      console.log('[Email] Sent successfully')
    } else {
      console.warn('[Email] SKIPPED — no email on order or no newStatus. newStatus:', newStatus, 'freshOrder:', !!freshOrder)
    }
    qc.invalidateQueries({ queryKey: ['orders', order.id] })
    qc.invalidateQueries({ queryKey: ['orders'] })
    setBusy(false)
    setModal(null)
  }

  if (isLoading) return <div className="flex items-center justify-center min-h-96"><Loader2 className="animate-spin text-gray-400" size={28} /></div>
  if (error || !order) return <div className="p-8"><p className="text-red-600">Order not found.</p><Link to="/orders" className="text-sm text-red-600 underline">← Back</Link></div>

  const addr = order.shipping_address
  const paid = isOrderPaid(order)
  const canGenerateInvoice = order.status === 'processing' || order.status === 'partially_fulfilled'
  const canMarkProcessing = order.status === 'confirmed'
  const canCancel = !['cancelled', 'delivered', 'completed', 'fulfilled'].includes(order.status)

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
            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronLeft size={18} /></button>
            <h1 className="text-xl font-bold text-gray-900">View Order ({order.order_number})</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"><ChevronLeft size={16} /></button>
            <button onClick={() => navigate(1)} className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"><ChevronRight size={16} /></button>
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
              <span className="text-gray-500">Acceptance:</span>
              <span className="font-medium text-green-600">{order.acceptance_status ?? 'Accepted'}</span>
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
              <div className="flex items-center gap-2"><User size={14} className="text-gray-400" /><span>{customerName(order)}</span></div>
              <div className="flex items-center gap-2"><Mail size={14} className="text-gray-400" /><span className="break-all">{customerEmail(order)}</span></div>
              <div className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /><span>{customerPhone(order)}</span></div>
            </div>
          </div>
          {['Billing Address', 'Shipping Address'].map(title => (
            <div key={title} className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-4">{title}</h2>
              {addr ? (
                <div className="space-y-2 text-sm text-gray-700">
                  <div className="flex items-center gap-2"><User size={14} className="text-gray-400" /><span>{addr.name}</span></div>
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
                    {item.image ? <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
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
              <div className="flex justify-between text-gray-600"><span>Order Total</span><span>{formatCurrency(order.subtotal)}</span></div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping {order.shipping_charge === 0 && <span className="text-xs text-green-600 ml-1">[Free]</span>}</span>
                <span>{order.shipping_charge > 0 ? formatCurrency(order.shipping_charge) : '₹0.00'}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
            </div>
            <div className="mt-4 bg-gray-900 text-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium">Amount Payable</span>
              <span className="font-bold text-base">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Invoices section */}
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
            {actionError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2"><AlertTriangle size={13} />{actionError}</p>}
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
              {!paid && order.payment_method === 'cod' && (
                <button onClick={() => setModal('markpaid')}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">
                  <IndianRupee size={14} /> Mark as Paid
                </button>
              )}
              {canGenerateInvoice && (
                <button onClick={() => setModal('invoice')}
                  className="flex items-center gap-2 px-5 py-2.5 border border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white rounded-lg text-sm font-medium transition-colors">
                  <FileText size={14} /> Generate Invoice
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status history */}
        {history.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><History size={15} /> Audit Trail</h2>
            <div className="space-y-2">
              {history.map((h: { id: string; action: string; new_status: string | null; remarks: string | null; created_at: string }) => (
                <div key={h.id} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Clock size={11} className="text-gray-400" />
                    <span className="font-medium text-gray-800">{h.action}</span>
                    {h.new_status && <span className="text-gray-400">→ {STATUS_LABEL[h.new_status] ?? h.new_status}</span>}
                    {h.remarks && <span className="text-gray-400">({h.remarks})</span>}
                  </div>
                  <span className="text-gray-400 whitespace-nowrap ml-4">{formatDate(h.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal === 'cancel' && (
        <ConfirmModal title="Cancel Order" message="Are you sure you want to cancel this order? This cannot be undone."
          onClose={() => setModal(null)} loading={busy}
          onConfirm={() => doUpdate({ status: 'cancelled', cancelled_at: new Date().toISOString() }, 'Order Cancelled', 'cancelled')} />
      )}
      {modal === 'markpaid' && (
        <ConfirmModal title="Mark as Paid" message="Are you sure payment has been received for this order?"
          onClose={() => setModal(null)} loading={busy}
          onConfirm={() => doUpdate({ payment_status: 'paid', paid_at: new Date().toISOString() }, 'Payment Received', order.status)} />
      )}
      {modal === 'processing' && (
        <ConfirmModal title="Mark as Processing"
          message="Are you sure you want to mark this order as processing?"
          onClose={() => setModal(null)} loading={busy}
          onConfirm={() => doUpdate({ status: 'processing' }, 'Marked Processing', 'processing')} />
      )}
      {modal === 'invoice' && order && (
        <GenerateInvoiceModal order={order} invoices={invoices}
          onClose={() => setModal(null)} onSuccess={() => setModal(null)} />
      )}
    </div>
  )
}
