import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, User, MapPin, Phone, Mail, Package, AlertTriangle, Loader2, IndianRupee } from 'lucide-react'
import { useOrder, useUpdateOrderStatus, useMarkPaid, isOrderPaid } from '@/hooks/useOrders'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

/* ── helpers ─────────────────────────────────────────────────────── */
function customerName(order: Order) {
  return order.guest_name?.trim() || order.shipping_address?.name?.trim() || '—'
}
function customerPhone(order: Order) {
  return order.guest_phone?.trim() || order.shipping_address?.phone?.trim() || '—'
}
function customerEmail(order: Order) {
  return order.guest_email?.trim() || '—'
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  confirmed: 'Order Placed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const STATUS_DOT: Record<OrderStatus, string> = {
  confirmed:        'bg-gray-400',
  shipped:          'bg-gray-600',
  out_for_delivery: 'bg-gray-800',
  delivered:        'bg-black',
  cancelled:        'bg-gray-300',
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: 'shipped',
  shipped: 'out_for_delivery',
  out_for_delivery: 'delivered',
}

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Mark as Shipped',
  shipped: 'Mark Out for Delivery',
  out_for_delivery: 'Mark as Delivered',
}

/* ── component ───────────────────────────────────────────────────── */
export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: order, isLoading, error } = useOrder(id!)
  const updateStatus = useUpdateOrderStatus()
  const markPaid = useMarkPaid()

  const [trackingNumber, setTrackingNumber] = useState('')
  const [courierName, setCourierName] = useState('')
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [paidError, setPaidError] = useState<string | null>(null)
  const [showShippingFields, setShowShippingFields] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="animate-spin text-red-600" size={28} />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="p-8">
        <p className="text-red-600 mb-2">Order not found.</p>
        <Link to="/orders" className="text-sm text-red-600 underline">← Back to orders</Link>
      </div>
    )
  }

  const nextStatus = NEXT_STATUS[order.status]
  const canCancel = order.status !== 'delivered' && order.status !== 'cancelled'

  const handleAdvance = async () => {
    if (!nextStatus) return
    if (nextStatus === 'shipped' && !showShippingFields) {
      setShowShippingFields(true)
      return
    }
    setActionError(null)
    try {
      await updateStatus.mutateAsync({
        orderId: order.id,
        status: nextStatus,
        ...(nextStatus === 'shipped' ? { tracking_number: trackingNumber, courier_name: courierName } : {}),
      })
      setShowShippingFields(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Update failed')
    }
  }

  const handleCancel = async () => {
    setActionError(null)
    try {
      await updateStatus.mutateAsync({ orderId: order.id, status: 'cancelled' })
      setCancelConfirm(false)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Cancel failed')
    }
  }

  const addr = order.shipping_address

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <p className="text-xs text-gray-400">
          <Link to="/orders" className="hover:text-gray-600">Orders</Link>
          {' / '}
          <span className="text-gray-600">View Order</span>
        </p>
      </div>

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">
          View Order ({order.order_number})
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Previous"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => navigate(1)}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            title="Next"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => navigate('/orders')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5 max-w-6xl">

        {/* ── Order meta bar ── */}
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
          <p className="text-sm text-gray-600 mb-3">
            Ordered on{' '}
            <strong>{formatDate(order.created_at)}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-600 divide-x divide-gray-200">
            <span className="flex items-center gap-2 pr-6">
              <span className="text-gray-500">Order Status:</span>
              <span className={`inline-block w-2 h-2 rounded-full ${STATUS_DOT[order.status]}`} />
              <span className="font-medium">{STATUS_LABEL[order.status]}</span>
            </span>
            <span className="flex items-center gap-2 px-6">
              <span className="text-gray-500">Payment Mode:</span>
              <strong>{order.payment_method === 'cod' ? 'COD' : 'Online Payment'}</strong>
            </span>
            <span className="flex items-center gap-2 px-6">
              <span className="text-gray-500">Payment Status:</span>
              {isOrderPaid(order) ? (
                <span className="inline-flex items-center gap-1 text-gray-800 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-black" /> Paid
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-gray-500 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300" /> Unpaid
                </span>
              )}
            </span>
            {(order.tracking_number || order.courier_name) && (
              <span className="flex items-center gap-2 pl-6">
                <span className="text-gray-500">Courier:</span>
                <strong>{order.courier_name ?? '—'}</strong>
                {order.tracking_number && (
                  <span className="font-mono text-xs text-gray-700">#{order.tracking_number}</span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* ── 3-column info cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Customer Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm">Customer Details</h2>
            <div className="space-y-2.5 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <User size={14} className="text-gray-400 shrink-0" />
                <span>{customerName(order)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-gray-400 shrink-0" />
                <span className="break-all">{customerEmail(order)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-gray-400 shrink-0" />
                <span>{customerPhone(order)}</span>
              </div>
            </div>
          </div>

          {/* Billing Address — same as shipping for Festecart */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm">Billing Address</h2>
            {addr ? (
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400 shrink-0" />
                  <span>{addr.name}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <address className="not-italic leading-relaxed">
                    {addr.address}<br />
                    {addr.city}{addr.state ? `, ${addr.state}` : ''} — {addr.pincode}
                  </address>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-gray-400 shrink-0" />
                  <span>{addr.phone}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No address on record</p>
            )}
          </div>

          {/* Shipping Address */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm">Shipping Address</h2>
            {addr ? (
              <div className="space-y-2 text-sm text-gray-700">
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400 shrink-0" />
                  <span>{addr.name}</span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <address className="not-italic leading-relaxed">
                    {addr.address}<br />
                    {addr.city}{addr.state ? `, ${addr.state}` : ''} — {addr.pincode}
                  </address>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-gray-400 shrink-0" />
                  <span>{addr.phone}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No address on record</p>
            )}
          </div>
        </div>

        {/* ── Products table ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
              {(order.items ?? []).map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-5 py-4 w-16">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Package size={16} className="text-gray-400" />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-4">
                    <p className="font-medium text-gray-900">{item.name}</p>
                  </td>
                  <td className="px-5 py-4 text-right text-gray-700">{formatCurrency(item.price)}</td>
                  <td className="px-5 py-4 text-center text-gray-700">{item.quantity}</td>
                  <td className="px-5 py-4 text-right font-semibold">{formatCurrency(item.price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Notes + Summary row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3 text-sm">Notes</h2>
            <p className="text-sm text-gray-500">{order.note || '—'}</p>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 text-sm">Summary</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Order Total</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Shipping Charges {order.shipping_charge === 0 && <span className="text-xs text-green-600 ml-1">[Free Shipping]</span>}</span>
                <span>{order.shipping_charge > 0 ? formatCurrency(order.shipping_charge) : '₹0.00'}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold text-gray-900">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
            {/* Amount Payable */}
            <div className="mt-4 bg-gray-900 text-white rounded-lg px-4 py-3 flex justify-between items-center">
              <span className="text-sm font-medium">Amount Payable</span>
              <span className="font-bold text-base">{formatCurrency(order.total)}</span>
            </div>
          </div>
        </div>

        {/* ── Action buttons ── */}
        {(order.status !== 'delivered' && order.status !== 'cancelled') && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">

            {/* Shipping fields — shown when advancing confirmed → shipped */}
            {showShippingFields && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Courier Name</label>
                  <input
                    type="text"
                    value={courierName}
                    onChange={e => setCourierName(e.target.value)}
                    placeholder="e.g. Delhivery, Dunzo"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tracking Number (AWB)</label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={e => setTrackingNumber(e.target.value)}
                    placeholder="Enter AWB / tracking number"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                  />
                </div>
              </div>
            )}

            {actionError && (
              <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg flex items-center gap-2">
                <AlertTriangle size={13} /> {actionError}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {/* Cancel */}
              {canCancel && !cancelConfirm && (
                <button
                  onClick={() => setCancelConfirm(true)}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel Order
                </button>
              )}

              {cancelConfirm && (
                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle size={14} className="text-red-600" />
                  <span className="text-sm text-red-700 mr-2">Confirm cancel?</span>
                  <button
                    onClick={handleCancel}
                    disabled={updateStatus.isPending}
                    className="px-3 py-1 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700"
                  >
                    {updateStatus.isPending ? 'Cancelling…' : 'Yes, Cancel'}
                  </button>
                  <button
                    onClick={() => setCancelConfirm(false)}
                    className="px-3 py-1 border border-gray-300 text-gray-600 text-xs font-medium rounded-md"
                  >
                    Keep
                  </button>
                </div>
              )}

              {/* Mark as Paid — only for COD orders not yet paid */}
              {order.payment_method === 'cod' && !isOrderPaid(order) && (
                <div className="flex flex-col gap-1">
                  <button
                    onClick={async () => {
                      setPaidError(null)
                      try {
                        await markPaid.mutateAsync(order.id)
                      } catch (e) {
                        setPaidError(e instanceof Error ? e.message : 'Failed to mark as paid')
                      }
                    }}
                    disabled={markPaid.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {markPaid.isPending
                      ? <Loader2 size={14} className="animate-spin" />
                      : <IndianRupee size={14} />
                    }
                    Mark as Paid
                  </button>
                  {paidError && (
                    <p className="text-xs text-red-600">{paidError}</p>
                  )}
                </div>
              )}

              {/* Advance status */}
              {nextStatus && (
                <button
                  onClick={handleAdvance}
                  disabled={updateStatus.isPending}
                  className="px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:bg-gray-400 transition-colors flex items-center gap-2"
                >
                  {updateStatus.isPending && <Loader2 size={14} className="animate-spin" />}
                  {showShippingFields ? `Confirm — ${NEXT_LABEL[order.status]}` : NEXT_LABEL[order.status]}
                </button>
              )}

              {showShippingFields && (
                <button
                  onClick={() => setShowShippingFields(false)}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Delivered / Cancelled final state */}
        {(order.status === 'delivered' || order.status === 'cancelled') && (
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm font-medium flex items-center gap-2 text-gray-700">
            <span className={`w-2 h-2 rounded-full ${order.status === 'delivered' ? 'bg-black' : 'bg-gray-400'}`} />
            {order.status === 'delivered'
              ? `Delivered on ${formatDate(order.delivered_at)}`
              : `Order was cancelled on ${formatDate(order.cancelled_at)}`
            }
          </div>
        )}
      </div>
    </div>
  )
}
