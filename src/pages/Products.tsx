import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Search, Plus, MoreVertical, Pencil, Trash2} from 'lucide-react'

interface Product {
  id: string
  name: string
  slug: string
  price: number
  compare_at_price: number | null
  inventory_count: number | null
  sku: string | null
  images: string[]
  status: string
  is_featured: boolean
  display_order: number
  category_id: string | null
  vendor_id: string | null
  created_at: string
}

interface Category { id: string; name: string }

function useProducts(search: string, status: string) {
  return useQuery({
    queryKey: ['admin-products', search, status],
    queryFn: async () => {
      let q = supabase.from('products').select('*').order('display_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
      if (status && status !== 'all') q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      let products = (data ?? []) as Product[]

      // Sort: non-zero display_order first (ascending), then zero/unset by created_at desc
      products = [
        ...products.filter(p => p.display_order > 0).sort((a, b) => a.display_order - b.display_order),
        ...products.filter(p => !p.display_order),
      ]
      if (search) {
        const s = search.toLowerCase()
        products = products.filter(p =>
          p.name.toLowerCase().includes(s) ||
          (p.sku ?? '').toLowerCase().includes(s)
        )
      }
      return products
    },
    staleTime: 1000 * 30,
  })
}

function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, name').order('display_order')
      return (data ?? []) as Category[]
    },
  })
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Status' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_BADGE: Record<string, string> = {
  published: 'text-green-700',
  draft:     'text-gray-500',
  pending:   'text-amber-600',
  rejected:  'text-red-600',
}

export default function Products() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data: products, isLoading, refetch } = useProducts(search, status)
  const { data: categories } = useCategories()

  const catMap = Object.fromEntries((categories ?? []).map(c => [c.id, c.name]))

  const toggleSelect = (id: string) => {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const deleteProduct = async (id: string) => {
    await supabase.from('products').delete().eq('id', id)
    refetch()
    setMenuId(null)
  }

  return (
    <div className="p-6 space-y-5">
      {/* Breadcrumb */}
      <p className="text-xs text-gray-400">Catalog / <span className="text-gray-600">Products</span></p>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <div className="flex items-center gap-2">
         
          <Link
            to="/catalog/products/add"
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
          >
            <Plus size={15} /> Add Product
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Name / SKU / Code"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 min-w-[160px]"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => { setSearch(''); setStatus('all') }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Reset</button>
          <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800">Search</button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading products…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="w-10 px-4 py-3">
                    <input type="checkbox" onChange={e => setSelected(e.target.checked ? new Set((products ?? []).map(p => p.id)) : new Set())} />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide" colSpan={2}>Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Selling Price</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Order</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(products ?? []).map(product => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(product.id)} onChange={() => toggleSelect(product.id)} />
                    </td>
                    <td className="px-4 py-3 w-14">
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt={product.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-xs">No img</div>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <p className="font-medium text-gray-900 text-sm">{product.name}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{product.sku || '—'}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(product.price)}</td>
                    <td className="px-4 py-3 text-gray-500">{product.inventory_count ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{catMap[product.category_id ?? ''] || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-xs font-medium ${STATUS_BADGE[product.status] ?? 'text-gray-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${product.status === 'published' ? 'bg-green-500' : product.status === 'rejected' ? 'bg-red-500' : 'bg-gray-400'}`} />
                        {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-mono px-2 py-0.5 rounded ${product.display_order > 0 ? 'bg-gray-900 text-white' : 'text-gray-400'}`}>
                        {product.display_order > 0 ? `#${product.display_order}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative">
                        <button onClick={() => setMenuId(menuId === product.id ? null : product.id)}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
                          <MoreVertical size={16} />
                        </button>
                        {menuId === product.id && (
                          <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                            <button onClick={() => { navigate(`/catalog/products/${product.id}/edit`); setMenuId(null) }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              <Pencil size={13} /> Edit
                            </button>
                    
                            <button onClick={() => deleteProduct(product.id)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(products ?? []).length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No products found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
