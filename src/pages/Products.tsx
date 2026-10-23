
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { writeBatch } from 'firebase/firestore'
import {
  db, collection, doc, getDocs, deleteDoc,
  query, where, orderBy,
} from '@/lib/firebase'
import { formatCurrency, getProductStockStatusText } from '@/lib/utils'
import {
  Search, Plus, MoreVertical, Pencil,
  Trash2, GripVertical
} from 'lucide-react'

interface Product {
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

interface Category {
  id: string
  name: string
}

function useProducts(_search: string, status: string) {
  return useQuery({
    queryKey: ['admin-products', status],
    queryFn: async () => {
      const constraints = status && status !== 'all'
        ? [
          where('status', '==', status),
          orderBy('display_order', 'asc')
        ]
        : [orderBy('display_order', 'asc')]

      const snap = await getDocs(
        query(collection(db, 'products'), ...constraints)
      )

      let products = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Product))

      products = [
        ...products
          .filter(p => p.display_order > 0)
          .sort((a, b) => a.display_order - b.display_order),
        ...products.filter(p => !p.display_order),
      ]

      return products
    },
    staleTime: 1000 * 30,
  })
}

function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'categories'))
      return snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as Category))
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
  draft: 'text-gray-500',
  pending: 'text-amber-600',
  rejected: 'text-red-600',
}

export default function Products() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(
    new Set()
  )

  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderError, setOrderError] = useState('')

  const {
    data: products,
    isLoading,
    refetch
  } = useProducts(search, status)

  const { data: categories } = useCategories()

  const catMap = Object.fromEntries(
    (categories ?? []).map(c => [c.id, c.name])
  )

  const filtered = search
    ? (products ?? []).filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase())
    )
    : (products ?? [])

  // Enable reordering only when all products are visible.
  const canReorder =
    !search.trim() &&
    status === 'all' &&
    !savingOrder

  // Drag-and-drop product ordering.
  const moveProduct = async (
    sourceId: string,
    targetId: string
  ) => {
    if (
      !canReorder ||
      sourceId === targetId ||
      !products
    ) return

    const oldProducts = products
    const reordered = [...products]

    const from = reordered.findIndex(
      p => p.id === sourceId
    )

    const to = reordered.findIndex(
      p => p.id === targetId
    )

    if (from < 0 || to < 0) return

    const [moved] = reordered.splice(from, 1)

    reordered.splice(to, 0, moved)

    // Automatically assign updated order numbers.
    const updated = reordered.map((p, index) => ({
      ...p,
      display_order: index + 1
    }))

    setSavingOrder(true)
    setOrderError('')

    // Immediately update the visible table.
    queryClient.setQueryData(
      ['admin-products', status],
      updated
    )

    try {
      // Save updated product order in Firestore.
      // Split into batches to respect Firestore limits.
      for (
        let start = 0;
        start < updated.length;
        start += 500
      ) {
        const batch = writeBatch(db)

        updated
          .slice(start, start + 500)
          .forEach(p => {
            batch.update(
              doc(db, 'products', p.id),
              {
                display_order: p.display_order
              }
            )
          })

        await batch.commit()
      }

      await refetch()
    } catch (error) {
      queryClient.setQueryData(
        ['admin-products', status],
        oldProducts
      )

      setOrderError(
        'Could not save product order. Please try again.'
      )

      console.error(
        'Failed to reorder products:',
        error
      )

      await refetch()
    } finally {
      setSavingOrder(false)
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(s => {
      const n = new Set(s)

      if (n.has(id)) {
        n.delete(id)
      } else {
        n.add(id)
      }

      return n
    })
  }

  const deleteProduct = async (id: string) => {
    await deleteDoc(doc(db, 'products', id))
    refetch()
    setMenuId(null)
  }

  return (
    <div className="p-6 space-y-5">

      <p className="text-xs text-gray-400">
        Catalog /{' '}
        <span className="text-gray-600">
          Products
        </span>
      </p>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Products
        </h1>

        <Link
          to="/catalog/products/add"
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
        >
          <Plus size={15} />
          Add Product
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-3">

          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />

            <input
              type="text"
              placeholder="Name / SKU"
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
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setSearch('')
              setStatus('all')
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            Reset
          </button>

        </div>
      </div>

      {/* Drag Instructions */}
      <p className="text-xs text-gray-500">
        {savingOrder
          ? 'Saving product order…'
          : canReorder
            ? 'Drag the grip icon beside a product to reorder it. Changes save automatically.'
            : 'Clear search and choose All Status to enable reordering.'}
      </p>

      {orderError && (
        <p role="alert" className="text-sm text-red-600">
          {orderError}
        </p>
      )}

      {/* Product Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">
            Loading products…
          </div>
        ) : (
          <div className="overflow-x-auto">

            <table className="w-full text-sm">

              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>

                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      onChange={e =>
                        setSelected(
                          e.target.checked
                            ? new Set(filtered.map(p => p.id))
                            : new Set()
                        )
                      }
                    />
                  </th>

                  <th
                    className="w-10 px-2 py-3"
                    title="Drag to reorder"
                  >
                    Move
                  </th>

                  <th
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase"
                    colSpan={2}
                  >
                    Name
                  </th>

                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    SKU
                  </th>

                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Price
                  </th>

                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Stock
                  </th>

                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Category
                  </th>

                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Status
                  </th>

                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Order
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    Action
                  </th>

                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">

                {filtered.map(product => (

                  <tr
                    key={product.id}

                    onDragOver={e => {
                      if (!canReorder || !draggedId) return

                      e.preventDefault()

                      e.dataTransfer.dropEffect = 'move'

                      setOverId(product.id)
                    }}

                    onDrop={e => {
                      e.preventDefault()

                      const sourceId =
                        e.dataTransfer.getData('text/plain') ||
                        draggedId

                      setDraggedId(null)
                      setOverId(null)

                      if (sourceId) {
                        void moveProduct(
                          sourceId,
                          product.id
                        )
                      }
                    }}

                    className={`hover:bg-gray-50 transition-colors ${overId === product.id &&
                      draggedId !== product.id
                      ? 'bg-blue-50 ring-1 ring-inset ring-blue-300'
                      : ''
                      }`}
                  >

                    {/* Checkbox */}
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(product.id)}
                        onChange={() =>
                          toggleSelect(product.id)
                        }
                      />
                    </td>

                    {/* Drag Handle */}
                    <td className="px-2 py-3">
                      <span
                        draggable={canReorder}

                        title={
                          canReorder
                            ? 'Drag to change product order'
                            : 'Clear filters to reorder'
                        }

                        onDragStart={e => {
                          if (!canReorder) {
                            e.preventDefault()
                            return
                          }

                          e.dataTransfer.effectAllowed = 'move'

                          e.dataTransfer.setData(
                            'text/plain',
                            product.id
                          )

                          setDraggedId(product.id)
                        }}

                        onDragEnd={() => {
                          setDraggedId(null)
                          setOverId(null)
                        }}

                        className={`inline-flex p-1 rounded text-gray-400 ${canReorder
                          ? 'cursor-grab active:cursor-grabbing hover:bg-gray-100'
                          : 'cursor-not-allowed opacity-40'
                          }`}

                        aria-label={`Move ${product.name}`}
                      >
                        <GripVertical size={17} />
                      </span>
                    </td>

                    {/* Product Image */}
                    <td className="px-4 py-3 w-14">
                      {product.images?.[0] ? (
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="w-10 h-10 rounded-lg object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300 text-xs">
                          No img
                        </div>
                      )}
                    </td>

                    {/* Product Name */}
                    <td className="px-2 py-3">
                      <p className="font-medium text-gray-900 text-sm">
                        {product.name}
                      </p>
                    </td>

                    {/* SKU */}
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {product.sku || '—'}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 font-medium">
                      {formatCurrency(product.price)}
                    </td>

                    {/* Stock */}
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex flex-col items-start gap-1">

                        <span
                          className={
                            product.inventory_count !== null &&
                              product.inventory_count <= 0
                              ? 'text-red-600 font-medium'
                              : 'text-gray-700'
                          }
                        >
                          {product.inventory_count ?? '—'}
                        </span>

                        {product.inventory_count !== null && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full ${product.inventory_count <= 0
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-700'
                              }`}
                          >
                            {getProductStockStatusText({
                              inventoryCount: product.inventory_count,
                              lowStockThreshold: product.low_stock_threshold ?? null,
                              lowStockMessage: product.low_stock_message ?? 'Order soon'
                            })}
                          </span>
                        )}

                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {catMap[product.category_id ?? ''] || '—'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`flex items-center gap-1 text-xs font-medium ${STATUS_BADGE[product.status] ??
                          'text-gray-500'
                          }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${product.status === 'published'
                            ? 'bg-green-500'
                            : product.status === 'rejected'
                              ? 'bg-red-500'
                              : 'bg-gray-400'
                            }`}
                        />

                        {product.status.charAt(0).toUpperCase() +
                          product.status.slice(1)}
                      </span>
                    </td>

                    {/* Automatically Updated Order */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded ${product.display_order > 0
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-400'
                          }`}
                      >
                        {product.display_order > 0
                          ? `#${product.display_order}`
                          : '—'}
                      </span>
                    </td>

                    {/* Existing Edit/Delete Actions */}
                    <td className="px-4 py-3">
                      <div className="relative">

                        <button
                          onClick={() =>
                            setMenuId(
                              menuId === product.id
                                ? null
                                : product.id
                            )
                          }
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                        >
                          <MoreVertical size={16} />
                        </button>

                        {menuId === product.id && (
                          <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">

                            <button
                              onClick={() => {
                                navigate(
                                  `/catalog/products/${product.id}/edit`
                                )
                                setMenuId(null)
                              }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Pencil size={13} />
                              Edit
                            </button>

                            <button
                              onClick={() =>
                                deleteProduct(product.id)
                              }
                              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={13} />
                              Delete
                            </button>

                          </div>
                        )}

                      </div>
                    </td>

                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-4 py-10 text-center text-gray-400"
                    >
                      No products found
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
