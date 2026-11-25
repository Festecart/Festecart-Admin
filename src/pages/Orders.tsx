import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, X, Plus, Download, FileDown, Loader2, ChevronDown, FileText, ArrowLeftRight, LayoutGrid, List } from 'lucide-react'
import { useOrders, isOrderPaid } from '@/hooks/useOrders'
import { OrderKanbanBoard } from '@/components/OrderKanbanBoard'
import { ManageTableColumns, useTableColumnPreferences } from '@/components/ManageTableColumns'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { downloadLogisticsCsv, downloadLogisticsPdf } from '@/lib/logisticsPdf'
import type { Order, OrderStatus } from '@/types'

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'partially_fulfilled', label: 'Partially Fulfilled' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'partially_delivered', label: 'Partially Delivered' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
]

const ORDER_TABLE_COLUMNS = [
  { id: 'order_number', label: 'Order No', canHide: false },
  { id: 'order_date', label: 'Order Date', canHide: false },
  { id: 'customer_name', label: 'Customer Name', canHide: false },
  { id: 'phone', label: 'Phone', canHide: false },
  { id: 'items', label: 'Items', canHide: false },
  { id: 'products', label: 'Products', canHide: false },
  { id: 'product_cost', label: 'Product Cost', canHide: false },
  { id: 'coupon_name', label: 'Coupon Name' },
  { id: 'coupon_amount', label: 'Coupon Amount' },
  { id: 'additional_discount', label: 'Additional Discount' },
  { id: 'shipment_cost', label: 'Shipment Cost' },
  { id: 'total_payable', label: 'Total Payable' },
  { id: 'paid_to_logistics', label: 'Paid to Logistics' },
  { id: 'actual_paid', label: 'Actual Paid' },
  { id: 'earned_value', label: 'Earned Value' },
  { id: 'payment_method', label: 'Payment Method' },
  { id: 'payment_status', label: 'Payment Status' },
  { id: 'order_status', label: 'Order Status' },
]

const ORDER_TABLE_STORAGE_KEY = 'festecart-admin:table-columns:orders'
const ORDER_TABLE_ORDER_VERSION_KEY = `${ORDER_TABLE_STORAGE_KEY}:order-version`
const ORDER_TABLE_ORDER_VERSION = '5'

function customerName(order: Order): string {
  return order.guest_name?.trim() || order.shipping_address?.name?.trim() || '—'
}
function customerPhone(order: Order): string {
  return order.guest_phone?.trim() || order.shipping_address?.phone?.trim() || '—'
}

function isCancelledOrderStatus(status: unknown): boolean {
  const normalized = String(status ?? '').trim().toLowerCase()
  return normalized === 'cancelled' || normalized === 'canceled'
}

function productCost(order: Order): number {
  return order.items?.length
    ? order.items.reduce((total, item) => total + item.price * item.quantity, 0)
    : order.subtotal
}

function totalPayable(order: Order): number {
  return order.total
}

function couponAmount(order: Order): number | null {
  if (order.coupon_discount != null) return order.coupon_discount
  return order.coupon_code ? null : 0
}

function couponAmountLabel(order: Order): string {
  const amount = couponAmount(order)
  return amount == null ? '—' : formatCurrency(amount)
}

function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? '' : String(value)
  if (typeof value === 'string' && /^[\u0000-\u0020]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

function exportDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function localDateString(): string {
  return dateString(new Date())
}

type StatisticsDateRange = 'today' | 'last7Days' | 'last30Days' | 'last90Days' | 'thisMonth' | 'lastMonth' | 'custom' | 'allTime'

const STATISTICS_DATE_RANGES: { value: StatisticsDateRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last7Days', label: '7D' },
  { value: 'last30Days', label: '30D' },
  { value: 'last90Days', label: '90D' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'custom', label: 'Custom' },
  { value: 'allTime', label: 'All Time' },
]

function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function localDateFromInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function statisticsDateFilter(
  range: StatisticsDateRange,
  customFrom: string,
  customTo: string,
): { dateFrom?: string; dateTo?: string } {
  if (range === 'allTime') return {}
  const end = new Date()
  let start = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  let endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate())

  if (range === 'last7Days' || range === 'last30Days' || range === 'last90Days') {
    const daysBack = range === 'last7Days' ? 6 : range === 'last30Days' ? 29 : 89
    start.setDate(start.getDate() - daysBack)
  } else if (range === 'thisMonth') {
    start = new Date(end.getFullYear(), end.getMonth(), 1)
  } else if (range === 'lastMonth') {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1)
    endDate = new Date(end.getFullYear(), end.getMonth(), 0)
  } else if (range === 'custom') {
    if (!customFrom || !customTo || customFrom > customTo) return {}
    start = localDateFromInput(customFrom)
    endDate = localDateFromInput(customTo)
  }

  return { dateFrom: start.toISOString(), dateTo: endDate.toISOString() }
}

export default function Orders() {
  const navigate = useNavigate()
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [search, setSearch] = useState('')
  const [statusMode, setStatusMode] = useState<'include' | 'exclude'>('include')
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statisticsRange, setStatisticsRange] = useState<StatisticsDateRange>('allTime')
  const [statisticsCustomFrom, setStatisticsCustomFrom] = useState(() => dateString(new Date()))
  const [statisticsCustomTo, setStatisticsCustomTo] = useState(() => dateString(new Date()))
  const [logisticsExportError, setLogisticsExportError] = useState('')
  const [isExportingLogistics, setIsExportingLogistics] = useState(false)
  const [isLogisticsExportMenuOpen, setIsLogisticsExportMenuOpen] = useState(false)
  const [horizontalScroll, setHorizontalScroll] = useState({ position: 0, max: 0 })
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  useEffect(() => {
    if (window.localStorage.getItem(ORDER_TABLE_ORDER_VERSION_KEY) === ORDER_TABLE_ORDER_VERSION) return

    const saved = window.localStorage.getItem(ORDER_TABLE_STORAGE_KEY)
    if (!saved) {
      window.localStorage.setItem(ORDER_TABLE_ORDER_VERSION_KEY, ORDER_TABLE_ORDER_VERSION)
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(saved)
    } catch {
      return
    }

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as { order?: unknown }).order) ||
      !Array.isArray((parsed as { hidden?: unknown }).hidden)
    ) return

    const settings = parsed as { order: unknown[]; hidden: unknown[] }
    const defaultIds = ORDER_TABLE_COLUMNS.map(column => column.id)

    if (JSON.stringify(settings.order) !== JSON.stringify(defaultIds)) {
      window.localStorage.setItem(
        ORDER_TABLE_STORAGE_KEY,
        JSON.stringify({ ...parsed, order: defaultIds }),
      )
    }
    window.localStorage.setItem(ORDER_TABLE_ORDER_VERSION_KEY, ORDER_TABLE_ORDER_VERSION)
  }, [ORDER_TABLE_ORDER_VERSION])
  const columnPreferences = useTableColumnPreferences(ORDER_TABLE_STORAGE_KEY, ORDER_TABLE_COLUMNS)

  const { data: filteredOrders, isLoading, error: ordersError } = useOrders({
    search,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })
  const statisticsRangeValid = statisticsRange !== 'custom' ||
    (Boolean(statisticsCustomFrom) && Boolean(statisticsCustomTo) && statisticsCustomFrom <= statisticsCustomTo)
  const statsDateFilter = useMemo(
    () => statisticsDateFilter(statisticsRange, statisticsCustomFrom, statisticsCustomTo),
    [statisticsRange, statisticsCustomFrom, statisticsCustomTo],
  )
  const {
    data: statisticsOrders = [],
    isLoading: statisticsLoading,
    error: statisticsError,
  } = useOrders(statsDateFilter)

  const orders = useMemo(() => {
    const selected = new Set(selectedStatuses)
    if (selected.size === 0) return filteredOrders ?? []
    return (filteredOrders ?? []).filter(order =>
      statusMode === 'include' ? selected.has(order.status) : !selected.has(order.status)
    )
  }, [filteredOrders, selectedStatuses, statusMode])
  const statistics = useMemo(() => {
    const deliveredOrders = statisticsOrders.filter(order => order.status === 'delivered')
    return {
      totalOrders: statisticsOrders.length,
      pendingOrders: statisticsOrders.filter(order => order.status === 'confirmed').length,
      processingOrders: statisticsOrders.filter(order => order.status === 'processing').length,
      deliveredOrders: statisticsOrders.filter(order => order.status === 'delivered').length,
      cancelledOrders: statisticsOrders.filter(order => isCancelledOrderStatus(order.status)).length,
      deliveredOrderValue: deliveredOrders.reduce((total, order) => total + order.total, 0),
    }
  }, [statisticsOrders])

  const clearFilters = () => {
    setSearch('')
    setSelectedStatuses([])
    setStatusMode('include')
    setDateFrom('')
    setDateTo('')
  }
  const hasFilters = !!(search || selectedStatuses.length || dateFrom || dateTo)

  const toggleStatus = (value: string) => {
    setSelectedStatuses(current => current.includes(value)
      ? current.filter(statusValue => statusValue !== value)
      : [...current, value])
  }

  useEffect(() => {
    const scrollElement = tableScrollRef.current
    const tableElement = tableRef.current
    if (!scrollElement || !tableElement) return

    const updateScrollControl = () => {
      const max = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth)
      setHorizontalScroll({ position: Math.min(scrollElement.scrollLeft, max), max })
    }

    const resizeObserver = new ResizeObserver(updateScrollControl)
    resizeObserver.observe(scrollElement)
    resizeObserver.observe(tableElement)
    scrollElement.addEventListener('scroll', updateScrollControl, { passive: true })
    updateScrollControl()

    return () => {
      resizeObserver.disconnect()
      scrollElement.removeEventListener('scroll', updateScrollControl)
    }
  }, [orders.length, viewMode])

  const setTableHorizontalScroll = (position: number) => {
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = position
    setHorizontalScroll(current => ({ ...current, position }))
  }

  const exportLogisticsData = async (format: 'pdf' | 'csv') => {
    setLogisticsExportError('')
    setIsExportingLogistics(true)
    setIsLogisticsExportMenuOpen(false)
    try {
      if (format === 'pdf') {
        await downloadLogisticsPdf(orders ?? [])
      } else {
        downloadLogisticsCsv(orders ?? [])
      }
    } catch (error) {
      setLogisticsExportError(
        error instanceof Error ? error.message : `Failed to generate the logistics ${format.toUpperCase()}.`
      )
    } finally {
      setIsExportingLogistics(false)
    }
  }

  const exportOrders = () => {
    if (!orders?.length) return

    const headers = [
      'Order Number', 'Order Date', 'Customer Name', 'Customer Email', 'Phone',
      'Item Count', 'Items', 'Product Cost', 'Coupon Name', 'Coupon Amount',
      'Additional Discount', 'Shipment Cost', 'Total Payable',
      'Paid to Logistics', 'Actual Paid', 'Earned Value',
      'Payment Method', 'Payment Status', 'Order Status', 'Address', 'City',
      'State', 'Postal Code', 'Courier', 'Tracking Number', 'Notes',
    ]
    const rows = orders.map(order => [
      order.order_number,
      exportDate(order.created_at),
      customerName(order) === '—' ? '' : customerName(order),
      order.guest_email?.trim() || order.customer_email?.trim() || '',
      customerPhone(order) === '—' ? '' : customerPhone(order),
      order.items?.length ?? 0,
      (order.items ?? []).map(item => `${item.name} x ${item.quantity}`).join('; '),
      productCost(order),
      order.coupon_code ?? '',
      couponAmount(order) ?? '',
      order.discount_amount ?? 0,
      order.shipping_charge,
      totalPayable(order),
      order.logistics_cost ?? 0,
      order.amount_paid,
      order.amount_paid - (order.logistics_cost ?? 0),
      order.payment_method === 'cod' ? 'COD' : 'Online',
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
    const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const dateRange = dateFrom || dateTo
      ? `${dateFrom || 'start'}_to_${dateTo || 'present'}`
      : localDateString()
    link.href = url
    link.download = `orders_${dateRange}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const statisticsCards = [
    { label: 'Total Orders', value: statistics.totalOrders.toLocaleString() },
    { label: 'Pending Orders', value: statistics.pendingOrders.toLocaleString() },
    { label: 'Processing Orders', value: statistics.processingOrders.toLocaleString() },
    { label: 'Delivered Orders', value: statistics.deliveredOrders.toLocaleString() },
    { label: 'Cancelled Orders', value: statistics.cancelledOrders.toLocaleString() },
    { label: 'Delivered Order Value', value: formatCurrency(statistics.deliveredOrderValue) },
  ]

  const renderStatisticsCards = () => (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {statisticsCards.map(stat => (
        <div key={stat.label} title={stat.label}
          className="min-w-0 rounded-lg border border-gray-100 px-2.5 py-1.5">
          <p className="whitespace-nowrap text-[10px] leading-4 text-gray-500">{stat.label}</p>
          <p className="whitespace-nowrap text-xs font-semibold text-gray-900">
            {statisticsLoading ? '…' : statisticsError || !statisticsRangeValid ? '—' : stat.value}
          </p>
        </div>
      ))}
    </div>
  )

  const renderOrderFilters = () => (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search order #, customer name, phone…"
            value={search} onChange={event => setSearch(event.target.value)}
            className="w-full rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="orders-status-mode" className="sr-only">Status filter mode</label>
          <select id="orders-status-mode" value={statusMode}
            onChange={event => setStatusMode(event.target.value as 'include' | 'exclude')}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500">
            <option value="include">Include</option>
            <option value="exclude">Exclude</option>
          </select>
          <details className="group relative">
            <summary className="list-none cursor-pointer select-none rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              Statuses{selectedStatuses.length ? ` (${selectedStatuses.length})` : ' (all)'}
              <ChevronDown size={13} className="ml-2 inline" />
            </summary>
            <div className="absolute left-0 z-30 mt-2 max-h-72 w-60 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
              <p className="px-2 py-1 text-xs text-gray-500">
                {selectedStatuses.length
                  ? `${statusMode === 'include' ? 'Only' : 'All except'} selected statuses`
                  : 'No statuses selected; showing all orders'}
              </p>
              {STATUS_OPTIONS.map(option => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <input type="checkbox" checked={selectedStatuses.includes(option.value)}
                    onChange={() => toggleStatus(option.value)}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                  <span>{option.label}</span>
                </label>
              ))}
              {selectedStatuses.length > 0 && (
                <button type="button" onClick={() => setSelectedStatuses([])}
                  className="mt-1 w-full border-t border-gray-100 px-2 py-2 text-left text-xs font-medium text-red-600 hover:bg-gray-50">
                  Clear selected statuses
                </button>
              )}
            </div>
          </details>
        </div>
        <label htmlFor="orders-date-from" className="text-xs text-gray-500">From</label>
        <input id="orders-date-from" type="date" value={dateFrom} max={dateTo || undefined}
          onChange={event => setDateFrom(event.target.value)} aria-label="Filter orders from date"
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500" />
        <label htmlFor="orders-date-to" className="text-xs text-gray-500">To</label>
        <input id="orders-date-to" type="date" value={dateTo} min={dateFrom || undefined}
          onChange={event => setDateTo(event.target.value)} aria-label="Filter orders to date"
          className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-500" />
        {hasFilters && (
          <button onClick={clearFilters}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:text-gray-900">
            <X size={12} /> Reset
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div
      data-orders-board={viewMode === 'board' ? '' : undefined}
      className={viewMode === 'board'
        ? 'flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-hidden p-6 pb-0'
        : 'min-w-0 p-6 space-y-5'}
    >
      <div className={`flex items-center justify-between ${viewMode === 'board' ? 'shrink-0' : ''}`}>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isLoading ? 'Loading…' : `${orders?.length ?? 0} orders`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1" role="group" aria-label="Order view">
            <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${
                viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <List size={15} /> List
            </button>
            <button type="button" onClick={() => setViewMode('board')} aria-pressed={viewMode === 'board'}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium ${
                viewMode === 'board' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <LayoutGrid size={15} /> Board
            </button>
          </div>
          <button type="button" onClick={exportOrders} disabled={isLoading || !orders?.length}
            title={orders?.length ? `Export ${orders.length} filtered orders` : 'No orders to export'}
            className="flex items-center gap-2 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
            <Download size={15} /> Export CSV
          </button>
          {viewMode === 'list' && (
            <ManageTableColumns preferences={columnPreferences} />
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsLogisticsExportMenuOpen(open => !open)}
              disabled={isLoading || isExportingLogistics || !orders?.length}
              title={orders?.length ? `Export ${orders.length} filtered orders for logistics` : 'No orders to export'}
              aria-haspopup="menu"
              aria-expanded={isLogisticsExportMenuOpen}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExportingLogistics
                ? <Loader2 size={15} className="animate-spin" />
                : <FileDown size={15} />}
              {isExportingLogistics ? 'Preparing export...' : 'Export Data to Logistics'}
              {!isExportingLogistics && <ChevronDown size={14} />}
            </button>
            {isLogisticsExportMenuOpen && (
              <div
                role="menu"
                aria-label="Choose logistics export format"
                onKeyDown={event => {
                  if (event.key === 'Escape') setIsLogisticsExportMenuOpen(false)
                }}
                className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => exportLogisticsData('pdf')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  <FileDown size={15} /> Download PDF
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => exportLogisticsData('csv')}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                >
                  <FileText size={15} /> Download CSV
                </button>
              </div>
            )}
          </div>
          <Link to="/orders/add"
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
            <Plus size={15} /> Add Order
          </Link>
        </div>
      </div>
      <section className="shrink-0 rounded-xl border border-gray-200 bg-white p-3 sm:p-4"
        aria-labelledby={viewMode === 'list' ? 'orders-statistics-heading' : undefined}>
        {viewMode === 'list' && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 id="orders-statistics-heading" className="text-sm font-semibold text-gray-900">Orders Statistics</h2>
                <p className="text-xs text-gray-500">Pending orders are in Confirmed status. Delivered Order Value includes delivered orders only.</p>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <label className="sr-only" htmlFor="orders-statistics-range">Statistics date range</label>
                <select id="orders-statistics-range" value={statisticsRange}
                  onChange={event => setStatisticsRange(event.target.value as StatisticsDateRange)}
                  className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500">
                  {STATISTICS_DATE_RANGES.map(range => (
                    <option key={range.value} value={range.value}>{range.label}</option>
                  ))}
                </select>
                {statisticsRange === 'custom' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="sr-only" htmlFor="orders-statistics-from">Custom statistics from date</label>
                    <input id="orders-statistics-from" type="date" value={statisticsCustomFrom}
                      max={statisticsCustomTo || undefined} onChange={event => setStatisticsCustomFrom(event.target.value)}
                      className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700" />
                    <span className="text-xs text-gray-400">to</span>
                    <label className="sr-only" htmlFor="orders-statistics-to">Custom statistics to date</label>
                    <input id="orders-statistics-to" type="date" value={statisticsCustomTo}
                      min={statisticsCustomFrom || undefined} max={dateString(new Date())}
                      onChange={event => setStatisticsCustomTo(event.target.value)}
                      className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700" />
                  </div>
                )}
              </div>
            </div>
            {statisticsError && (
              <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
                Could not load order statistics: {statisticsError instanceof Error ? statisticsError.message : 'Unknown error'}
              </p>
            )}
            {statisticsRange === 'custom' && !statisticsRangeValid && (
              <p className="mt-1 text-xs text-amber-700">Choose a valid start and end date for the statistics.</p>
            )}
            {renderStatisticsCards()}
          </>
        )}
        {logisticsExportError && (
          <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {logisticsExportError}
          </p>
        )}
        {renderOrderFilters()}
      </section>

      {/* Orders view */}
      <div className={`bg-white rounded-xl border border-gray-200 ${
        viewMode === 'board'
          ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden'
          : 'overflow-hidden'
      }`}>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading orders…</div>
        ) : ordersError ? (
          <div role="alert" className="p-8 text-center text-sm text-red-700">
            Could not load orders: {ordersError instanceof Error ? ordersError.message : 'Unknown error'}
          </div>
        ) : viewMode === 'board' ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pt-4">
            <OrderKanbanBoard orders={orders} />
          </div>
        ) : (
          <>
          <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto">
            <table ref={tableRef} className="w-full min-w-[1800px] text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  {columnPreferences.columns.map(column => (
                    <th key={column.id} className="sticky top-0 z-10 bg-gray-50 text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide shadow-[0_1px_0_0_rgba(243,244,246,1)]">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(order => (
                  <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors">
                    {columnPreferences.columns.map(column => {
                      switch (column.id) {
                        case 'order_number':
                          return (
                            <td key={column.id} className="px-5 py-3 whitespace-nowrap">
                              <Link to={`/orders/${order.id}`} onClick={e => e.stopPropagation()}
                                className="font-semibold text-red-600 hover:text-red-700 hover:underline">
                                {order.order_number}
                              </Link>
                            </td>
                          )
                        case 'order_date':
                          return <td key={column.id} className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatDateShort(order.created_at)}</td>
                        case 'customer_name':
                          return <td key={column.id} className="px-5 py-3 text-gray-800 font-medium">{customerName(order)}</td>
                        case 'phone':
                          return <td key={column.id} className="px-5 py-3 text-gray-500">{customerPhone(order)}</td>
                        case 'items':
                          return <td key={column.id} className="px-5 py-3 text-gray-500 text-center">{order.items?.length ?? 0}</td>
                        case 'products':
                          return (
                            <td key={column.id} className="px-5 py-3 text-gray-600 min-w-[220px] max-w-[320px] break-words">
                              {order.items?.length
                                ? order.items.map(item => `${item.name?.trim() || item.product_id} × ${item.quantity}`).join(', ')
                                : '—'}
                            </td>
                          )
                        case 'product_cost':
                          return <td key={column.id} className="px-5 py-3 whitespace-nowrap">{formatCurrency(productCost(order))}</td>
                        case 'coupon_name':
                          return <td key={column.id} className="px-5 py-3 text-gray-600">{order.coupon_code || '—'}</td>
                        case 'coupon_amount':
                          return <td key={column.id} className="px-5 py-3 whitespace-nowrap">{couponAmountLabel(order)}</td>
                        case 'additional_discount':
                          return <td key={column.id} className="px-5 py-3 whitespace-nowrap">{formatCurrency(order.discount_amount ?? 0)}</td>
                        case 'shipment_cost':
                          return <td key={column.id} className="px-5 py-3 whitespace-nowrap">{formatCurrency(order.shipping_charge)}</td>
                        case 'total_payable':
                          return <td key={column.id} className="px-5 py-3 font-semibold whitespace-nowrap">{formatCurrency(totalPayable(order))}</td>
                        case 'paid_to_logistics':
                          return <td key={column.id} className="px-5 py-3 whitespace-nowrap">{formatCurrency(order.logistics_cost ?? 0)}</td>
                        case 'actual_paid':
                          return <td key={column.id} className="px-5 py-3 whitespace-nowrap">{formatCurrency(order.amount_paid)}</td>
                        case 'earned_value':
                          return (
                            <td key={column.id} className={`px-5 py-3 whitespace-nowrap font-medium ${order.amount_paid - (order.logistics_cost ?? 0) < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                              {formatCurrency(order.amount_paid - (order.logistics_cost ?? 0))}
                            </td>
                          )
                        case 'payment_method':
                          return <td key={column.id} className="px-5 py-3 text-gray-600 text-xs font-medium">{order.payment_method === 'cod' ? 'COD' : 'Online'}</td>
                        case 'payment_status':
                          return (
                            <td key={column.id} className="px-5 py-3">
                              {isOrderPaid(order)
                                ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-800"><span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />Paid</span>
                                : <span className="text-gray-400 text-xs">Pending</span>}
                            </td>
                          )
                        case 'order_status':
                          return <td key={column.id} className="px-5 py-3"><StatusBadge status={order.status} /></td>
                      }
                    })}
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={columnPreferences.columns.length} className="px-5 py-12 text-center text-gray-400">No orders match your filters</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {horizontalScroll.max > 0 && (
            <div className="flex items-center gap-3 border-t border-gray-100 bg-white px-4 py-2.5">
              <ArrowLeftRight size={15} className="shrink-0 text-gray-500" aria-hidden="true" />
              <label htmlFor="orders-horizontal-scroll" className="shrink-0 text-xs font-medium text-gray-600">
                Scroll columns
              </label>
              <input
                id="orders-horizontal-scroll"
                type="range"
                min={0}
                max={horizontalScroll.max}
                step={Math.max(1, Math.floor(horizontalScroll.max / 100))}
                value={horizontalScroll.position}
                onChange={event => setTableHorizontalScroll(Number(event.target.value))}
                aria-label="Scroll orders table horizontally"
                className="h-2 w-full cursor-ew-resize accent-gray-800"
              />
              <span className="shrink-0 text-xs tabular-nums text-gray-400">
                {Math.round((horizontalScroll.position / horizontalScroll.max) * 100)}%
              </span>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  )
}