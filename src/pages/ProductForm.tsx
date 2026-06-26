import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { Upload, X, Loader2, ChevronLeft, Star } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────
interface Category { id: string; name: string; parent_id: string | null; display_order: number }
interface Vendor   { id: string; business_name: string; slug: string }

interface FormState {
  name: string
  slug: string
  description: string
  short_description: string
  price: string
  compare_at_price: string
  inventory_count: string
  sku: string
  category_id: string
  vendor_id: string
  status: string
  is_featured: boolean
  display_order: string
  images: string[]
}

const EMPTY: FormState = {
  name: '', slug: '', description: '', short_description: '',
  price: '', compare_at_price: '', inventory_count: '',
  sku: '', category_id: '', vendor_id: '',
  status: 'published', is_featured: false, display_order: '0', images: [],
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

// ── Hooks ─────────────────────────────────────────────────────
function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories').select('id, name, parent_id, display_order')
        .order('display_order')
      if (error) throw error
      return (data ?? []) as Category[]
    },
  })
}

function useVendors() {
  return useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors').select('id, business_name, slug')
        .eq('status', 'approved').order('business_name')
      if (error) throw error
      return (data ?? []) as Vendor[]
    },
  })
}

function useProduct(id: string) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').eq('id', id).single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

// ── Main component ─────────────────────────────────────────────
export default function ProductForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [discountInput, setDiscountInput] = useState('')  // editable discount %
  const formInit = useRef(false)

  const { data: existing } = useProduct(id ?? '')
  const { data: categories = [] } = useCategories()
  const { data: vendors = [] } = useVendors()

  // Populate form on edit — only once, prevent background refetch wiping edits
  useEffect(() => {
    if (existing && !formInit.current) {
      setForm({
        name:              existing.name ?? '',
        slug:              existing.slug ?? '',
        description:       existing.description ?? '',
        short_description: existing.short_description ?? '',
        price:             String(existing.price ?? ''),
        compare_at_price:  existing.compare_at_price ? String(existing.compare_at_price) : '',
        inventory_count:   existing.inventory_count ? String(existing.inventory_count) : '',
        sku:               existing.sku ?? '',
        category_id:       existing.category_id ?? '',
        vendor_id:         existing.vendor_id ?? '',
        status:            existing.status ?? 'published',
        is_featured:       existing.is_featured ?? false,
        display_order:     String(existing.display_order ?? 0),
        images:            existing.images ?? [],
      })
      formInit.current = true
    }
  }, [existing])

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm(f => ({ ...f, [field]: value }))

  // Image upload — uses existing vendor storage bucket policy
  const uploadImages = async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    const urls: string[] = []
    for (const file of files) {
      const ext = file.name.split('.').pop()
      // Use a placeholder vendor folder that has write access
      const folder = form.vendor_id || 'admin'
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const path = `${folder}/${filename}`
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true })
      if (upErr) {
        console.error('Upload error:', upErr.message)
        setError(`Image upload failed: ${upErr.message}`)
        continue
      }
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      urls.push(data.publicUrl)
    }
    if (urls.length) setForm(f => ({ ...f, images: [...f.images, ...urls] }))
    setUploading(false)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) =>
    uploadImages(Array.from(e.target.files ?? []))

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    uploadImages(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')))
  }

  // Save
  const saveMutation = useMutation({
    mutationFn: async () => {
      const discountPct = form.compare_at_price && parseFloat(form.compare_at_price) > 0 && parseFloat(form.price) > 0
        ? Math.round((1 - parseFloat(form.price) / parseFloat(form.compare_at_price)) * 100)
        : null

      const payload = {
        name:              form.name.trim(),
        slug:              form.slug.trim() || slugify(form.name),
        description:       form.description.trim() || null,
        short_description: form.short_description.trim() || null,
        price:             parseFloat(form.price) || 0,
        compare_at_price:  form.compare_at_price ? parseFloat(form.compare_at_price) : null,
        discount_percentage: discountPct,
        inventory_count:   form.inventory_count ? parseInt(form.inventory_count) : null,
        sku:               form.sku.trim() || null,
        category_id:       form.category_id || null,
        vendor_id:         form.vendor_id || null,
        status:            form.status,
        is_featured:       form.is_featured,
        display_order:     parseInt(form.display_order) || 0,
        images:            form.images,
        published_at:      form.status === 'published' ? new Date().toISOString() : null,
      }
      if (isEdit) {
        const { error } = await supabase.from('products').update(payload).eq('id', id!)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      navigate('/catalog/products')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Save failed'),
  })

  const handleSave = (statusOverride?: string) => {
    setError(null)
    if (!form.name.trim()) { setError('Product name is required'); return }
    if (!form.price || isNaN(parseFloat(form.price))) { setError('Valid selling price is required'); return }
    if (form.compare_at_price && parseFloat(form.price) > parseFloat(form.compare_at_price)) {
      setError('Selling price cannot be greater than the original price (MRP)'); return
    }
    if (statusOverride) setForm(f => ({ ...f, status: statusOverride }))
    saveMutation.mutate()
  }

  // Build flat list with depth prefix for display — handles unlimited nesting
  const buildFlatOptions = (
    cats: Category[],
    parentId: string | null = null,
    depth = 0
  ): { id: string; label: string }[] => {
    return cats
      .filter(c => (c.parent_id ?? null) === parentId)
      .flatMap(c => [
        { id: c.id, label: `${'  '.repeat(depth)}${depth > 0 ? '↳ ' : ''}${c.name}` },
        ...buildFlatOptions(cats, c.id, depth + 1),
      ])
  }
  const flatCategoryOptions = buildFlatOptions(categories)

  const discount = form.price && form.compare_at_price && parseFloat(form.compare_at_price) > parseFloat(form.price)
    ? Math.round((1 - parseFloat(form.price) / parseFloat(form.compare_at_price)) * 100)
    : null

  // ── Bidirectional price handlers ──────────────────────────────
  // When original price changes → recalculate selling price from current discount %
  const handleOriginalPriceChange = (val: string) => {
    set('compare_at_price', val)
    const orig = parseFloat(val)
    const pct = parseFloat(discountInput)
    if (!isNaN(orig) && orig > 0 && !isNaN(pct) && pct > 0 && pct < 100) {
      set('price', (orig * (1 - pct / 100)).toFixed(2))
    }
  }

  // When selling price changes → recalculate discount % from original
  const handleSellingPriceChange = (val: string) => {
    set('price', val)
    const orig = parseFloat(form.compare_at_price)
    const sell = parseFloat(val)
    if (!isNaN(orig) && orig > 0 && !isNaN(sell) && sell >= 0) {
      const pct = Math.max(0, Math.round((1 - sell / orig) * 100))
      setDiscountInput(pct > 0 ? String(pct) : '')
    }
  }

  // When discount % changes → recalculate selling price from original
  const handleDiscountChange = (val: string) => {
    setDiscountInput(val)
    const orig = parseFloat(form.compare_at_price)
    const pct = parseFloat(val)
    if (!isNaN(orig) && orig > 0 && !isNaN(pct) && pct >= 0 && pct <= 100) {
      set('price', (orig * (1 - pct / 100)).toFixed(2))
    }
  }

  // Sync discountInput when form loads on edit
  useEffect(() => {
    if (discount !== null && !discountInput) {
      setDiscountInput(String(discount))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discount])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/catalog/products')}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
              <ChevronLeft size={18} />
            </button>
            <div>
              <p className="text-xs text-gray-400">
                <Link to="/catalog/products" className="hover:text-gray-600">Products</Link>
                {' / '}<span className="text-gray-600">{isEdit ? 'Edit Product' : 'Add Product'}</span>
              </p>
              <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Product' : 'Add New Product'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/catalog/products')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Cancel
            </button>
            <button onClick={() => handleSave('draft')} disabled={saveMutation.isPending}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              Save as Draft
            </button>
            <button onClick={() => handleSave()} disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              {saveMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? 'Save Changes' : 'Publish Product'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto">
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left column ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Basic Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Basic Information</h2>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Product Name *</label>
                <input type="text" value={form.name}
                  onChange={e => { set('name', e.target.value); if (!isEdit) set('slug', slugify(e.target.value)) }}
                  placeholder="e.g. Brass Swastik Table Top (Teal Green)"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL Slug</label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-gray-900">
                  <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-300 whitespace-nowrap">
                    festecart.com/products/
                  </span>
                  <input type="text" value={form.slug} onChange={e => set('slug', e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm font-mono focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Short Description</label>
                <input type="text" value={form.short_description} onChange={e => set('short_description', e.target.value)}
                  placeholder="One-line summary shown on product cards"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)}
                  rows={6} placeholder="Detailed product description, materials, dimensions, care instructions…"
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
              </div>
            </div>

            {/* Images */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Product Images</h2>
              <p className="text-xs text-gray-400">First image is the main display image. Drag to upload.</p>

              {/* Upload zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <Upload size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-1">Drag & drop images here</p>
                <p className="text-xs text-gray-400 mb-3">PNG, JPG, WEBP up to 10MB each</p>
                <label className="cursor-pointer px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 inline-block">
                  {uploading ? <span className="flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Uploading…</span> : 'Choose Files'}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} disabled={uploading} />
                </label>
              </div>

              {/* Image grid */}
              {form.images.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {form.images.map((url, i) => (
                    <div key={i} className="relative group aspect-square">
                      <img src={url} alt="" className="w-full h-full rounded-lg object-cover border border-gray-200" />
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 text-xs bg-gray-900 text-white px-1.5 py-0.5 rounded text-[10px]">
                          Main
                        </span>
                      )}
                      <button onClick={() => set('images', form.images.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Pricing */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Pricing & Inventory</h2>
              <div className="grid grid-cols-3 gap-4 items-start">
                {/* Original / MRP */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Original Price / MRP (₹)
                  </label>
                  <input type="number" value={form.compare_at_price}
                    onChange={e => handleOriginalPriceChange(e.target.value)}
                    placeholder="0.00" min="0" step="0.01"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  <p className="text-xs text-gray-400 mt-0.5">Leave blank if no discount</p>
                </div>

                {/* Discount % — now editable */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Discount %
                  </label>
                  <div className="relative">
                    <input type="number" value={discountInput}
                      onChange={e => handleDiscountChange(e.target.value)}
                      placeholder="0" min="0" max="100" step="1"
                      disabled={!form.compare_at_price || parseFloat(form.compare_at_price) <= 0}
                      className={`w-full px-3 py-2.5 pr-8 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 ${
                        discount !== null
                          ? 'border-green-400 bg-green-50 text-green-800 font-medium'
                          : 'border-gray-300'
                      } disabled:bg-gray-50 disabled:text-gray-400`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {!form.compare_at_price ? 'Set Original Price first' : 'Updates selling price'}
                  </p>
                </div>

                {/* Selling Price */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Selling Price (₹) *
                  </label>
                  <input type="number" value={form.price}
                    onChange={e => handleSellingPriceChange(e.target.value)}
                    placeholder="0.00" min="0" step="0.01"
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 ${
                      form.compare_at_price && form.price &&
                      parseFloat(form.price) > parseFloat(form.compare_at_price)
                        ? 'border-red-400 bg-red-50'
                        : 'border-gray-300'
                    }`} />
                  {form.compare_at_price && form.price &&
                    parseFloat(form.price) > parseFloat(form.compare_at_price) ? (
                    <p className="text-xs text-red-500 mt-0.5">Cannot exceed original price</p>
                  ) : (
                    <p className="text-xs text-gray-400 mt-0.5">Final price customer pays</p>
                  )}
                </div>
              </div>

              {/* Savings badge */}
              {discount !== null && discount > 0 && (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg text-sm">
                  <span className="font-bold text-green-700 text-base">{discount}% off</span>
                  <span className="text-green-600">
                    Customer saves {formatCurrency(parseFloat(form.compare_at_price) - parseFloat(form.price))}
                  </span>
                  <span className="ml-auto text-xs text-green-500">
                    ₹{parseFloat(form.compare_at_price).toFixed(2)} → ₹{parseFloat(form.price).toFixed(2)}
                  </span>
                </div>
              )}

              {/* SKU + Stock on second row */}
              <div className="grid grid-cols-2 gap-4 pt-1 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">SKU</label>
                  <input type="text" value={form.sku} onChange={e => set('sku', e.target.value)}
                    placeholder="e.g. BST2"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Stock Count</label>
                  <input type="number" value={form.inventory_count} onChange={e => set('inventory_count', e.target.value)}
                    placeholder="0" min="0"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="space-y-5">

            {/* Status */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900 text-sm">Publication</h2>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="published">Published — visible on store</option>
                <option value="draft">Draft — hidden from store</option>
                <option value="pending">Pending Review</option>
              </select>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Featured Product</p>
                  <p className="text-xs text-gray-400">Show in featured sections</p>
                </div>
                <button type="button" onClick={() => set('is_featured', !form.is_featured)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_featured ? 'bg-gray-900' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_featured ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {form.is_featured && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <Star size={11} /> This product will appear in featured sections
                </p>
              )}

              <div className="border-t border-gray-100 pt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Display Order / Priority
                </label>
                <input
                  type="number"
                  value={form.display_order}
                  onChange={e => set('display_order', e.target.value)}
                  min="0"
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Lower number = shown first. 0 = default order (by date).
                </p>
              </div>
            </div>

            {/* Category */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 text-sm">Category</h2>
              <select value={form.category_id} onChange={e => set('category_id', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">— Select Category —</option>
                {flatCategoryOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Vendor */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 text-sm">Vendor <span className="text-gray-400 font-normal">(optional)</span></h2>
              <select value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">— Select Vendor —</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.business_name}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400">Leave blank for admin-owned products</p>
            </div>

            {/* Live preview summary */}
            {(form.name || form.price) && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2 text-xs">
                <p className="font-semibold text-gray-700 mb-2">Quick Preview</p>
                {form.images[0] && (
                  <img src={form.images[0]} alt="" className="w-full aspect-square object-cover rounded-lg mb-3" />
                )}
                <p className="font-medium text-gray-900 text-sm leading-snug">{form.name || '—'}</p>
                {form.price && (
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">{formatCurrency(parseFloat(form.price))}</span>
                    {form.compare_at_price && parseFloat(form.compare_at_price) > parseFloat(form.price) && (
                      <span className="text-gray-400 line-through text-xs">{formatCurrency(parseFloat(form.compare_at_price))}</span>
                    )}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${form.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {form.status}
                  </span>
                  {form.is_featured && <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Featured</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
