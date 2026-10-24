import type { Order, ShippingAddress } from '@/types'

const PAGE_MARGIN = 10
const HEADER_HEIGHT = 12
const TITLE_HEIGHT = 11
const ROW_PADDING = 2
const LINE_HEIGHT = 3
const FONT_SIZE = 6
const COLUMNS = [
  { title: 'Order Number', width: 25 },
  { title: 'Name', width: 30 },
  { title: 'Phone No.', width: 25 },
  { title: 'E-mail', width: 42 },
  { title: 'Billing Address', width: 55 },
  { title: 'Shipping Address', width: 55 },
  { title: 'Products', width: 95 },
  { title: 'Quantities', width: 20 },
  { title: 'Amount Payable', width: 25 },
  { title: 'Mode of Payment', width: 28 },
]

function formatAddress(address: ShippingAddress | string | null | undefined): string {
  if (!address) return 'Not provided'
  if (typeof address === 'string') return address.trim() || 'Not provided'

  return [
    address.name,
    address.phone,
    address.address,
    [address.city, address.state, address.pincode].filter(Boolean).join(', '),
  ].filter(Boolean).join('\n')
}

function customerName(order: Order): string {
  return order.guest_name?.trim() || order.shipping_address?.name?.trim() || '—'
}

function customerPhone(order: Order): string {
  return order.guest_phone?.trim() || order.shipping_address?.phone?.trim() || '—'
}

function customerEmail(order: Order): string {
  return order.guest_email?.trim() || order.customer_email?.trim() || '—'
}

function paymentMethod(order: Order): string {
  const method = order.payment_method.trim()
  if (method.toLowerCase() === 'cod') return 'Cash on Delivery'
  if (!method) return 'Not specified'
  return method
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function orderCells(order: Order): string[] {
  const shippingAddress = formatAddress(order.shipping_address)
  const billingAddress = order.billing_address
    ? formatAddress(order.billing_address)
    : 'Same as shipping'
  const products = (order.items ?? []).map(item =>
    `${item.name || 'Unnamed product'} (x${item.quantity})`
  )
  const quantities = (order.items ?? []).map(item => String(item.quantity))

  return [
    order.order_number || order.id,
    customerName(order),
    customerPhone(order),
    customerEmail(order),
    billingAddress,
    shippingAddress,
    products.length ? products.join('\n') : '—',
    quantities.length ? quantities.join('\n') : '—',
    `INR ${Number(order.total).toFixed(2)}`,
    paymentMethod(order),
  ]
}

export async function downloadLogisticsPdf(orders: Order[]): Promise<void> {
  if (orders.length === 0) {
    throw new Error('There are no orders to export.')
  }

  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  pdf.setProperties({ title: 'Logistics Dispatch Sheet', subject: 'Order details for logistics' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const tableWidth = COLUMNS.reduce((total, column) => total + column.width, 0)
  const tableX = (pageWidth - tableWidth) / 2
  const bodyBottom = pageHeight - PAGE_MARGIN - 8
  let y = PAGE_MARGIN

  const drawHeader = (includeTitle: boolean) => {
    if (includeTitle) {
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.text('Logistics Dispatch Sheet', PAGE_MARGIN, y + 4)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.text(
        `Generated ${new Date().toLocaleString('en-IN')} | ${orders.length} orders`,
        pageWidth - PAGE_MARGIN,
        y + 4,
        { align: 'right' },
      )
      y += TITLE_HEIGHT
    }

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(FONT_SIZE)
    let x = tableX
    COLUMNS.forEach(column => {
      pdf.setFillColor(243, 244, 246)
      pdf.rect(x, y, column.width, HEADER_HEIGHT, 'F')
      pdf.setDrawColor(209, 213, 219)
      pdf.rect(x, y, column.width, HEADER_HEIGHT)
      const lines = pdf.splitTextToSize(column.title, column.width - 4)
      pdf.text(lines, x + 2, y + 4)
      x += column.width
    })
    y += HEADER_HEIGHT
    pdf.setFont('helvetica', 'normal')
  }

  drawHeader(true)

  orders.forEach(order => {
    const cells = orderCells(order).map((value, index) =>
      pdf.splitTextToSize(value, COLUMNS[index].width - 4)
    )
    const lineCount = Math.max(...cells.map(lines => lines.length))
    const rowHeight = Math.max(8, lineCount * LINE_HEIGHT + ROW_PADDING * 2)

    if (y + rowHeight > bodyBottom) {
      pdf.addPage()
      y = PAGE_MARGIN
      drawHeader(false)
    }

    let x = tableX
    cells.forEach((lines, index) => {
      const column = COLUMNS[index]
      pdf.setDrawColor(209, 213, 219)
      pdf.rect(x, y, column.width, rowHeight)
      pdf.text(lines, x + 2, y + ROW_PADDING + 2.2, {
        maxWidth: column.width - 4,
      })
      x += column.width
    })
    y += rowHeight
  })

  const pageCount = pdf.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 5, {
      align: 'right',
    })
  }

  const date = new Date()
  const dateStamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  pdf.save(`logistics_orders_${dateStamp}.pdf`)
}
