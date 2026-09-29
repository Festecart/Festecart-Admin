import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateStr))
}

export function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateStr))
}

export function getProductStockStatusText({
  inventoryCount,
  lowStockThreshold,
  lowStockMessage,
}: {
  inventoryCount: number | null | undefined
  lowStockThreshold?: number | null
  lowStockMessage?: string | null
}): string {
  const stock = Number(inventoryCount ?? 0)

  if (!Number.isFinite(stock) || stock <= 0) {
    return 'Out of stock'
  }

  const threshold = Number(lowStockThreshold ?? 0)
  const message = (lowStockMessage ?? 'Order soon').trim() || 'Order soon'

  if (threshold > 0 && stock <= threshold) {
    return `${stock} ${stock === 1 ? 'product' : 'products'} left ${message}`
  }

  return `${stock} ${stock === 1 ? 'product' : 'products'} left`
}
