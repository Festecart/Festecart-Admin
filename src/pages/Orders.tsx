
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Search,
  X,
  Plus,
  Download,
  FileDown,
  ChevronDown,
} from 'lucide-react'
import { useOrders, isOrderPaid } from '@/hooks/useOrders'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

const STATUS_OPTIONS: {
  value: OrderStatus | 'all'
  label: string
}[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'out_for_delivery', label: 'Out for Delivery' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
  ]

const HEADERS = [
  'Order No',
  'Order Date',
  'Customer Name',
  'Phone',
  'Items',
  'Products',
  'Product Cost',
  'Coupon Name',
  'Coupon Amount',
  'Shipment Cost',
  'Total Payable',
  'Paid to Logistics',
  'Actual Paid',
  'Earned Value',
  'Payment Method',
  'Payment Status',
  'Order Status',
]

function customerName(order: Order): string {
  return (
    order.guest_name?.trim() ||
    order.shipping_address?.name?.trim() ||
    '—'
  )
}

function customerPhone(order: Order): string {
  return (
    order.guest_phone?.trim() ||
    order.shipping_address?.phone?.trim() ||
    '—'
  )
}

function csvCell(
  value: string | number | null | undefined
): string {
  let text = value == null ? '' : String(value)

  if (
    typeof value === 'string' &&
    /^[\u0000-\u0020]*[=+\-@]/.test(text)
  ) {
    text = `'${text}`
  }

  return `"${text.replace(/"/g, '""')}"`
}

function exportDate(value: string): string {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? value
    : date.toISOString()
}

function localDateString(): string {
  const now = new Date()

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1
  ).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
}

function readField(
  order: Order,
  ...paths: string[]
): unknown {
  for (const path of paths) {
    let value: unknown = order

    for (const part of path.split('.')) {
      if (
        value === null ||
        typeof value !== 'object'
      ) {
        value = undefined
        break
      }

      value = (
        value as Record<string, unknown>
      )[part]
    }

    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      return value
    }
  }

  return undefined
}

function moneyNumber(value: unknown): number | undefined {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[₹,\s]/g, '')

    if (
      cleaned &&
      Number.isFinite(Number(cleaned))
    ) {
      return Number(cleaned)
    }
  }

  return undefined
}

function showMoney(value: unknown): string {
  const amount = moneyNumber(value)

  return amount === undefined
    ? '—'
    : formatCurrency(amount)
}

function showText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim() || '—'
  }

  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return String(value)
  }

  return '—'
}

function couponName(order: Order): string {
  return showText(
    readField(
      order,
      'coupon_name',
      'coupon_code',
      'discount_code',
      'promo_code',
      'coupon.code',
      'coupon.name',
      'coupon_details.code',
      'applied_coupon.code'
    )
  )
}

function couponAmount(order: Order): number | undefined {
  const stored = moneyNumber(
    readField(
      order,
      'coupon_amount',
      'coupon_discount_amount',
      'coupon_discount',
      'discount_amount',
      'discount_value',
      'discount',
      'couponAmount',
      'discountAmount',
      'coupon.discount_amount',
      'coupon.amount',
      'coupon_details.discount_amount',
      'applied_coupon.discount_amount',
      'pricing.discount_amount',
      'totals.discount_amount'
    )
  )

  if (stored !== undefined) {
    return stored
  }

  // Only calculate when a coupon is recorded.
  if (couponName(order) === '—') {
    return 0
  }

  const subtotal = moneyNumber(order.subtotal)
  const shipping = moneyNumber(order.shipping_charge) ?? 0
  const total = moneyNumber(order.total)

  if (
    subtotal === undefined ||
    total === undefined
  ) {
    return undefined
  }

  // Valid when there are no other order adjustments.
  return Math.max(
    0,
    Math.round(
      (subtotal + shipping - total) * 100
    ) / 100
  )
}

function paidToLogistics(order: Order): number | undefined {
  return moneyNumber(
    readField(
      order,
      'paid_to_logistics',
      'logistics_paid',
      'logistics_paid_amount'
    )
  )
}

function actualPaid(order: Order): number | undefined {
  const stored = moneyNumber(
    readField(
      order,
      'actual_paid',
      'amount_paid',
      'paid_amount'
    )
  )

  if (stored !== undefined) {
    return stored
  }

  // Estimated from payment status if no actual amount exists.
  return isOrderPaid(order)
    ? moneyNumber(order.total)
    : 0
}

function earnedValue(order: Order): number | undefined {
  const stored = moneyNumber(
    readField(
      order,
      'earned_value',
      'net_earnings'
    )
  )

  if (stored !== undefined) {
    return stored
  }

  // Do not calculate earnings without a known logistics cost.
  const paid = actualPaid(order)
  const logistics = paidToLogistics(order)

  if (
    paid === undefined ||
    logistics === undefined
  ) {
    return undefined
  }

  return paid - logistics
}

function downloadCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  filename: string
) {
  const csv = [headers, ...rows]
    .map(row => row.map(csvCell).join(','))
    .join('\r\n')

  const blob = new Blob(
    [`\uFEFF${csv}`],
    { type: 'text/csv;charset=utf-8' }
  )

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename

  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  )
}

export default function Orders() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [status, setStatus] =
    useState<OrderStatus | 'all'>('all')

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [logisticsOpen, setLogisticsOpen] =
    useState(false)

  const { data: orders, isLoading } = useOrders({
    status,
    search,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = !!(
    search ||
    status !== 'all' ||
    dateFrom ||
    dateTo
  )

  // ORIGINAL CSV EXPORT
  const exportOrders = () => {
    if (!orders?.length) return

    const headers = [
      'Order Number',
      'Order Date',
      'Customer Name',
      'Customer Email',
      'Phone',
      'Item Count',
      'Items',
      'Subtotal',
      'Shipping Charge',
      'Total',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'Address',
      'City',
      'State',
      'Postal Code',
      'Courier',
      'Tracking Number',
      'Notes',
    ]

    const rows = orders.map(order => [
      order.order_number,
      exportDate(order.created_at),
      customerName(order) === '—'
        ? ''
        : customerName(order),
      order.guest_email?.trim() ||
      order.customer_email?.trim() ||
      '',
      customerPhone(order) === '—'
        ? ''
        : customerPhone(order),
      order.items?.length ?? 0,
      (order.items ?? [])
        .map(item =>
          `${item.name} x ${item.quantity}`
        )
        .join('; '),
      order.subtotal,
      order.shipping_charge,
      order.total,
      order.payment_method === 'cod'
        ? 'COD'
        : 'Online',
      isOrderPaid(order) ? 'Paid' : 'Pending',
      order.status,
      order.shipping_address?.address ?? '',
      order.shipping_address?.city ?? '',
      order.shipping_address?.state ?? '',
      order.shipping_address?.pincode ?? '',
      order.courier_name ?? '',
      order.tracking_number ?? '',
      order.note ?? '',
    ])

    const dateRange = dateFrom || dateTo
      ? `${dateFrom || 'start'}_to_${dateTo || 'present'}`
      : localDateString()

    downloadCsv(
      headers,
      rows,
      `orders_${dateRange}.csv`
    )
  }

  // LOGISTICS EXPORT
  const exportLogistics = (
    exportType: 'all' | 'ready'
  ) => {
    if (!orders?.length) return

    const selectedOrders = exportType === 'ready'
      ? orders.filter(order =>
        order.status === 'confirmed'
      )
      : orders

    const headers = [
      'Order Number',
      'Order Date',
      'Customer Name',
      'Phone',
      'Email',
      'Delivery Address',
      'City',
      'State',
      'Pincode',
      'Products',
      'Total Quantity',
      'Payment Method',
      'Payment Status',
      'Total Payable',
      'Shipping Charge',
      'Order Status',
      'Courier',
      'Tracking Number',
      'Notes',
    ]

    const rows = selectedOrders.map(order => [
      order.order_number,
      exportDate(order.created_at),
      customerName(order),
      customerPhone(order),
      order.guest_email?.trim() ||
      order.customer_email?.trim() ||
      '',
      order.shipping_address?.address ?? '',
      order.shipping_address?.city ?? '',
      order.shipping_address?.state ?? '',
      order.shipping_address?.pincode ?? '',
      (order.items ?? [])
        .map(item =>
          `${item.name} x ${item.quantity}`
        )
        .join('; '),
      (order.items ?? [])
        .reduce(
          (sum, item) => sum + item.quantity,
          0
        ),
      order.payment_method === 'cod'
        ? 'COD'
        : 'Online',
      isOrderPaid(order) ? 'Paid' : 'Pending',
      order.total,
      order.shipping_charge,
      order.status,
      order.courier_name ?? '',
      order.tracking_number ?? '',
      order.note ?? '',
    ])

    downloadCsv(
      headers,
      rows,
      `logistics_${exportType}_${localDateString()}.csv`
    )

    setLogisticsOpen(false)
  }

  return (
    <div className="p-6 space-y-5">

      {/* PAGE HEADER */}
      <div className="flex items-center justify-between gap-4">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Orders
          </h1>

          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading
              ? 'Loading…'
              : `${orders?.length ?? 0} orders`}
          </p>
        </div>

        {/* THREE ACTION BUTTONS */}
        <div className="flex items-center gap-2 flex-wrap justify-end">

          {/* EXPORT CSV */}
          <button
            type="button"
            onClick={exportOrders}
            disabled={isLoading || !orders?.length}
            title={
              orders?.length
                ? `Export ${orders.length} filtered orders`
                : 'No orders to export'
            }
            className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={15} />
            Export CSV
          </button>

          {/* EXPORT DATA TO LOGISTICS DROPDOWN */}
          <div className="relative">

            <button
              type="button"
              onClick={() =>
                setLogisticsOpen(!logisticsOpen)
              }
              disabled={isLoading || !orders?.length}
              aria-expanded={logisticsOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileDown size={15} />
              Export Data to Logistics
              <ChevronDown size={15} />
            </button>

            {logisticsOpen && (
              <>
                {/* Click outside to close */}
                <button
                  type="button"
                  aria-label="Close logistics menu"
                  onClick={() =>
                    setLogisticsOpen(false)
                  }
                  className="fixed inset-0 z-30 cursor-default"
                />

                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 z-40 w-64 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
                >

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      exportLogistics('all')
                    }
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <div className="font-medium">
                      Export All Filtered Orders
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Download currently filtered orders
                    </div>
                  </button>

                  <div className="border-t border-gray-100" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      exportLogistics('ready')
                    }
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <div className="font-medium">
                      Export Confirmed Orders
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      Orders marked as confirmed
                    </div>
                  </button>

                </div>
              </>
            )}

          </div>

          {/* ADD ORDER */}
          <Link
            to="/orders/add"
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
          >
            <Plus size={15} />
            Add Order
          </Link>

        </div>
      </div>

      {/* FILTER SECTION */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">

        <div className="flex flex-wrap gap-3 items-center">

          <div className="relative flex-1 min-w-[220px]">

            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              type="text"
              placeholder="Search order #, customer name, phone…"
              value={search}
              onChange={e =>
                setSearch(e.target.value)
              }
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <select
            value={status}
            onChange={e =>
              setStatus(
                e.target.value as OrderStatus | 'all'
              )
            }
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 bg-white text-gray-700 min-w-[160px]"
          >
            {STATUS_OPTIONS.map(o => (
              <option
                key={o.value}
                value={o.value}
              >
                {o.label}
              </option>
            ))}
          </select>

          <label
            htmlFor="orders-date-from"
            className="text-xs text-gray-500"
          >
            From
          </label>

          <input
            id="orders-date-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={e =>
              setDateFrom(e.target.value)
            }
            aria-label="Filter orders from date"
            className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />

          <label
            htmlFor="orders-date-to"
            className="text-xs text-gray-500"
          >
            To
          </label>

          <input
            id="orders-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={e =>
              setDateTo(e.target.value)
            }
            aria-label="Filter orders to date"
            className="px-3 py-2 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
          />

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors"
            >
              <X size={12} />
              Reset
            </button>
          )}

        </div>
      </div>

      {/* ORDERS TABLE - ALL 17 COLUMNS */}
      <div className="bg-white rounded-xl border border-gray-200">

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">
            Loading orders…
          </div>
        ) : (

          <div className="max-h-[70vh] overflow-auto rounded-xl">

            <table className="w-full min-w-[2200px] text-sm">

              {/* STICKY TABLE HEADER */}
              <thead className="bg-gray-50">

                <tr>
                  {HEADERS.map(h => (
                    <th
                      key={h}
                      scope="col"
                      className="sticky top-0 z-20 bg-gray-50 text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide shadow-[inset_0_-1px_0_#e5e7eb]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>

              </thead>

              {/* TABLE BODY */}
              <tbody className="divide-y divide-gray-100">

                {(orders ?? []).map(order => (
                  <tr
                    key={order.id}
                    onClick={() =>
                      navigate(`/orders/${order.id}`)
                    }
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >

                    {/* ORDER NO */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Link
                        to={`/orders/${order.id}`}
                        onClick={e =>
                          e.stopPropagation()
                        }
                        className="font-semibold text-red-600 hover:text-red-700 hover:underline"
                      >
                        {order.order_number}
                      </Link>
                    </td>

                    {/* ORDER DATE */}
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                      {formatDateShort(
                        order.created_at
                      )}
                    </td>

                    {/* CUSTOMER NAME */}
                    <td className="px-5 py-3 text-gray-800 font-medium min-w-[120px]">
                      {customerName(order)}
                    </td>

                    {/* PHONE */}
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                      {customerPhone(order)}
                    </td>

                    {/* ITEMS */}
                    <td className="px-5 py-3 text-gray-500 text-center">
                      {order.items?.length ?? 0}
                    </td>

                    {/* PRODUCTS */}
                    <td className="px-5 py-3 text-gray-600 min-w-[230px] max-w-[300px]">
                      {(order.items ?? []).length > 0
                        ? (order.items ?? []).map(
                          (item, index) => (
                            <span key={index}>
                              {index > 0 ? ', ' : ''}
                              {item.name} × {item.quantity}
                            </span>
                          )
                        )
                        : '—'}
                    </td>

                    {/* PRODUCT COST */}
                    <td className="px-5 py-3 text-gray-800 whitespace-nowrap">
                      {showMoney(order.subtotal)}
                    </td>

                    {/* COUPON NAME */}
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {couponName(order)}
                    </td>

                    {/* COUPON AMOUNT */}
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {showMoney(couponAmount(order))}
                    </td>

                    {/* SHIPMENT COST */}
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {showMoney(
                        order.shipping_charge
                      )}
                    </td>

                    {/* TOTAL PAYABLE */}
                    <td className="px-5 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {formatCurrency(
                        order.total
                      )}
                    </td>

                    {/* PAID TO LOGISTICS */}
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {showMoney(
                        paidToLogistics(order)
                      )}
                    </td>

                    {/* ACTUAL PAID */}
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {showMoney(
                        actualPaid(order)
                      )}
                    </td>

                    {/* EARNED VALUE */}
                    <td className="px-5 py-3 font-semibold text-gray-800 whitespace-nowrap">
                      {showMoney(
                        earnedValue(order)
                      )}
                    </td>

                    {/* PAYMENT METHOD */}
                    <td className="px-5 py-3 text-gray-600 text-xs font-medium whitespace-nowrap">
                      {order.payment_method === 'cod'
                        ? 'COD'
                        : 'Online'}
                    </td>

                    {/* PAYMENT STATUS */}
                    <td className="px-5 py-3 whitespace-nowrap">

                      {isOrderPaid(order) ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />
                          Paid
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">
                          Pending
                        </span>
                      )}

                    </td>

                    {/* ORDER STATUS */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      <StatusBadge
                        status={order.status}
                      />
                    </td>

                  </tr>
                ))}

                {(orders ?? []).length === 0 && (
                  <tr>
                    <td
                      colSpan={17}
                      className="px-5 py-12 text-center text-gray-400"
                    >
                      No orders match your filters
                    </td>
                  </tr>
                )}

              </tbody>

            </table>

          </div>
        )}

      </div>

    </div>
  )
}