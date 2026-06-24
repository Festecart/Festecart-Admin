import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useSiteConfig, useUpdateSiteConfig } from '@/hooks/useSiteConfig'
import { Save, Check, Loader2, Plus, Trash2, ChevronUp, ChevronDown, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface PackageSlide {
  id: string
  image_url: string
  caption: string
}

interface WhyPackagesConfig {
  enabled: boolean
  title: string
  subtitle: string
  button_text: string
  button_link: string
  slides: PackageSlide[]
}

const DEFAULT_CONFIG: WhyPackagesConfig = {
  enabled: true,
  title: 'Why the packages?',
  subtitle: 'Curated package in detail',
  button_text: 'View All Products',
  button_link: '/products',
  slides: [],
}

const EMPTY_SLIDE = (): PackageSlide => ({
  id: crypto.randomUUID(),
  image_url: '',
  caption: '',
})

export default function WhyPackages() {
  const { data: raw, isLoading } = useSiteConfig('why_packages')
  const update = useUpdateSiteConfig()

  const [config, setConfig] = useState<WhyPackagesConfig>(DEFAULT_CONFIG)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  const initialized = useRef(false)

  useEffect(() => {
    if (raw && !initialized.current) {
      setConfig({ ...DEFAULT_CONFIG, ...(raw as WhyPackagesConfig) })
      initialized.current = true
    }
  }, [raw])

  const updateSlide = (id: string, field: keyof PackageSlide, value: string) =>
    setConfig(c => ({ ...c, slides: c.slides.map(s => s.id === id ? { ...s, [field]: value } : s) }))

  const addSlide = () =>
    setConfig(c => ({ ...c, slides: [...c.slides, EMPTY_SLIDE()] }))

  const removeSlide = (id: string) =>
    setConfig(c => ({ ...c, slides: c.slides.filter(s => s.id !== id) }))

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const arr = [...config.slides]
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    setConfig(c => ({ ...c, slides: arr }))
  }

  const handleImageUpload = async (id: string, file: File) => {
    setUploading(id)
    setUploadErrors(e => ({ ...e, [id]: '' }))
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `why-packages/${id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path)
      updateSlide(id, 'image_url', publicUrl)
    } catch (e) {
      setUploadErrors(prev => ({ ...prev, [id]: e instanceof Error ? e.message : 'Upload failed' }))
    } finally {
      setUploading(null)
    }
  }

  const handleSave = async () => {
    setSaving(true); setSaveError(null)
    try {
      await update.mutateAsync({ key: 'why_packages', value: config })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-96">
      <Loader2 className="animate-spin text-gray-400" size={24} />
    </div>
  )

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <p className="text-xs text-gray-400">
        <Link to="/site/navbar" className="hover:underline">Website</Link> / Why Packages
      </p>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package size={20} /> Why Packages
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Section Title</label>
            <input type="text" value={config.title}
              onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
              placeholder="Why the packages?"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Subtitle</label>
            <input type="text" value={config.subtitle}
              onChange={e => setConfig(c => ({ ...c, subtitle: e.target.value }))}
              placeholder="Curated package in detail"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Button Text</label>
            <input type="text" value={config.button_text}
              onChange={e => setConfig(c => ({ ...c, button_text: e.target.value }))}
              placeholder="View All Products"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Button Link</label>
            <input type="text" value={config.button_link}
              onChange={e => setConfig(c => ({ ...c, button_link: e.target.value }))}
              placeholder="/products"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>
      </div>

      {/* Slides */}
      <div className="space-y-4">
        {config.slides.map((slide, idx) => (
          <div key={slide.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Slide {idx + 1}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveSlide(idx, -1)} disabled={idx === 0}
                  className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded disabled:opacity-30">
                  <ChevronUp size={13} />
                </button>
                <button onClick={() => moveSlide(idx, 1)} disabled={idx === config.slides.length - 1}
                  className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded disabled:opacity-30">
                  <ChevronDown size={13} />
                </button>
                <button onClick={() => removeSlide(slide.id)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded ml-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Image */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Slide Image</label>
              <div className="flex items-start gap-3">
                {slide.image_url ? (
                  <img src={slide.image_url} alt="slide" className="w-24 h-16 rounded-lg object-cover border border-gray-200 shrink-0" />
                ) : (
                  <div className="w-24 h-16 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs shrink-0">
                    Image
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <label className="flex items-center gap-2 px-3 py-2 text-xs border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 w-fit">
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(slide.id, f) }} />
                    {uploading === slide.id ? <Loader2 size={12} className="animate-spin" /> : null}
                    Upload Image
                  </label>
                  {uploadErrors[slide.id] && <p className="text-xs text-red-500">{uploadErrors[slide.id]}</p>}
                  <p className="text-xs text-gray-400">Or paste URL:</p>
                  <input type="text" value={slide.image_url}
                    onChange={e => updateSlide(slide.id, 'image_url', e.target.value)}
                    placeholder="https://..."
                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900" />
                </div>
              </div>
            </div>

            {/* Caption */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Caption / Description</label>
              <input type="text" value={slide.caption}
                onChange={e => updateSlide(slide.id, 'caption', e.target.value)}
                placeholder="Get your high-quality festival essentials delivered right to your doorstep…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          </div>
        ))}

        <button onClick={addSlide}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors">
          <Plus size={16} /> Add Slide
        </button>
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
