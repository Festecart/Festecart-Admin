import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, Check, X, Loader2, ChevronRight, ChevronDown, Upload, ImageIcon } from 'lucide-react'

interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  image_url: string | null
  display_order: number
  is_active: boolean
  parent_id: string | null
}

interface CategoryNode extends Category {
  children: CategoryNode[]
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

function buildTree(flat: Category[]): CategoryNode[] {
  const map: Record<string, CategoryNode> = {}
  const roots: CategoryNode[] = []
  for (const c of flat) map[c.id] = { ...c, children: [] }
  for (const c of flat) {
    if (c.parent_id && map[c.parent_id]) {
      map[c.parent_id].children.push(map[c.id])
    } else {
      roots.push(map[c.id])
    }
  }
  return roots
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
  parent_id: string
  image_url: string
}

const EMPTY: FormState = { name: '', slug: '', description: '', icon: '', is_active: true, parent_id: '', image_url: '' }

// ── Tree row component ─────────────────────────────────────────────
function CategoryRow({
  node,
  depth,
  allCategories,
  onEdit,
  onDelete,
  onToggle,
  onAddChild,
  deleteId,
  setDeleteId,
  deleteMutation,
}: {
  node: CategoryNode
  depth: number
  allCategories: Category[]
  onEdit: (c: Category) => void
  onDelete: (id: string) => void
  onToggle: (c: Category) => void
  onAddChild: (parentId: string) => void
  deleteId: string | null
  setDeleteId: (id: string | null) => void
  deleteMutation: { isPending: boolean }
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
        {/* Left: indent + expand + name */}
        <div className="flex items-center min-w-0" style={{ paddingLeft: `${depth * 28}px` }}>
          {/* Vertical + horizontal connector lines */}
          {depth > 0 && (
            <span className="text-gray-300 mr-1.5 text-sm select-none">└</span>
          )}

          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className={`mr-1.5 shrink-0 text-gray-400 hover:text-gray-700 ${!hasChildren ? 'invisible' : ''}`}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-900">{node.name}</span>
            {hasChildren && (
              <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{node.children.length}</span>
            )}
            <span className="ml-2 text-xs text-gray-300 font-mono hidden sm:inline">{node.slug}</span>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0 ml-3">
          <button
            onClick={() => onToggle(node)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 whitespace-nowrap"
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${node.is_active ? 'bg-black' : 'bg-gray-300'}`} />
            <span className="hidden sm:inline">{node.is_active ? 'Active' : 'Inactive'}</span>
          </button>

          <button
            onClick={() => onAddChild(node.id)}
            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded"
            title={`Add subcategory under "${node.name}"`}
          >
            <Plus size={13} />
          </button>

          <button
            onClick={() => onEdit(node)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded"
          >
            <Pencil size={13} />
          </button>

          {deleteId === node.id ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDelete(node.id)}
                disabled={deleteMutation.isPending}
                className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded"
              >
                {deleteMutation.isPending ? '…' : 'Confirm'}
              </button>
              <button onClick={() => setDeleteId(null)} className="text-xs text-gray-400 px-1">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteId(node.id)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Render children recursively */}
      {expanded && node.children.map(child => (
        <CategoryRow
          key={child.id}
          node={child}
          depth={depth + 1}
          allCategories={allCategories}
          onEdit={onEdit}
          onDelete={onDelete}
          onToggle={onToggle}
          onAddChild={onAddChild}
          deleteId={deleteId}
          setDeleteId={setDeleteId}
          deleteMutation={deleteMutation}
        />
      ))}
    </>
  )
}

// ── Main page ──────────────────────────────────────────────────────
export default function Categories() {
  const qc = useQueryClient()
  const { data: categories, isLoading } = useCategories()
  const flat = categories ?? []
  const tree = buildTree(flat)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [bannerUploading, setBannerUploading] = useState(false)

  const uploadBanner = async (file: File) => {
    setBannerUploading(true)
    const ext = file.name.split('.').pop()
    const path = `categories/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await supabase.storage.from('product-images').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('product-images').getPublicUrl(path)
      setForm(f => ({ ...f, image_url: data.publicUrl }))
    } else {
      setFormError(`Banner upload failed: ${error.message}`)
    }
    setBannerUploading(false)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name),
        description: form.description.trim() || null,
        icon: form.icon.trim() || null,
        is_active: form.is_active,
        parent_id: form.parent_id || null,
        image_url: form.image_url.trim() || null,
      }
      if (editId) {
        const { error } = await supabase.from('categories').update(payload).eq('id', editId)
        if (error) throw new Error(error.message)
      } else {
        const maxOrder = Math.max(0, ...flat.map(c => c.display_order))
        const { error } = await supabase.from('categories').insert({ ...payload, display_order: maxOrder + 1 })
        if (error) throw new Error(error.message)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] })
      closeForm()
    },
    onError: (e) => setFormError(e instanceof Error ? e.message : 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setDeleteId(null) },
  })

  const toggleActive = async (cat: Category) => {
    await supabase.from('categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  const closeForm = () => { setShowForm(false); setEditId(null); setForm(EMPTY); setFormError(null) }

  const openAdd = (parentId = '') => {
    setForm({ ...EMPTY, parent_id: parentId })
    setFormError(null)
    setEditId(null)
    setShowForm(true)
  }

  const openEdit = (cat: Category) => {
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? '',
      icon: cat.icon ?? '',
      is_active: cat.is_active,
      parent_id: cat.parent_id ?? '',
      image_url: cat.image_url ?? '',
    })
    setFormError(null)
    setEditId(cat.id)
    setShowForm(true)
  }

  // Parent options — exclude self and its descendants when editing
  const getDescendantIds = (id: string): string[] => {
    const children = flat.filter(c => c.parent_id === id)
    return [id, ...children.flatMap(c => getDescendantIds(c.id))]
  }

  const allowedParents = flat.filter(c => {
    if (!editId) return true
    return !getDescendantIds(editId).includes(c.id)
  })

  // Recursive flat list with depth-based indentation
  const buildParentOptions = (
    cats: typeof flat,
    parentId: string | null = null,
    depth = 0
  ): { id: string; label: string }[] => {
    return cats
      .filter(c => (c.parent_id ?? null) === parentId && allowedParents.some(a => a.id === c.id))
      .flatMap(c => [
        { id: c.id, label: `${'  '.repeat(depth)}${depth > 0 ? '↳ ' : ''}${c.name}` },
        ...buildParentOptions(cats, c.id, depth + 1),
      ])
  }
  const parentOptions = buildParentOptions(flat)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Categories</h1>
        <button
          onClick={() => openAdd()}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg"
        >
          <Plus size={15} /> Add Category
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm">{editId ? 'Edit Category' : 'New Category'}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <label className="block text-xs font-medium text-gray-700 mb-1">Parent Category</label>
              <select
                value={form.parent_id}
                onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                <option value="">— None (top level) —</option>
                {parentOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Icon (Lucide name)</label>
              <input
                type="text"
                value={form.icon}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}
                placeholder="e.g. Flame, Star, Gift"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select
                value={form.is_active ? 'active' : 'inactive'}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Banner Image */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">Category Banner Image</label>
            <div className="flex items-start gap-4">
              {/* Preview */}
              {form.image_url ? (
                <div className="relative group shrink-0">
                  <img src={form.image_url} alt="banner" className="w-32 h-20 rounded-lg object-cover border border-gray-200" />
                  <button
                    onClick={() => setForm(f => ({ ...f, image_url: '' }))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div className="w-32 h-20 rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center bg-gray-50 shrink-0">
                  <ImageIcon size={18} className="text-gray-300" />
                  <span className="text-xs text-gray-400 mt-1">No banner</span>
                </div>
              )}
              {/* Upload */}
              <div className="flex-1">
                <label className={`flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 cursor-pointer w-fit ${bannerUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  {bannerUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {bannerUploading ? 'Uploading…' : 'Upload Banner'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={bannerUploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadBanner(f) }}
                  />
                </label>
                <p className="text-xs text-gray-400 mt-1.5">Recommended: 1200×400px. Shown on category page header.</p>
                {form.image_url && (
                  <p className="text-xs text-gray-400 mt-0.5 font-mono truncate max-w-xs">{form.image_url}</p>
                )}
              </div>
            </div>
          </div>

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => { if (!form.name.trim()) { setFormError('Name is required'); return } saveMutation.mutate() }}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg"
            >
              {saveMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {editId ? 'Save Changes' : 'Add Category'}
            </button>
            <button onClick={closeForm} className="flex items-center gap-2 border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg hover:bg-gray-50">
              <X size={13} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tree */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : tree.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No categories yet — click Add Category to start</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Header */}
            <div className="grid grid-cols-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Category</span>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide text-right pr-2">Actions</span>
            </div>
            {tree.map(node => (
              <CategoryRow
                key={node.id}
                node={node}
                depth={0}
                allCategories={flat}
                onEdit={openEdit}
                onDelete={(id) => deleteMutation.mutate(id)}
                onToggle={toggleActive}
                onAddChild={(parentId) => openAdd(parentId)}
                deleteId={deleteId}
                setDeleteId={setDeleteId}
                deleteMutation={deleteMutation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
