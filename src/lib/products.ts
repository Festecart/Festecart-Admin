import { collection, db, getDocs, orderBy, query, where } from '@/lib/firebase'

export interface AdminProduct {
  id: string
  name: string
  slug: string
  price: number
  compare_at_price: number | null
  inventory_count: number | null
  low_stock_threshold?: number | null
  low_stock_message?: string | null
  sku: string | null
  images: string[]
  status: string
  is_featured: boolean
  display_order: number
  category_id: string | null
  vendor_id: string | null
  created_at: string
}

export interface AdminCategory {
  id: string
  name: string
  slug?: string
  parent_id?: string | null
  display_order?: number
  is_active?: boolean
}

export async function fetchAdminProducts(status = 'all'): Promise<AdminProduct[]> {
  const constraints = status && status !== 'all'
    ? [where('status', '==', status), orderBy('display_order', 'asc')]
    : [orderBy('display_order', 'asc')]
  const snapshot = await getDocs(query(collection(db, 'products'), ...constraints))
  const products = snapshot.docs.map(document => ({
    id: document.id,
    ...document.data(),
  } as AdminProduct))
  return [
    ...products.filter(product => product.display_order > 0).sort((left, right) => left.display_order - right.display_order),
    ...products.filter(product => !product.display_order),
  ]
}

export async function fetchAdminCategories(): Promise<AdminCategory[]> {
  const snapshot = await getDocs(collection(db, 'categories'))
  return snapshot.docs.map(document => ({
    id: document.id,
    ...document.data(),
  } as AdminCategory))
}
