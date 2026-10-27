import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft, Loader2, Save, ChevronDown, ChevronRight, Check, Copy,
  UserPlus, ShieldCheck,
} from 'lucide-react'
import { Timestamp } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
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
  const [codeCopied,      setCodeCopied]      = useState(false)
  const [copyError,       setCopyError]       = useState<string | null>(null)
  const [affiliateEnabled, setAffiliateEnabled] = useState(false)
  const [affiliateName, setAffiliateName] = useState('')
  const [affiliateEmail, setAffiliateEmail] = useState('')
  const [affiliatePassword, setAffiliatePassword] = useState('')
  const [affiliatePhone, setAffiliatePhone] = useState('')
  const [commissionType, setCommissionType] = useState<'flat' | 'percentage'>('flat')
  const [commissionValue, setCommissionValue] = useState('')

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

  const handleCopyCode = async () => {
    setCopyError(null)
    setCodeCopied(false)

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = code
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        let copied = false
        try {
          textarea.select()
          copied = document.execCommand('copy')
        } finally {
          document.body.removeChild(textarea)
        }
        if (!copied) throw new Error('Clipboard access is unavailable.')
      }
      setCodeCopied(true)
    } catch (copyFailure) {
      setCopyError(copyFailure instanceof Error ? copyFailure.message : 'Clipboard access is unavailable.')
    }
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
    if (affiliateEnabled) {
      if (!affiliateName.trim() || !affiliatePhone.trim() || !affiliateEmail.trim()) {
        setError('Complete all affiliate details before creating the coupon.')
        return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(affiliateEmail.trim())) {
        setError('Enter a valid affiliate email address.')
        return
      }
      if (affiliatePassword.length < 8) {
        setError('Affiliate password must be at least 8 characters.')
        return
      }
      const commission = Number(commissionValue)
      if (!Number.isFinite(commission) || commission <= 0 ||
          (commissionType === 'percentage' && commission > 100)) {
        setError(commissionType === 'percentage'
          ? 'Percentage commission must be greater than 0 and no more than 100.'
          : 'Flat commission must be greater than 0.')
        return
      }
    }

    const applicableFor: CreateCouponPayload['applicable_for'] = applicableMode === 'all_orders'
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
      applicable_for:     applicableFor,
      terms_conditions:   termsConditions.trim() || null,
      valid_from:         new Date(validFrom),
      valid_to:           new Date(validTo + 'T23:59:59'),
      is_active:          isActive,
    }

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: id!, ...payload })
      } else {
        await createMutation.mutateAsync({
          coupon: payload,
          affiliate: affiliateEnabled ? {
            name: affiliateName.trim(),
            email: affiliateEmail.trim().toLowerCase(),
            password: affiliatePassword,
            phone: affiliatePhone.trim(),
            commission_type: commissionType,
            commission_value: Number(commissionValue),
          } : undefined,
        })
      }
      navigate('/coupons')
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        const details = err.customData?.details
        const diagnostic = typeof details === 'object' && details !== null && !Array.isArray(details)
          ? details as Record<string, unknown>
          : null
        const operation = typeof diagnostic?.operation === 'string'
          ? diagnostic.operation.replace(/-/g, ' ')
          : null
        const causeCode = typeof diagnostic?.causeCode === 'string'
          ? diagnostic.causeCode
          : null

        if (err.code === 'functions/not-found') {
          setError('Affiliate coupon creation is not available because the createAffiliateCoupon Cloud Function is not deployed. Ask a Firebase project owner to deploy it.')
        } else if (err.code === 'functions/internal') {
          console.error('[CouponForm] Affiliate coupon callable failed:', {
            code: err.code,
            message: err.message,
            details: err.customData,
          })
          setError([
            'Affiliate coupon creation failed in the server function.',
            operation ? `Failed during: ${operation}.` : '',
            causeCode ? `Server error code: ${causeCode}.` : '',
            !operation && !causeCode
              ? 'The function may not be deployed or may be unavailable. Ask a Firebase project owner to deploy createAffiliateCoupon and check its Cloud Functions logs.'
              : '',
          ].filter(Boolean).join(' '))
        } else {
          setError(err.message)
        }
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save coupon')
      }
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
    <div className="p-6">
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

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className={isEdit ? '' : 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]'}>
        <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">

        {/* Code */}
        <Field label="Coupon Code" required>
          <div className="flex items-stretch gap-2">
            <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER20" disabled={isEdit}
              className="min-w-0 flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono uppercase disabled:bg-gray-50 disabled:text-gray-400" />
            {isEdit && (
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                aria-label={codeCopied ? 'Coupon code copied' : 'Copy coupon code'}
                title={codeCopied ? 'Coupon code copied' : 'Copy coupon code'}
                className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 ${
                  codeCopied
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {codeCopied ? <Check size={16} /> : <Copy size={16} />}
                <span>{codeCopied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>
          {copyError && <p role="alert" className="text-xs text-red-600">Copy failed: {copyError}</p>}
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
        </section>

        {!isEdit && (
          <aside className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gradient-to-r from-violet-50 via-white to-indigo-50 px-5 py-5">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><UserPlus size={20} /></span>
                <div>
                  <h2 className="font-semibold text-gray-900">Affiliate</h2>
                  <p className="mt-1 text-sm text-gray-500">Optionally create an affiliate login and link it to this coupon.</p>
                </div>
              </div>
              <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-lg border border-violet-100 bg-white/80 p-3">
                <input type="checkbox" checked={affiliateEnabled}
                  onChange={event => {
                    setAffiliateEnabled(event.target.checked)
                    setError(null)
                  }}
                  className="h-4 w-4 rounded border-gray-300 accent-violet-700" />
                <span className="text-sm font-medium text-gray-800">Create an affiliate account with this coupon</span>
              </label>
            </div>

            {affiliateEnabled ? (
              <div className="space-y-4 p-5">
                <Field label="Name" required>
                  <input value={affiliateName} onChange={event => setAffiliateName(event.target.value)}
                    autoComplete="name" maxLength={120} required placeholder="Affiliate full name"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                </Field>
                <Field label="Email" required>
                  <input type="email" value={affiliateEmail} onChange={event => setAffiliateEmail(event.target.value)}
                    autoComplete="email" required placeholder="affiliate@example.com"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                </Field>
                <Field label="Password" required hint="At least 8 characters. The password is used once to create their sign-in and is never saved in Firestore.">
                  <input type="password" value={affiliatePassword} onChange={event => setAffiliatePassword(event.target.value)}
                    autoComplete="new-password" minLength={8} maxLength={128} required placeholder="Create a secure password"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                </Field>
                <Field label="Phone Number" required>
                  <input type="tel" value={affiliatePhone} onChange={event => setAffiliatePhone(event.target.value)}
                    autoComplete="tel" maxLength={40} required placeholder="Affiliate contact number"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                </Field>
                <Field label="Commission" required hint={commissionType === 'flat'
                  ? 'Paid once per eligible order, regardless of item quantities. Example: ₹50 commission for an order with 1 or 10 units.'
                  : 'Percentage of product subtotal; shipping is excluded.'}>
                  <div className="flex gap-2">
                    <select value={commissionType} onChange={event => setCommissionType(event.target.value as 'flat' | 'percentage')}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100">
                      <option value="flat">Flat ₹ / order</option>
                      <option value="percentage">Percentage %</option>
                    </select>
                    <input type="number" min="0.01" max={commissionType === 'percentage' ? 100 : undefined}
                      step="0.01" value={commissionValue} onChange={event => setCommissionValue(event.target.value)}
                      required placeholder={commissionType === 'flat' ? 'e.g. 50' : 'e.g. 5'}
                      className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
                  </div>
                </Field>
                <div className="flex items-start gap-2 rounded-lg bg-violet-50 p-3 text-xs leading-5 text-violet-800">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                  <p>The affiliate account is securely created with this coupon. Commission is recalculated from order items, and cancelled orders are excluded.</p>
                </div>
              </div>
            ) : (
              <p className="px-5 py-4 text-sm text-gray-500">Leave this off to create a standard coupon without an affiliate account.</p>
            )}
          </aside>
        )}
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
