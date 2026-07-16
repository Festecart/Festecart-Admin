import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  db, storage, collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc,
  query, orderBy, where, Timestamp,
} from '@/lib/firebase'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { formatCurrency } from '@/lib/utils'
import { Upload, X, Loader2, ChevronLeft, Star } from 'lucide-react'
import CategoryTreeSelect from '@/components/CategoryTreeSelect'

interface Category { id: string; name: string; parent_id: string | null; display_order: number }
interface Vendor   { id: string; business_name: string; slug: string }

interface FormState {
  name: string; slug: string; description: string; short_description: string
  price: string; compare_at_price: string; sku: string
  category_id: string; vendor_id: string; status: string
  is_featured: boolean; display_order: string; images: string[]
  // Inventory
  inventory_tracking: 'none' | 'track'
  inventory_count: string
  allow_backorder: boolean
  low_stock_notification: boolean
  low_stock_threshold: string
  restrict_qty_per_user: boolean
  max_qty_per_user: string
  low_stock_message: string
}

const EMPTY: FormState = {
  name: '', slug: '', description: '', short_description: '',
  price: '', compare_at_price: '', sku: '',
  category_id: '', vendor_id: '', status: 'published', is_featured: false, display_order: '0', images: [],
  inventory_tracking: 'none',
  inventory_count: '',
  allow_backorder: false,
  low_stock_notification: false,
  low_stock_threshold: '',
  restrict_qty_per_user: false,
  max_qty_per_user: '',
  low_stock_message: '',
}

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }

export default function ProductForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [uploading, setUploading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [isDirty, setIsDirty] = useState(false) // true once user edits anything
  const lastLoadedId = useRef<string | undefined>(undefined)

  const { data: existing } = useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'products', id!))
      if (!snap.exists()) return null
      return { id: snap.id, ...snap.data() }
    },
    enabled: !!id,
    staleTime: 0,        // always fetch fresh
    refetchOnMount: true,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'categories'), orderBy('display_order', 'asc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Category))
    },
  })

  const { data: vendors = [] } = useQuery({
    queryKey: ['vendors-list'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'vendors'), where('status', '==', 'approved'), orderBy('business_name', 'asc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor))
    },
  })

  useEffect(() => {
    if (!existing) return
    const d = existing as Record<string, unknown>
    const incomingId = d.id as string

    // Always populate on first load or product switch; skip if user has unsaved edits
    if (incomingId !== lastLoadedId.current || !isDirty) {
      lastLoadedId.current = incomingId
      setIsDirty(false)
      setForm({
        name:              String(d.name ?? ''),
        slug:              String(d.slug ?? ''),
        description:       String(d.description ?? ''),
        short_description: String(d.short_description ?? ''),
        price:             String(d.price ?? ''),
        compare_at_price:  d.compare_at_price ? String(d.compare_at_price) : '',
        sku:               String(d.sku ?? ''),
        category_id:       String(d.category_id ?? ''),
        vendor_id:         String(d.vendor_id  ?? ''),
        status:            String(d.status ?? 'published'),
        is_featured:       Boolean(d.is_featured),
        display_order:     String(d.display_order ?? 0),
        images:            (d.images as string[]) ?? [],
        inventory_tracking:     (d.inventory_count != null || d.inventory_tracking === 'track') ? 'track' : 'none',
        inventory_count:        d.inventory_count != null ? String(d.inventory_count) : '',
        allow_backorder:        Boolean(d.allow_backorder),
        low_stock_notification: Boolean(d.low_stock_notification),
        low_stock_threshold:    d.low_stock_threshold != null ? String(d.low_stock_threshold) : '',
        restrict_qty_per_user:  Boolean(d.restrict_qty_per_user),
        max_qty_per_user:       d.max_qty_per_user != null ? String(d.max_qty_per_user) : '',
        low_stock_message:      String(d.low_stock_message ?? ''),
      })
    }
  }, [existing])

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setIsDirty(true)
    setForm(f => ({ ...f, [field]: value }))
  }

  // ── Upload images to Firebase Storage ─────────────────────────────
  const uploadImages = async (files: File[]) => {
    if (!files.length) return
    setImageError(null)

    // Validate sizes before uploading
    const oversized = files.filter(f => f.size > 2 * 1024 * 1024)
    if (oversized.length > 0) {
      setImageError(`${oversized.map(f => f.name).join(', ')} ${oversized.length > 1 ? 'are' : 'is'} too large. Max size is 2 MB per image.`)
      return
    }

    setUploading(true)
    const urls: string[] = []
    for (const file of files) {
      const ext      = file.name.split('.').pop()
      const folder   = form.vendor_id || 'admin'
      const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const path     = `product-images/${folder}/${filename}`
      const storageRef = ref(storage, path)
      try {
        await uploadBytes(storageRef, file)
        const url = await getDownloadURL(storageRef)
        urls.push(url)
      } catch (e) {
        setImageError(`Upload failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (urls.length) setForm(f => ({ ...f, images: [...f.images, ...urls] }))
    setUploading(false)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) =>
    uploadImages(Array.from(e.target.files ?? []))

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    uploadImages(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')))
  }

  const removeImage = async (url: string, idx: number) => {
    set('images', form.images.filter((_, i) => i !== idx))
    try {
      // Firebase Storage URL: extract path after /o/ and before ?
      const match = url.match(/\/o\/(.+?)\?/)
      if (match) {
        const path = decodeURIComponent(match[1])
        await deleteObject(ref(storage, path))
      }
    } catch { /* non-critical */ }
  }

  // ── Save ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      const tracking = form.inventory_tracking === 'track'
      const payload = {
        name:              form.name.trim(),
        slug:              form.slug.trim() || slugify(form.name),
        description:       form.description.trim()       || null,
        short_description: form.short_description.trim() || null,
        price:             parseFloat(form.price) || 0,
        compare_at_price:  form.compare_at_price ? parseFloat(form.compare_at_price) : null,
        sku:               form.sku.trim() || null,
        category_id:       form.category_id || null,
        vendor_id:         form.vendor_id   || null,
        status:            form.status,
        is_featured:       form.is_featured,
        display_order:     parseInt(form.display_order) || 0,
        images:            form.images,
        // Inventory
        inventory_tracking:     form.inventory_tracking,
        inventory_count:        tracking && form.inventory_count ? parseInt(form.inventory_count) : null,
        allow_backorder:        tracking ? form.allow_backorder : false,
        low_stock_notification: tracking ? form.low_stock_notification : false,
        low_stock_threshold:    tracking && form.low_stock_notification && form.low_stock_threshold
                                  ? parseInt(form.low_stock_threshold) : null,
        restrict_qty_per_user:  tracking ? form.restrict_qty_per_user : false,
        max_qty_per_user:       tracking && form.restrict_qty_per_user && form.max_qty_per_user
                                  ? parseInt(form.max_qty_per_user) : null,
        low_stock_message:      tracking && form.low_stock_message.trim()
                                  ? form.low_stock_message.trim() : null,
        updated_at: Timestamp.now(),
      }

      let savedId = id
      if (isEdit) {
        await updateDoc(doc(db, 'products', id!), payload)
      } else {
        const newRef = await addDoc(collection(db, 'products'), {
          ...payload,
          published_at: form.status === 'published' ? Timestamp.now() : null,
          view_count: 0,
          created_at: Timestamp.now(),
        })
        savedId = newRef.id
      }

      // Sync is_featured → site_config featured_products
      if (savedId) {
        const cfgSnap = await getDoc(doc(db, 'site_config', 'featured_products'))
        const current = (cfgSnap.exists() ? cfgSnap.data()?.value : null) as { product_ids?: string[] } | null
        const ids: string[] = current?.product_ids ?? []
        const newIds = form.is_featured
          ? ids.includes(savedId) ? ids : [...ids, savedId]
          : ids.filter(x => x !== savedId)
        if (JSON.stringify(newIds) !== JSON.stringify(ids)) {
          await setDoc(doc(db, 'site_config', 'featured_products'),
            { value: { ...(current ?? {}), product_ids: newIds }, updated_at: Timestamp.now() },
            { merge: true })
        }
      }
    },
    onSuccess: () => {
      setIsDirty(false)
      lastLoadedId.current = undefined // force re-init on next fetch
      qc.invalidateQueries({ queryKey: ['admin-products'] })
      qc.invalidateQueries({ queryKey: ['site_config', 'featured_products'] })
      navigate('/catalog/products')
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Save failed'),
  })

  const handleSave = (statusOverride?: string) => {
    setError(null)
    if (!form.name.trim()) { setError('Product name is required'); return }
    if (!form.price || isNaN(parseFloat(form.price))) { setError('Valid selling price is required'); return }
    if (form.compare_at_price && parseFloat(form.price) > parseFloat(form.compare_at_price)) {
      setError('Selling price cannot be greater than original price'); return
    }
    if (form.inventory_tracking === 'track' && form.low_stock_notification &&
        form.low_stock_threshold && form.inventory_count &&
        parseInt(form.low_stock_threshold) > parseInt(form.inventory_count)) {
      setError('Stock value must be less than or equal to quantity'); return
    }
    if (statusOverride) setForm(f => ({ ...f, status: statusOverride }))
    saveMutation.mutate()
  }


  const discount = form.price && form.compare_at_price && parseFloat(form.compare_at_price) > parseFloat(form.price)
    ? Math.round((1 - parseFloat(form.price) / parseFloat(form.compare_at_price)) * 100) : null

  const handleOriginalPriceChange = (val: string) => {
    set('compare_at_price', val)
    const orig = parseFloat(val); const pct = parseFloat(discountInput)
    if (!isNaN(orig) && orig > 0 && !isNaN(pct) && pct > 0 && pct < 100)
      set('price', (orig * (1 - pct / 100)).toFixed(2))
  }
  const handleSellingPriceChange = (val: string) => {
    set('price', val)
    const orig = parseFloat(form.compare_at_price); const sell = parseFloat(val)
    if (!isNaN(orig) && orig > 0 && !isNaN(sell) && sell >= 0)
      setDiscountInput(String(Math.max(0, Math.round((1 - sell / orig) * 100))) || '')
  }
  const handleDiscountChange = (val: string) => {
    setDiscountInput(val)
    const orig = parseFloat(form.compare_at_price); const pct = parseFloat(val)
    if (!isNaN(orig) && orig > 0 && !isNaN(pct) && pct >= 0 && pct <= 100)
      set('price', (orig * (1 - pct / 100)).toFixed(2))
  }

  useEffect(() => {
    if (discount !== null && !discountInput) setDiscountInput(String(discount))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discount])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/catalog/products')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><ChevronLeft size={18} /></button>
            <div>
              <p className="text-xs text-gray-400">
                <Link to="/catalog/products" className="hover:text-gray-600">Products</Link>
                {' / '}<span className="text-gray-600">{isEdit ? 'Edit Product' : 'Add Product'}</span>
              </p>
              <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Product' : 'Add New Product'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/catalog/products')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={() => handleSave('draft')} disabled={saveMutation.isPending} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Save as Draft</button>
            <button onClick={() => handleSave()} disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg">
              {saveMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? 'Save Changes' : 'Publish Product'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-6xl mx-auto">
        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</div>}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Basic Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Basic Information</h2>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Product Name *</label>
                <input type="text" value={form.name}
                  onChange={e => { set('name', e.target.value); if (!isEdit) set('slug', slugify(e.target.value)) }}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL Slug</label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-gray-900">
                  <span className="px-3 py-2.5 text-xs text-gray-400 bg-gray-50 border-r border-gray-300 whitespace-nowrap">festecart.com/products/</span>
                  <input type="text" value={form.slug} onChange={e => set('slug', e.target.value)}
                    className="flex-1 px-3 py-2.5 text-sm font-mono focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Short Description</label>
                <input type="text" value={form.short_description} onChange={e => set('short_description', e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={6}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
              </div>
            </div>

            {/* Images */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Product Images</h2>
              <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragOver ? 'border-gray-900 bg-gray-50' : 'border-gray-200'}`}>
                <Upload size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-3">Drag & drop images here</p>
                <label className="cursor-pointer px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 inline-block">
                  {uploading ? <span className="flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> Uploading…</span> : 'Choose Files'}
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} disabled={uploading} />
                </label>
                <p className="text-xs text-gray-400 mt-2">Max 2 MB per image</p>
              </div>
              {imageError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg flex items-start justify-between gap-2">
                  <span>{imageError}</span>
                  <button type="button" onClick={() => setImageError(null)} className="shrink-0 text-red-400 hover:text-red-700 mt-0.5">
                    <X size={14} />
                  </button>
                </div>
              )}
              {form.images.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                  {form.images.map((url, i) => (
                    <div key={i} className="relative group aspect-square">
                      <img src={url} alt="" className="w-full h-full rounded-lg object-cover border border-gray-200" />
                      {i === 0 && <span className="absolute bottom-1 left-1 text-[10px] bg-gray-900 text-white px-1.5 py-0.5 rounded">Main</span>}
                      <button onClick={() => removeImage(url, i)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center shadow-sm">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pricing */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Pricing</h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Original Price / MRP (₹)</label>
                  <input type="number" value={form.compare_at_price} onChange={e => handleOriginalPriceChange(e.target.value)}
                    placeholder="0.00" min="0" step="0.01"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Discount %</label>
                  <input type="number" value={discountInput} onChange={e => handleDiscountChange(e.target.value)}
                    placeholder="0" min="0" max="100"
                    disabled={!form.compare_at_price || parseFloat(form.compare_at_price) <= 0}
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 disabled:bg-gray-50 ${discount !== null ? 'border-green-400 bg-green-50 text-green-800' : 'border-gray-300'}`} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Selling Price (₹) *</label>
                  <input type="number" value={form.price} onChange={e => handleSellingPriceChange(e.target.value)}
                    placeholder="0.00" min="0" step="0.01"
                    className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 ${form.compare_at_price && form.price && parseFloat(form.price) > parseFloat(form.compare_at_price) ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                </div>
              </div>
              {discount !== null && discount > 0 && (
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-100 rounded-lg text-sm">
                  <span className="font-bold text-green-700 text-base">{discount}% off</span>
                  <span className="text-green-600">Customer saves {formatCurrency(parseFloat(form.compare_at_price) - parseFloat(form.price))}</span>
                </div>
              )}
              <div className="pt-1 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-700 mb-1">SKU</label>
                <input type="text" value={form.sku} onChange={e => set('sku', e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>

            {/* Inventory */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h2 className="font-semibold text-gray-900">Inventory</h2>

              {/* Tracking condition */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Inventory Tracking Condition</label>
                <select value={form.inventory_tracking} onChange={e => set('inventory_tracking', e.target.value as 'none' | 'track')}
                  className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                  <option value="none">Don't track inventory</option>
                  <option value="track">Track product's inventory</option>
                </select>
              </div>

              {form.inventory_tracking === 'track' && (
                <div className="space-y-4">
                  {/* Quantity */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                    <input type="number" value={form.inventory_count}
                      onChange={e => set('inventory_count', e.target.value)}
                      placeholder="0" min="0"
                      className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>

                  {/* Allow backorder */}
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input type="checkbox" checked={form.allow_backorder}
                      onChange={e => set('allow_backorder', e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 accent-gray-900" />
                    <span className="text-sm text-gray-700">Allow customers to purchase this product when it's out of stock</span>
                  </label>

                  {/* Low stock notification */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input type="checkbox" checked={form.low_stock_notification}
                        onChange={e => set('low_stock_notification', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 accent-gray-900" />
                      <span className="text-sm text-gray-700">Low stock notification</span>
                    </label>
                    {form.low_stock_notification && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Stock Value</label>
                          <input type="number" value={form.low_stock_threshold}
                            onChange={e => set('low_stock_threshold', e.target.value)}
                            placeholder="e.g. 10" min="1"
                            max={form.inventory_count || undefined}
                            className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900
                              ${form.low_stock_threshold && form.inventory_count &&
                                parseInt(form.low_stock_threshold) > parseInt(form.inventory_count)
                                ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} />
                          {form.low_stock_threshold && form.inventory_count &&
                            parseInt(form.low_stock_threshold) > parseInt(form.inventory_count) ? (
                            <p className="text-xs text-red-500 mt-1">
                              Stock value must be ≤ quantity ({form.inventory_count})
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 mt-1">Notify when stock drops to or below this value.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Low stock message — always visible when tracking is on; optional override */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Low Stock Message <span className="text-gray-400 font-normal">(shown to customers)</span>
                      </label>
                      <input type="text" value={form.low_stock_message}
                        onChange={e => set('low_stock_message', e.target.value)}
                        placeholder='e.g. Only a few left — order soon!'
                        className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      <p className="text-xs text-gray-400 mt-1">
                        Optional — shown alongside the "Only X left!" message. Example: "Order soon before it's gone!"
                      </p>
                    </div>
                  </div>

                  {/* Restrict qty per user */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input type="checkbox" checked={form.restrict_qty_per_user}
                        onChange={e => set('restrict_qty_per_user', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 accent-gray-900" />
                      <span className="text-sm text-gray-700">Restrict Quantity Per User (Including all orders)</span>
                    </label>
                    {form.restrict_qty_per_user && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Maximum Quantity</label>
                        <input type="number" value={form.max_qty_per_user}
                          onChange={e => set('max_qty_per_user', e.target.value)}
                          placeholder="Maximum Quantity" min="1"
                          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">
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
                <p className="text-xs text-amber-600 flex items-center gap-1"><Star size={11} /> Featured in homepage section</p>
              )}
              <div className="border-t border-gray-100 pt-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">Display Order</label>
                <input type="number" value={form.display_order} onChange={e => set('display_order', e.target.value)} min="0"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 text-sm">Category</h2>
              <CategoryTreeSelect
                categories={categories}
                value={form.category_id}
                onChange={id => set('category_id', id)}
                placeholder="— Select Category —"
              />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
              <h2 className="font-semibold text-gray-900 text-sm">Vendor <span className="text-gray-400 font-normal">(optional)</span></h2>
              <select value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">— Select Vendor —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.business_name}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
