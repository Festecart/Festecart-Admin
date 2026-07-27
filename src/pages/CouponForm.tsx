import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Save, ChevronDown, ChevronRight, Check } from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { db, collection, getDocs, query, orderBy } from '@/lib/firebase'
import {
  useCoupon,
  useCreateCoupon,
  useUpdateCoupon,
  type CreateCouponPayload,
} from '@/hooks/useCoupons'
import type { CouponType } from '@/types/coupon'

// ── Types ─────────────────────────────────────────────────────────

const COUPON_TYPES: { value: CouponType; label: string }[] = [
  { value: 'flat',              label: 'Flat (₹ off)' },
  { value: 'percentage',        label: 'Percentage (% off)' },
  { value: 'shipping_discount', label: 'Shipping Discount' },
  { value: 'free_shipping',     label: 'Free Shipping' },
]

interface Category { id: string; name: string; parent_id: string | null; is_active: boolean }
interface CategoryNode extends Category { children: CategoryNode[] }
interface Product { id: string; name: string; category_id: string | null; status: string; images: string[] }

type ApplicableMode = 'all_orders' | 'categories' | 'products'

function toDateInput(ts: Timestamp | undefined): string {
  if (!ts) return ''
  return ts.toDate().toISOString().slice(0, 10)
}

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

// ── Build category tree ───────────────────────────────────────────

function buildTree(flat: Category[]): CategoryNode[] {
  const map: Record<string, CategoryNode> = {}
  const roots: CategoryNode[] = []
  for (const c of flat) map[c.id] = { ...c, children: [] }
  for (const c of flat) {
    if (c.parent_id && map[c.parent_id]) map[c.parent_id].children.push(map[c.id])
    else roots.push(map[c.id])
  }
  return roots
}

// ── Collect all product IDs under a category node (recursively) ──

function collectProductIds(node: CategoryNode, products: Product[]): string[] {
  const direct = products
    .filter(p => p.category_id === node.id && p.status === 'published')
    .map(p => p.id)
  const fromChildren = node.children.flatMap(child => collectProductIds(child, products))
  return [...direct, ...fromChildren]
}

function collectCategoryIds(node: CategoryNode): string[] {
  return [node.id, ...node.children.flatMap(collectCategoryIds)]
}

// ── Tree Picker ───────────────────────────────────────────────────

function CategoryTreeNode({
  node, depth, mode, selectedIds, onToggleCat, onToggleProduct, products, expandedIds, onExpand,
}: {
  node: CategoryNode
  depth: number
  mode: ApplicableMode
  selectedIds: Set<string>
  onToggleCat: (node: CategoryNode) => void
  onToggleProduct: (id: string) => void
  products: Product[]
  expandedIds: Set<string>
  onExpand: (id: string) => void
}) {
  const catProducts = products.filter(p => p.category_id === node.id && p.status === 'published')
  const hasChildren = node.children.length > 0 || catProducts.length > 0
  const isExpanded = expandedIds.has(node.id)

  // For category mode: check if this category (or all its descendants) is selected
  const isCatSelected = mode === 'categories' && selectedIds.has(node.id)

  // For product mode: check if all direct products + child categories products are selected
  const allProductIds = mode === 'products' ? collectProductIds(node, products) : []
  const allChecked = mode === 'products' && allProductIds.length > 0 && allProductIds.every(id => selectedIds.has(id))
  const someChecked = mode === 'products' && allProductIds.length > 0 && allProductIds.some(id => selectedIds.has(id)) && !allChecked

  return (
    <div>
      {/* Category row */}
      <div
        className="flex items-center gap-2 py-2 hover:bg-gray-50 rounded-lg"
        style={{ paddingLeft: `${12 + depth * 20}px`, paddingRight: 12 }}
      >
        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => onExpand(node.id)}
          className={`shrink-0 text-gray-400 hover:text-gray-700 ${!hasChildren ? 'invisible' : ''}`}
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Checkbox */}
        {(mode === 'categories' || mode === 'products') && (
          <button
            type="button"
            onClick={() => mode === 'categories' ? onToggleCat(node) : onToggleCat(node)}
            className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
              (isCatSelected || allChecked)
                ? 'bg-gray-900 border-gray-900'
                : someChecked
                ? 'bg-gray-400 border-gray-400'   // indeterminate
                : 'border-gray-300 hover:border-gray-500'
            }`}
          >
            {(isCatSelected || allChecked) && <Check size={10} className="text-white" />}
            {someChecked && <span className="w-2 h-0.5 bg-white rounded" />}
          </button>
        )}

        {/* Category name — clicking also toggles */}
        <span
          className="text-sm font-semibold text-gray-800 flex-1 cursor-pointer"
          onClick={() => (mode === 'categories' || mode === 'products') && onToggleCat(node)}
        >
          📁 {node.name}
        </span>

        {mode === 'products' && allProductIds.length > 0 && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
            {allProductIds.filter(id => selectedIds.has(id)).length}/{allProductIds.length}
          </span>
        )}
        {mode === 'categories' && (
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">
            {catProducts.length} products
          </span>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div>
          {/* Sub-categories */}
          {node.children.map(child => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              mode={mode}
              selectedIds={selectedIds}
              onToggleCat={onToggleCat}
              onToggleProduct={onToggleProduct}
              products={products}
              expandedIds={expandedIds}
              onExpand={onExpand}
            />
          ))}

          {/* Individual products — only in product mode */}
          {mode === 'products' && catProducts.map(product => (
            <div
              key={product.id}
              className="flex items-center gap-2 py-1.5 hover:bg-gray-50 rounded-lg cursor-pointer"
              style={{ paddingLeft: `${12 + (depth + 1) * 20 + 6}px`, paddingRight: 12 }}
              onClick={() => onToggleProduct(product.id)}
            >
              <button
                type="button"
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selectedIds.has(product.id)
                    ? 'bg-gray-900 border-gray-900'
                    : 'border-gray-300 hover:border-gray-500'
                }`}
              >
                {selectedIds.has(product.id) && <Check size={10} className="text-white" />}
              </button>
              <div className="w-7 h-7 rounded overflow-hidden bg-gray-100 shrink-0">
                {product.images?.[0]
                  ? <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">—</div>
                }
              </div>
              <span className="text-sm text-gray-700 flex-1 truncate">{product.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Form ─────────────────────────────────────────────────────

export default function CouponForm() {
  const navigate = useNavigate()
  const { id }   = useParams<{ id: string }>()
  const isEdit   = !!id

  const { data: existing, isLoading: loadingExisting } = useCoupon(id)
  const createMutation = useCreateCoupon()
  const updateMutation = useUpdateCoupon()

  // Fetch categories + products for the tree
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'categories'), orderBy('display_order', 'asc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))
    },
  })
  const { data: products = [] } = useQuery({
    queryKey: ['admin-products', 'published'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'products'), orderBy('display_order', 'asc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Product))
    },
  })

  const categoryTree = buildTree(categories)

  // ── Form state ─────────────────────────────────────────────────
  const [code,            setCode]            = useState('')
  const [type,            setType]            = useState<CouponType>('flat')
  const [value,           setValue]           = useState('')
  const [minCartAmount,   setMinCartAmount]   = useState('')
  const [maxDiscount,     setMaxDiscount]     = useState('')
  const [totalUsageLimit, setTotalUsageLimit] = useState('')
  const [perUserLimit,    setPerUserLimit]    = useState('')
  const [validFrom,       setValidFrom]       = useState('')
  const [validTo,         setValidTo]         = useState('')
  const [termsConditions, setTermsConditions] = useState('')
  const [isActive,        setIsActive]        = useState(true)
  const [error,           setError]           = useState<string | null>(null)

  // Applicable For state
  const [applicableMode,    setApplicableMode]    = useState<ApplicableMode>('all_orders')
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set())
  const [expandedIds,       setExpandedIds]       = useState<Set<string>>(new Set())

  // Populate on edit
  useEffect(() => {
    if (existing) {
      setCode(existing.code)
      setType(existing.type)
      setValue(existing.value === 0 ? '' : String(existing.value))
      setMinCartAmount(existing.min_cart_amount === 0 ? '' : String(existing.min_cart_amount))
      setMaxDiscount(existing.max_discount != null ? String(existing.max_discount) : '')
      setTotalUsageLimit(existing.total_usage_limit != null ? String(existing.total_usage_limit) : '')
      setPerUserLimit(existing.per_user_limit != null ? String(existing.per_user_limit) : '')
      setValidFrom(toDateInput(existing.valid_from))
      setValidTo(toDateInput(existing.valid_to))
      setTermsConditions(existing.terms_conditions ?? '')
      setIsActive(existing.is_active)

      // Restore applicable_for
      const af = (existing as any).applicable_for
      if (af && typeof af === 'object') {
        setApplicableMode(af.type as ApplicableMode)
        setSelectedIds(new Set(af.ids ?? []))
      } else {
        setApplicableMode('all_orders')
        setSelectedIds(new Set())
      }
    }
  }, [existing])

  const isMutating = createMutation.isPending || updateMutation.isPending

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Toggle a category node — selects/deselects all items inside it
  const toggleCatNode = (node: CategoryNode) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (applicableMode === 'categories') {
        // Select/deselect this category + all descendant categories
        const ids = collectCategoryIds(node)
        const allSelected = ids.every(id => next.has(id))
        ids.forEach(id => allSelected ? next.delete(id) : next.add(id))
      } else if (applicableMode === 'products') {
        // Select/deselect all products inside this category (recursively)
        const ids = collectProductIds(node, products)
        if (ids.length === 0) return prev
        const allSelected = ids.every(id => next.has(id))
        ids.forEach(id => allSelected ? next.delete(id) : next.add(id))
      }
      return next
    })
    // Auto-expand the node when selecting
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.add(node.id)
      return next
    })
  }

  const toggleProductId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) { setError('Coupon code is required'); return }
    if (!validFrom)       { setError('Valid from date is required'); return }
    if (!validTo)         { setError('Valid to date is required'); return }
    if (new Date(validTo) < new Date(validFrom)) { setError('"Valid to" must be after "Valid from"'); return }
    if (type !== 'free_shipping' && !value) { setError('Discount value is required'); return }
    if (applicableMode !== 'all_orders' && selectedIds.size === 0) {
      setError(`Please select at least one ${applicableMode === 'categories' ? 'category' : 'product'}`); return
    }

    const applicableFor = applicableMode === 'all_orders'
      ? 'all_orders'
      : { type: applicableMode, ids: Array.from(selectedIds) }

    const payload: CreateCouponPayload = {
      code:               normalizedCode,
      type,
      value:              type === 'free_shipping' ? 0 : Number(value),
      min_cart_amount:    minCartAmount ? Number(minCartAmount) : 0,
      max_discount:       (type === 'percentage' && maxDiscount) ? Number(maxDiscount) : null,
      total_usage_limit:  totalUsageLimit ? Number(totalUsageLimit) : null,
      per_user_limit:     perUserLimit ? Number(perUserLimit) : null,
      applicable_for:     applicableFor as any,
      terms_conditions:   termsConditions.trim() || null,
      valid_from:         new Date(validFrom),
      valid_to:           new Date(validTo + 'T23:59:59'),
      is_active:          isActive,
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: id!, ...payload })
      } else {
        await createMutation.mutateAsync(payload)
      }
      navigate('/coupons')
    } catch (err: any) {
      setError(err.message ?? 'Failed to save coupon')
    }
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={28} className="animate-spin text-gray-400" />
      </div>
    )
  }

  const selectedLabel = applicableMode === 'all_orders'
    ? 'All Orders'
    : applicableMode === 'categories'
    ? `${selectedIds.size} categor${selectedIds.size === 1 ? 'y' : 'ies'} selected`
    : `${selectedIds.size} product${selectedIds.size === 1 ? '' : 's'} selected`

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button type="button" onClick={() => navigate('/coupons')}
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEdit ? 'Edit Coupon' : 'Add Coupon'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isEdit ? `Editing: ${existing?.code ?? ''}` : 'Create a new discount coupon'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">

        {/* Code */}
        <Field label="Coupon Code" required>
          <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. SUMMER20" disabled={isEdit}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono uppercase disabled:bg-gray-50 disabled:text-gray-400" />
          {isEdit && <p className="text-xs text-gray-400 mt-1">Code cannot be changed after creation.</p>}
        </Field>

        {/* Type */}
        <Field label="Offer Type" required>
          <select value={type} onChange={e => setType(e.target.value as CouponType)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
            {COUPON_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        {/* Value */}
        {type !== 'free_shipping' && (
          <Field
            label={type === 'percentage' ? 'Discount Percentage' : 'Discount Amount (₹)'}
            required
            hint={type === 'percentage' ? 'Enter 10 for 10% off' : 'Enter flat amount in rupees'}
          >
            <input type="number" min="0" step="1" value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={type === 'percentage' ? 'e.g. 10' : 'e.g. 100'}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </Field>
        )}

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Minimum Cart Amount (₹)" hint="Leave blank for no minimum">
            <input type="number" min="0" value={minCartAmount} onChange={e => setMinCartAmount(e.target.value)}
              placeholder="e.g. 500"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </Field>
          {type === 'percentage' && (
            <Field label="Maximum Discount (₹)" hint="Cap on discount. Leave blank for no cap">
              <input type="number" min="0" value={maxDiscount} onChange={e => setMaxDiscount(e.target.value)}
                placeholder="e.g. 500"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </Field>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Total Usage Limit" hint="Leave blank for unlimited">
            <input type="number" min="1" value={totalUsageLimit} onChange={e => setTotalUsageLimit(e.target.value)}
              placeholder="e.g. 100"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </Field>
          <Field label="Usage Limit Per User" hint="Leave blank for unlimited">
            <input type="number" min="1" value={perUserLimit} onChange={e => setPerUserLimit(e.target.value)}
              placeholder="e.g. 1"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Valid From" required>
            <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </Field>
          <Field label="Valid To" required>
            <input type="date" value={validTo} min={validFrom || undefined} onChange={e => setValidTo(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </Field>
        </div>

        {/* ── Applicable For — tree picker ── */}
        <Field label="Applicable For" required>
          {/* Mode selector */}
          <div className="flex gap-2 mb-3">
            {([
              { value: 'all_orders',  label: 'All Orders' },
              { value: 'categories',  label: 'By Category' },
              { value: 'products',    label: 'By Product' },
            ] as { value: ApplicableMode; label: string }[]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setApplicableMode(opt.value); setSelectedIds(new Set()) }}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                  applicableMode === opt.value
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Summary badge */}
          {applicableMode !== 'all_orders' && (
            <p className="text-xs text-gray-500 mb-2">
              {selectedLabel}
              {selectedIds.size > 0 && (
                <button type="button" onClick={() => setSelectedIds(new Set())}
                  className="ml-2 text-red-500 hover:text-red-700 underline">Clear all</button>
              )}
            </p>
          )}

          {/* Tree */}
          {applicableMode !== 'all_orders' && (
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto bg-white">
              {/* Expand/collapse all */}
              <div className="flex items-center gap-3 px-3 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <button type="button" onClick={() => setExpandedIds(new Set(categories.map(c => c.id)))}
                  className="hover:text-gray-800 underline">Expand all</button>
                <button type="button" onClick={() => setExpandedIds(new Set())}
                  className="hover:text-gray-800 underline">Collapse all</button>
                {applicableMode === 'categories' && (
                  <>
                    <button type="button"
                      onClick={() => setSelectedIds(new Set(categories.map(c => c.id)))}
                      className="hover:text-gray-800 underline ml-auto">Select all</button>
                  </>
                )}
                {applicableMode === 'products' && (
                  <button type="button"
                    onClick={() => setSelectedIds(new Set(products.filter(p => p.status === 'published').map(p => p.id)))}
                    className="hover:text-gray-800 underline ml-auto">Select all</button>
                )}
              </div>

              {/* Category tree */}
              <div className="p-1">
                {categoryTree.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No categories found</p>
                ) : (
                  categoryTree.map(node => (
                    <CategoryTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      mode={applicableMode}
                      selectedIds={selectedIds}
                      onToggleCat={toggleCatNode}
                      onToggleProduct={toggleProductId}
                      products={products}
                      expandedIds={expandedIds}
                      onExpand={toggleExpand}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </Field>

        {/* Terms & Conditions */}
        <Field label="Terms & Conditions" hint="Optional — shown to customers at checkout">
          <textarea rows={3} value={termsConditions} onChange={e => setTermsConditions(e.target.value)}
            placeholder="e.g. Valid on orders above ₹500. One use per customer."
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </Field>

        {/* Active toggle */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setIsActive(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-sm text-gray-700 font-medium">
            {isActive ? 'Active — coupon is live' : 'Inactive — coupon is disabled'}
          </span>
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button type="submit" disabled={isMutating}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
            {isMutating
              ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : <><Save size={14} /> {isEdit ? 'Update Coupon' : 'Create Coupon'}</>
            }
          </button>
          <button type="button" onClick={() => navigate('/coupons')} disabled={isMutating}
            className="px-5 py-2.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
