import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, Check, X, Loader2, GripVertical } from 'lucide-react'

interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
}

function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('display_order', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as Category[]
    },
  })
}

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

interface FormState {
  name: string
  slug: string
  description: string
  icon: string
  is_active: boolean
}

const EMPTY: FormState = { name: '', slug: '', description: '', icon: '', is_active: true }

export default function Categories() {
  const qc = useQueryClient()
  const { data: categories, isLoading } = useCategories()

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
        is_active: form.is_active,
      }
      if (editId) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editId)
        if (error) throw new Error(error.message)
      } else {
        const maxOrder = Math.max(0, ...(categories ?? []).map(c => c.display_order))
        const { error } = await supabase.from('categories').insert({ ...payload, display_order: maxOrder + 1 })
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      setShowForm(false)
      setEditId(null)
      setForm(EMPTY)
      setFormError(null)
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      setDeleteId(null)
    },
  })

  const toggleActive = async (cat: Category) => {
    await supabase.from('categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  const openAdd = () => {
    setForm(EMPTY)
    setFormError(null)
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (cat: Category) => {
    setForm({ name: cat.name, slug: cat.slug, description: cat.description ?? '', icon: cat.icon ?? '', is_active: cat.is_active })
    setFormError(null)
    setEditId(cat.id)
    setShowForm(true)
  }

  const handleSave = () => {
    if (!form.name.trim()) { setFormError('Name is required'); return }
    saveMutation.mutate()
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Category</h1>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={15} /> Add Category
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">{editId ? 'Edit Category' : 'New Category'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
                placeholder="Category name"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="auto-generated"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Icon (Lucide name)</label>
              <input
                type="text"
                value={form.icon}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                placeholder="e.g. Flame"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Active</label>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors mt-1 ${form.is_active ? 'bg-gray-900' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optional description"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {editId ? 'Save Changes' : 'Add Category'}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null) }} className="flex items-center gap-2 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Categories list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : (categories ?? []).length === 0 ? (
          <div className="p-12 text-center text-gray-400">No categories yet</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(categories ?? []).map(cat => (
              <div key={cat.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                <div className="flex items-center gap-3">
                  <GripVertical size={16} className="text-gray-300 cursor-grab" />
                  <div>
                    <span className="text-sm font-medium text-gray-900">{cat.name}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{cat.slug}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Active toggle */}
                  <button
                    onClick={() => toggleActive(cat)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${cat.is_active ? 'bg-black' : 'bg-gray-300'}`} />
                    {cat.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button onClick={() => openEdit(cat)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
                    <Pencil size={14} />
                  </button>
                  {deleteId === cat.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteMutation.mutate(cat.id)} disabled={deleteMutation.isPending} className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded">
                        {deleteMutation.isPending ? '…' : 'Delete'}
                      </button>
                      <button onClick={() => setDeleteId(null)} className="text-xs text-gray-400 px-2 py-1">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteId(cat.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
