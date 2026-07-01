import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSiteConfig, useUpdateSiteConfig } from '@/hooks/useSiteConfig'
import { supabase } from '@/lib/supabase'
import { Save, Check, X, Loader2, Star } from 'lucide-react'

interface FeaturedConfig {
  enabled: boolean
  title: string
  subtitle: string
  product_ids: string[]
}

interface Product {
  id: string
  name: string
  price: number
  images: string[]
  status: string
}

interface Category {
  id: string
  name: string
}

const DEFAULT_CONFIG: FeaturedConfig = {
  enabled: true,
  title: 'Featured Products',
  subtitle: 'Handpicked treasures that bring tradition to your home',
  product_ids: [],
}

export default function FeaturedProducts() {
  const { data: raw, isLoading: configLoading } = useSiteConfig('featured_products')
  const update = useUpdateSiteConfig()

  const [config, setConfig] = useState<FeaturedConfig>(DEFAULT_CONFIG)
  const [selectionType, setSelectionType] = useState<'category' | 'specific'>('specific')
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([])
  const [loadingCategory, setLoadingCategory] = useState(false)
  const [productSearch, setProductSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const initialized = useRef(false)

  useEffect(() => {
    if (raw && !initialized.current) {
      setConfig({ ...DEFAULT_CONFIG, ...(raw as FeaturedConfig) })
      initialized.current = true
    }
  }, [raw])

  const { data: selectedProducts = [] } = useQuery({
    queryKey: ['featured-products-details', config.product_ids],
    queryFn: async () => {
      if (!config.product_ids.length) return []
      const { data } = await supabase
        .from('products')
        .select('id, name, price, images, status')
        .in('id', config.product_ids)
      return (data ?? []) as Product[]
    },
    enabled: config.product_ids.length > 0,
  })

  const orderedProducts = config.product_ids
    .map(id => selectedProducts.find(p => p.id === id))
    .filter(Boolean) as Product[]

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('id, name').order('name')
      return (data ?? []) as Category[]
    },
  })

  const handleCategoryChange = async (catId: string) => {
    setSelectedCategoryId(catId)
    setCategoryProducts([])
    if (!catId) return
    setLoadingCategory(true)
    const { data } = await supabase
      .from('products')
      .select('id, name, price, images, status')
      .eq('status', 'published')
      .eq('category_id', catId)
    setCategoryProducts((data ?? []) as Product[])
    setLoadingCategory(false)
  }

  useEffect(() => {
    if (!productSearch.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('products')
        .select('id, name, price, images, status')
        .eq('status', 'published')
        .ilike('name', `%${productSearch}%`)
        .limit(8)
      setSearchResults((data ?? []).filter(p => !config.product_ids.includes(p.id)) as Product[])
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [productSearch, config.product_ids])

  const addProduct = (p: Product) => {
    if (config.product_ids.includes(p.id)) return
    setConfig(c => ({ ...c, product_ids: [...c.product_ids, p.id] }))
    setProductSearch('')
    setSearchResults([])
  }

  const toggleProductFromCategory = (p: Product) => {
    setConfig(c => ({
      ...c,
      product_ids: c.product_ids.includes(p.id)
        ? c.product_ids.filter(id => id !== p.id)
        : [...c.product_ids, p.id],
    }))
  }

  const addAllCategoryProducts = () => {
    const newIds = categoryProducts.map(p => p.id).filter(id => !config.product_ids.includes(id))
    if (newIds.length) setConfig(c => ({ ...c, product_ids: [...c.product_ids, ...newIds] }))
  }

  const removeProduct = (id: string) =>
    setConfig(c => ({ ...c, product_ids: c.product_ids.filter(x => x !== id) }))

  const moveProduct = (idx: number, dir: -1 | 1) => {
    const ids = [...config.product_ids]
    const swap = idx + dir
    if (swap < 0 || swap >= ids.length) return
    ;[ids[idx], ids[swap]] = [ids[swap], ids[idx]]
    setConfig(c => ({ ...c, product_ids: ids }))
  }

  const handleSave = async () => {
    setSaving(true); setSaveError(null)
    try {
      await update.mutateAsync({ key: 'featured_products', value: config })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (configLoading) return (
    <div className="flex items-center justify-center min-h-96">
      <Loader2 className="animate-spin text-gray-400" size={24} />
    </div>
  )

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <p className="text-xs text-gray-400">
        <Link to="/site/navbar" className="hover:underline">Website</Link> / Featured Products
      </p>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Star size={20} /> Featured Products
        </h1>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {saveError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{saveError}</p>}

      {/* Section settings */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">Section Settings</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{config.enabled ? 'Visible' : 'Hidden'}</span>
            <button onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${config.enabled ? 'bg-gray-900' : 'bg-gray-300'}`}>
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Section Title</label>
            <input type="text" value={config.title} onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
              placeholder="Featured Products"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subtitle</label>
            <input type="text" value={config.subtitle} onChange={e => setConfig(c => ({ ...c, subtitle: e.target.value }))}
              placeholder="Handpicked treasures that bring tradition to your home"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>
      </div>

      {/* Product picker */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm">
          Select Products <span className="text-gray-400 font-normal">({config.product_ids.length} selected)</span>
        </h2>

        {/* Selection type toggle */}
        <div className="flex gap-2">
          {(['category', 'specific'] as const).map(t => (
            <button key={t}
              onClick={() => { setSelectionType(t); setSelectedCategoryId(''); setCategoryProducts([]) }}
              className={`px-4 py-2 text-sm rounded-lg border font-medium transition-colors ${
                selectionType === t
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}>
              {t === 'category' ? 'By Category' : 'Specific Products'}
            </button>
          ))}
        </div>

        {/* Category mode */}
        {selectionType === 'category' && (
          <div className="space-y-3">
            <select value={selectedCategoryId} onChange={e => handleCategoryChange(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">Select a category…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {loadingCategory && (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                <Loader2 size={14} className="animate-spin" /> Loading products…
              </div>
            )}

            {categoryProducts.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">{categoryProducts.length} products in this category</p>
                  <button onClick={addAllCategoryProducts}
                    className="text-xs text-gray-700 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium">
                    Add All
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  {categoryProducts.map(p => {
                    const isSelected = config.product_ids.includes(p.id)
                    return (
                      <div key={p.id} onClick={() => toggleProductFromCategory(p)}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors
                          ${isSelected ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={isSelected} readOnly className="accent-gray-900 shrink-0" />
                        {p.images?.[0]
                          ? <img src={p.images[0]} alt={p.name} className="w-8 h-8 rounded object-cover border border-gray-200 shrink-0" />
                          : <div className="w-8 h-8 rounded bg-gray-200 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className={`text-xs ${isSelected ? 'text-gray-300' : 'text-gray-400'}`}>₹{p.price}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {selectedCategoryId && !loadingCategory && categoryProducts.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No published products in this category</p>
            )}
          </div>
        )}

        {/* Specific products mode */}
        {selectionType === 'specific' && (
          <div className="relative">
            <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
              placeholder="Search and add products…"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            {searching && <Loader2 size={13} className="absolute right-3 top-3 animate-spin text-gray-400" />}
            {searchResults.length > 0 && (
              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                {searchResults.map(p => (
                  <button key={p.id} onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 text-left">
                    {p.images?.[0]
                      ? <img src={p.images[0]} alt={p.name} className="w-8 h-8 rounded object-cover shrink-0 border border-gray-200" />
                      : <div className="w-8 h-8 rounded bg-gray-100 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">₹{p.price}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected products list */}
        {orderedProducts.length > 0 ? (
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 font-medium">Selected ({orderedProducts.length})</p>
            {orderedProducts.map((p, idx) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50 hover:bg-white transition-colors">
                <span className="text-xs text-gray-400 w-5 text-center shrink-0">{idx + 1}</span>
                {p.images?.[0]
                  ? <img src={p.images[0]} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
                  : <div className="w-10 h-10 rounded-lg bg-gray-200 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">₹{p.price}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={(e) => { e.stopPropagation(); moveProduct(idx, -1) }} disabled={idx === 0}
                    className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded bg-white hover:bg-gray-100 disabled:opacity-30 text-sm font-bold">↑</button>
                  <button onClick={(e) => { e.stopPropagation(); moveProduct(idx, 1) }} disabled={idx === orderedProducts.length - 1}
                    className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded bg-white hover:bg-gray-100 disabled:opacity-30 text-sm font-bold">↓</button>
                  <button onClick={(e) => { e.stopPropagation(); removeProduct(p.id) }}
                    className="w-7 h-7 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded transition-colors">
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg">
            No products selected yet
          </div>
        )}
      </div>

      <div className="flex justify-end pb-4">
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-60">
          {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
