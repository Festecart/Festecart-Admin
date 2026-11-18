import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeftRight, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { useUpdateOrderStatus } from '@/hooks/useOrders'
import { StatusBadge } from '@/components/StatusBadge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import type { Order, OrderStatus } from '@/types'

const ORDER_STATUSES: OrderStatus[] = [
  'confirmed',
  'processing',
  'partially_fulfilled',
  'fulfilled',
  'shipped',
  'out_for_delivery',
  'partially_delivered',
  'delivered',
  'cancelled',
  'completed',
]

function customerName(order: Order): string {
  return order.guest_name?.trim() || order.shipping_address?.name?.trim() || 'Guest customer'
}

export function OrderKanbanBoard({ orders }: { orders: Order[] }) {
  const updateStatus = useUpdateOrderStatus()
  const boardScrollRef = useRef<HTMLDivElement>(null)
  const boardTrackRef = useRef<HTMLDivElement>(null)
  const columnScrollRefs = useRef(new Map<OrderStatus, HTMLDivElement>())
  const draggedOrderIdRef = useRef<string | null>(null)
  const dragOverStatusRef = useRef<OrderStatus | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<OrderStatus | null>(null)
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(() => new Set())
  const [optimisticStatuses, setOptimisticStatuses] = useState<Map<string, OrderStatus>>(() => new Map())
  const [updateError, setUpdateError] = useState('')
  const [horizontalScroll, setHorizontalScroll] = useState({ position: 0, max: 0 })

  const displayedOrders = useMemo(
    () => orders.map(order => {
      const status = optimisticStatuses.get(order.id)
      return status && status !== order.status ? { ...order, status } : order
    }),
    [orders, optimisticStatuses]
  )

  const ordersByStatus = useMemo(() => {
    const groups = new Map<OrderStatus, Order[]>()
    ORDER_STATUSES.forEach(status => groups.set(status, []))
    displayedOrders.forEach(order => {
      groups.get(order.status)?.push(order)
    })
    return groups
  }, [displayedOrders])

  useEffect(() => {
    setOptimisticStatuses(current => {
      let next: Map<string, OrderStatus> | null = null
      current.forEach((status, orderId) => {
        if (orders.find(order => order.id === orderId)?.status === status) {
          next ??= new Map(current)
          next.delete(orderId)
        }
      })
      return next ?? current
    })
  }, [orders])

  useEffect(() => {
    const scrollElement = boardScrollRef.current
    const trackElement = boardTrackRef.current
    if (!scrollElement || !trackElement) return

    const updateScrollControl = () => {
      const max = Math.max(0, scrollElement.scrollWidth - scrollElement.clientWidth)
      setHorizontalScroll({
        position: Math.min(scrollElement.scrollLeft, max),
        max,
      })
    }

    const resizeObserver = new ResizeObserver(updateScrollControl)
    resizeObserver.observe(scrollElement)
    resizeObserver.observe(trackElement)
    scrollElement.addEventListener('scroll', updateScrollControl, { passive: true })
    updateScrollControl()

    return () => {
      resizeObserver.disconnect()
      scrollElement.removeEventListener('scroll', updateScrollControl)
    }
  }, [orders.length])

  useEffect(() => {
    const scrollElement = boardScrollRef.current
    if (!scrollElement) return

    const normalizeWheelDelta = (delta: number, deltaMode: number) => {
      if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * 16
      if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * scrollElement.clientWidth
      return delta
    }

    const handleWheel = (event: WheelEvent) => {
      const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode)
      const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode)
      const horizontalDelta = event.shiftKey
        ? deltaY || deltaX
        : Math.abs(deltaX) >= Math.abs(deltaY)
          ? deltaX
          : 0

      if (!horizontalDelta) return

      event.preventDefault()
      scrollElement.scrollBy({ left: horizontalDelta, behavior: 'auto' })
    }

    scrollElement.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => scrollElement.removeEventListener('wheel', handleWheel, true)
  }, [])

  const setBoardHorizontalScroll = (position: number) => {
    if (boardScrollRef.current) boardScrollRef.current.scrollLeft = position
    setHorizontalScroll(current => ({ ...current, position }))
  }

  const scrollColumn = (status: OrderStatus, direction: -1 | 1) => {
    columnScrollRefs.current.get(status)?.scrollBy({
      top: direction * 240,
      behavior: 'smooth',
    })
  }

  const changeOrderStatus = async (orderId: string, status: OrderStatus) => {
    const order = orders.find(item => item.id === orderId)
    const currentStatus = optimisticStatuses.get(orderId) ?? order?.status
    if (!order || !currentStatus || currentStatus === status || pendingOrderIds.has(orderId)) return

    setUpdateError('')
    setPendingOrderIds(current => new Set(current).add(orderId))
    setOptimisticStatuses(current => new Map(current).set(orderId, status))
    try {
      await updateStatus.mutateAsync({
        orderId,
        currentStatus,
        status,
      })
    } catch (error) {
      setOptimisticStatuses(current => {
        const next = new Map(current)
        if (currentStatus === order.status) next.delete(orderId)
        else next.set(orderId, currentStatus)
        return next
      })
      setUpdateError(
        error instanceof Error ? error.message : `Could not move ${order.order_number} to the selected status.`
      )
    } finally {
      setPendingOrderIds(current => {
        const next = new Set(current)
        next.delete(orderId)
        return next
      })
    }
  }

  const handleDrop = (event: DragEvent, status: OrderStatus) => {
    event.preventDefault()
    const orderId = event.dataTransfer.getData('text/plain') || draggedOrderIdRef.current
    draggedOrderIdRef.current = null
    dragOverStatusRef.current = null
    setDragOverStatus(null)
    if (orderId) void changeOrderStatus(orderId, status)
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <p className="text-sm text-gray-500">
        Drag an order card to another column, or use its status menu.
      </p>
      {updateError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {updateError}
        </p>
      )}
      <div
        ref={boardScrollRef}
        role="region"
        aria-label="Orders by status"
        className="min-h-0 min-w-0 w-full flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-none"
      >
        <div ref={boardTrackRef} className="flex h-full min-h-0 w-max items-stretch gap-3">
          {ORDER_STATUSES.map(status => {
            const statusOrders = ordersByStatus.get(status) ?? []
            return (
              <section
                key={status}
                aria-label={`${status.replace(/_/g, ' ')} orders`}
                onDragOver={event => {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  if (dragOverStatusRef.current !== status) {
                    dragOverStatusRef.current = status
                    setDragOverStatus(status)
                  }
                }}
                onDragLeave={event => {
                  if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                    dragOverStatusRef.current = null
                    setDragOverStatus(null)
                  }
                }}
                onDrop={event => handleDrop(event, status)}
                className={`flex h-full max-h-full w-72 max-w-[85vw] shrink-0 flex-col rounded-xl border p-3 transition-colors ${
                  dragOverStatus === status
                    ? 'border-red-300 bg-red-50'
                    : 'border-gray-200 bg-gray-100/70'
                }`}
              >
                <div className="mb-3 flex shrink-0 items-center justify-between gap-1">
                  <StatusBadge status={status} />
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => scrollColumn(status, -1)}
                      aria-label={`Scroll ${status.replace(/_/g, ' ')} orders up`}
                      title="Scroll up"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <ChevronUp size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => scrollColumn(status, 1)}
                      aria-label={`Scroll ${status.replace(/_/g, ' ')} orders down`}
                      title="Scroll down"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-white focus:outline-none focus:ring-2 focus:ring-red-500"
                    >
                      <ChevronDown size={15} aria-hidden="true" />
                    </button>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-gray-500">
                      {statusOrders.length}
                    </span>
                  </div>
                </div>
                <div
                  ref={element => {
                    if (element) columnScrollRefs.current.set(status, element)
                    else columnScrollRefs.current.delete(status)
                  }}
                  className="min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-thin"
                >
                  {statusOrders.map(order => {
                    const isPending = pendingOrderIds.has(order.id)
                    return (
                      <article
                        key={order.id}
                        draggable={!isPending}
                        onDragStart={event => {
                          event.dataTransfer.setData('text/plain', order.id)
                          event.dataTransfer.effectAllowed = 'move'
                          draggedOrderIdRef.current = order.id
                          event.currentTarget.classList.add('opacity-40')
                        }}
                        onDragEnd={event => {
                          draggedOrderIdRef.current = null
                          event.currentTarget.classList.remove('opacity-40')
                          dragOverStatusRef.current = null
                          setDragOverStatus(null)
                        }}
                        className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${
                          isPending ? 'cursor-not-allowed opacity-60' : 'cursor-grab active:cursor-grabbing'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/orders/${order.id}`}
                            className="text-sm font-semibold text-red-600 hover:text-red-700 hover:underline"
                          >
                            {order.order_number}
                          </Link>
                          <span
                            data-order-drag-handle
                            title={`Drag ${order.order_number} to another status`}
                            className="text-gray-400"
                          >
                            <GripVertical size={16} aria-hidden="true" />
                          </span>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-gray-800">{customerName(order)}</p>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                          <span>{formatDateShort(order.created_at)}</span>
                          <span>{order.items?.length ?? 0} items</span>
                        </div>
                        <p className="mt-2 truncate text-xs text-gray-500">
                          {order.items?.length
                            ? order.items.slice(0, 2).map(item => item.name?.trim() || item.product_id).join(', ')
                            : 'No items'}
                          {(order.items?.length ?? 0) > 2 ? ` +${order.items.length - 2} more` : ''}
                        </p>
                        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
                          <span className="text-sm font-semibold text-gray-900">{formatCurrency(order.total)}</span>
                          <span className="text-xs text-gray-500">
                            {order.payment_status === 'paid' ? 'Paid' : 'Payment pending'}
                          </span>
                        </div>
                        <label className="sr-only" htmlFor={`order-status-${order.id}`}>
                          Change status for {order.order_number}
                        </label>
                        <select
                          id={`order-status-${order.id}`}
                          value={order.status}
                          disabled={isPending}
                          onChange={event => void changeOrderStatus(order.id, event.target.value as OrderStatus)}
                          className="mt-3 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60"
                        >
                          {ORDER_STATUSES.map(option => (
                            <option key={option} value={option}>
                              {option.replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase())}
                            </option>
                          ))}
                        </select>
                      </article>
                    )
                  })}
                  {statusOrders.length === 0 && (
                    <p className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-center text-xs text-gray-400">
                      Drop here
                    </p>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
      {horizontalScroll.max > 0 && (
        <div className="flex items-center gap-3 border-t border-gray-100 bg-white px-2 py-2">
          <ArrowLeftRight size={15} className="shrink-0 text-gray-500" aria-hidden="true" />
          <label htmlFor="orders-board-horizontal-scroll" className="shrink-0 text-xs font-medium text-gray-600">
            Scroll statuses
          </label>
          <input
            id="orders-board-horizontal-scroll"
            type="range"
            min={0}
            max={horizontalScroll.max}
            step={Math.max(1, Math.floor(horizontalScroll.max / 100))}
            value={horizontalScroll.position}
            onChange={event => setBoardHorizontalScroll(Number(event.target.value))}
            aria-label="Scroll order status columns horizontally"
            className="h-2 w-full cursor-ew-resize accent-gray-800"
          />
          <span className="shrink-0 text-xs tabular-nums text-gray-400">
            {Math.round((horizontalScroll.position / horizontalScroll.max) * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}
