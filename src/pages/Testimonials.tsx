import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useSiteConfig, useUpdateSiteConfig } from '@/hooks/useSiteConfig'
import { Save, Check, Loader2, Plus, Trash2, ChevronUp, ChevronDown, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Testimonial {
  id: string
  heading: string
  review: string
  author: string
  location: string
  image_url: string
}

interface TestimonialsConfig {
  enabled: boolean
  title: string
  testimonials: Testimonial[]
}

const DEFAULT_CONFIG: TestimonialsConfig = {
  enabled: true,
  title: 'What Our Customers Say',
  testimonials: [],
}

const EMPTY_TESTIMONIAL = (): Testimonial => ({
  id: crypto.randomUUID(),
  heading: '',
  review: '',
  author: '',
  location: '',
  image_url: '',
})

export default function Testimonials() {
  const { data: raw, isLoading } = useSiteConfig('testimonials')
  const update = useUpdateSiteConfig()

  const [config, setConfig] = useState<TestimonialsConfig>(DEFAULT_CONFIG)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (raw && !initialized.current) {
      setConfig({ ...DEFAULT_CONFIG, ...(raw as TestimonialsConfig) })
      initialized.current = true
    }
  }, [raw])

  const updateTestimonial = (id: string, field: keyof Testimonial, value: string) =>
    setConfig(c => ({ ...c, testimonials: c.testimonials.map(t => t.id === id ? { ...t, [field]: value } : t) }))

  const addTestimonial = () =>
    setConfig(c => ({ ...c, testimonials: [...c.testimonials, EMPTY_TESTIMONIAL()] }))

  const removeTestimonial = (id: string) =>
    setConfig(c => ({ ...c, testimonials: c.testimonials.filter(t => t.id !== id) }))

  const moveTestimonial = (idx: number, dir: -1 | 1) => {
    const arr = [...config.testimonials]
    const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    setConfig(c => ({ ...c, testimonials: arr }))
  }

  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})

  const handleImageUpload = async (id: string, file: File) => {
    setUploading(id)
    setUploadErrors(e => ({ ...e, [id]: '' }))
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `testimonials/${id}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true })
      if (upErr) throw new Error(upErr.message)
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(path)
      updateTestimonial(id, 'image_url', publicUrl)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setUploadErrors(prev => ({ ...prev, [id]: msg }))
    } finally {
      setUploading(null)
    }
  }

  const handleSave = async () => {
    setSaving(true); setSaveError(null)
    try {
      await update.mutateAsync({ key: 'testimonials', value: config })
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
        <Link to="/site/navbar" className="hover:underline">Website</Link> / Testimonials
      </p>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare size={20} /> Testimonials
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
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Section Title</label>
          <input type="text" value={config.title}
            onChange={e => setConfig(c => ({ ...c, title: e.target.value }))}
            placeholder="What Our Customers Say"
            className="w-full max-w-md px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>
      </div>

      {/* Testimonials list */}
      <div className="space-y-4">
        {config.testimonials.map((t, idx) => (
          <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {/* Card header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Testimonial {idx + 1}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => moveTestimonial(idx, -1)} disabled={idx === 0}
                  className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded disabled:opacity-30"><ChevronUp size={13} /></button>
                <button onClick={() => moveTestimonial(idx, 1)} disabled={idx === config.testimonials.length - 1}
                  className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded disabled:opacity-30"><ChevronDown size={13} /></button>
                <button onClick={() => removeTestimonial(t.id)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 border border-red-200 rounded ml-1">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Customer photo */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Customer Photo</label>
                <div className="flex items-center gap-3">
                  {t.image_url ? (
                    <img src={t.image_url} alt="customer" className="w-14 h-14 rounded-full object-cover border-2 border-gray-200" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs">Photo</div>
                  )}
                  <div className="flex-1 space-y-1">
                    <label className="flex items-center gap-2 px-3 py-2 text-xs border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 w-fit">
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(t.id, f) }} />
                      {uploading === t.id ? <Loader2 size={12} className="animate-spin" /> : null}
                      Upload Photo
                    </label>
                    {uploadErrors[t.id] && (
                      <p className="text-xs text-red-500">{uploadErrors[t.id]}</p>
                    )}
                    <p className="text-xs text-gray-400">Or paste URL:</p>
                    <input type="text" value={t.image_url}
                      onChange={e => updateTestimonial(t.id, 'image_url', e.target.value)}
                      placeholder="https://..."
                      className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900" />
                  </div>
                </div>
              </div>

              {/* Heading */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Heading / Title</label>
                <input type="text" value={t.heading}
                  onChange={e => updateTestimonial(t.id, 'heading', e.target.value)}
                  placeholder="A new way to celebrate!"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>

              {/* Review text */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Review Text</label>
                <textarea value={t.review}
                  onChange={e => updateTestimonial(t.id, 'review', e.target.value)}
                  rows={3} placeholder="Festecart made our Diwali so easy!…"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
              </div>

              {/* Author name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Author Name</label>
                <input type="text" value={t.author}
                  onChange={e => updateTestimonial(t.id, 'author', e.target.value)}
                  placeholder="Manjunath & Nandini"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>

              {/* Location */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                <input type="text" value={t.location}
                  onChange={e => updateTestimonial(t.id, 'location', e.target.value)}
                  placeholder="Bengaluru"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
          </div>
        ))}

        {/* Add testimonial button */}
        <button onClick={addTestimonial}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors">
          <Plus size={16} /> Add Testimonial
        </button>
      </div>

      {/* Save footer */}
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
