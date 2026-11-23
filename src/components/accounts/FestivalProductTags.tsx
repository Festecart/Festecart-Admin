import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { fetchAdminCategories, fetchAdminProducts } from '@/lib/products'
import {
  fetchFestivalProductsByIds,
  filterAdminProductsByFestival,
  FESTIVAL_CATEGORIES,
  mergeFestivalProductSelectionsByCategory,
  type FestivalCategory,
} from '@/lib/festivalProducts'
import {
  createFestivalTag,
  deleteFestivalTag,
  fetchFestivalProductSelections,
  fetchFestivalTags,
  renameFestivalTag,
} from '@/lib/accounts'
import type { FestivalTag } from '@/types/accounts'

type TagFormMode = 'create' | 'edit'

export function FestivalProductTags({
  selectedFestival,
  onSelectFestival,
}: {
  selectedFestival: FestivalCategory | null
  onSelectFestival: (festival: FestivalCategory) => void
}) {
  const queryClient = useQueryClient()
  const deleteInProgress = useRef(false)
  const deleteNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedTagId, setSelectedTagId] = useState('')
  const [tagFormMode, setTagFormMode] = useState<TagFormMode | null>(null)
  const [tagFormName, setTagFormName] = useState('')
  const [newTagProductIds, setNewTagProductIds] = useState<string[]>([])
  const [deleteTargetId, setDeleteTargetId] = useState('')
  const [deleteConfirmationStep, setDeleteConfirmationStep] = useState<1 | 2 | null>(null)
  const [viewingTag, setViewingTag] = useState<FestivalTag | null>(null)
  const [search, setSearch] = useState('')
  const [viewSearch, setViewSearch] = useState('')
  const [draftSelections, setDraftSelections] = useState<Record<string, string[]>>({})
  const [notice, setNotice] = useState('')

  useEffect(() => () => {
    if (deleteNoticeTimer.current !== null) clearTimeout(deleteNoticeTimer.current)
  }, [])

  const tagsQuery = useQuery({
    queryKey: ['accounts', 'festival-tags'],
    queryFn: fetchFestivalTags,
  })
  const selectionsQuery = useQuery({
    queryKey: ['accounts', 'festival-product-selections'],
    queryFn: fetchFestivalProductSelections,
  })
  const productsQuery = useQuery({
    queryKey: ['admin-products', 'all'],
    queryFn: () => fetchAdminProducts('all'),
    staleTime: 30_000,
    refetchOnMount: 'always',
  })
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: fetchAdminCategories,
  })
  const createdTags = (tagsQuery.data ?? []).filter(tag => tag.is_custom)
  const selectedManagementTag = createdTags.find(tag => tag.id === selectedTagId) ?? null
  const deleteTargetTag = createdTags.find(tag => tag.id === deleteTargetId) ?? null
  const allProducts = productsQuery.data ?? []
  const categories = categoriesQuery.data ?? []
  const linkedProductSelections = useMemo(
    () => mergeFestivalProductSelectionsByCategory(
      tagsQuery.data ?? [],
      selectionsQuery.data ?? {},
      allProducts,
      categories,
    ),
    [tagsQuery.data, selectionsQuery.data, allProducts, categories],
  )
  const persistedViewIds = viewingTag ? linkedProductSelections[viewingTag.id] ?? [] : []
  const viewProductsQuery = useQuery({
    queryKey: ['accounts', 'festival-tag-products', viewingTag?.id ?? '', persistedViewIds],
    queryFn: () => fetchFestivalProductsByIds(persistedViewIds),
    enabled: viewingTag !== null,
  })

  const festivalProducts = useMemo(
    () => selectedFestival ? filterAdminProductsByFestival(selectedFestival, allProducts, categories) : [],
    [selectedFestival, allProducts, categories],
  )
  const filteredProducts = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    return needle ? festivalProducts.filter(product => product.name.toLocaleLowerCase().includes(needle)) : festivalProducts
  }, [festivalProducts, search])
  const selectedProductIds = tagFormMode === 'create'
    ? newTagProductIds
    : tagFormMode === 'edit' && selectedTagId
      ? draftSelections[selectedTagId] ?? selectionsQuery.data?.[selectedTagId] ?? []
      : []
  const selectedProductSet = useMemo(() => new Set(selectedProductIds), [selectedProductIds])
  const selectedInCategoryCount = festivalProducts.filter(product => selectedProductSet.has(product.id)).length
  const filteredViewProducts = useMemo(() => {
    const needle = viewSearch.trim().toLocaleLowerCase()
    const products = viewProductsQuery.data ?? []
    return needle ? products.filter(product => product.name.toLocaleLowerCase().includes(needle)) : products
  }, [viewProductsQuery.data, viewSearch])
  const productById = useMemo(() => new Map(allProducts.map(product => [product.id, product])), [allProducts])
  const selectedProducts = selectedProductIds.flatMap(id => {
    const product = productById.get(id)
    return product ? [product] : []
  })
  const savedProductIds = [...new Set(selectedProductIds)]
  const canChangeProducts = tagFormMode !== null

  useEffect(() => {
    if (selectionsQuery.data) setDraftSelections(selectionsQuery.data)
  }, [selectionsQuery.data])

  const refreshTagQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounts', 'festival-tags'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', 'festival-product-selections'] }),
    ])
  }
  const createMutation = useMutation({
    mutationFn: ({ name, productIds }: { name: string; productIds: string[] }) => createFestivalTag(name, productIds),
    onSuccess: async tag => {
      setSelectedTagId(tag.id)
      setTagFormMode(null)
      setTagFormName('')
      setNewTagProductIds([])
      setNotice('Tag created successfully.')
      await refreshTagQueries()
    },
  })
  const renameMutation = useMutation({
    mutationFn: ({ id, name, productIds }: { id: string; name: string; productIds: string[] }) =>
      renameFestivalTag(id, name, productIds),
    onSuccess: async (_, variables) => {
      setSelectedTagId(variables.id)
      setTagFormMode(null)
      setTagFormName('')
      setNotice('Tag updated successfully.')
      await refreshTagQueries()
    },
  })
  const deleteMutation = useMutation({
    mutationFn: deleteFestivalTag,
    onSuccess: async (_, deletedId) => {
      setDeleteConfirmationStep(null)
      setDeleteTargetId('')
      setSelectedTagId(current => current === deletedId ? '' : current)
      setViewingTag(current => current?.id === deletedId ? null : current)
      setDraftSelections(current => {
        const next = { ...current }
        delete next[deletedId]
        return next
      })
      if (deleteNoticeTimer.current !== null) clearTimeout(deleteNoticeTimer.current)
      setNotice('Tag deleted successfully.')
      deleteNoticeTimer.current = setTimeout(() => {
        setNotice(current => current === 'Tag deleted successfully.' ? '' : current)
        deleteNoticeTimer.current = null
      }, 5000)
      await refreshTagQueries()
    },
    onSettled: () => {
      deleteInProgress.current = false
    },
  })

  function updateSelectedProducts(update: (current: Set<string>) => Set<string>) {
    if (!canChangeProducts) return
    const nextIds = [...update(new Set(selectedProductIds))]
    if (tagFormMode === 'create') {
      setNewTagProductIds(nextIds)
      return
    }
    if (tagFormMode === 'edit' && selectedTagId) {
      setDraftSelections(current => ({ ...current, [selectedTagId]: nextIds }))
    }
  }

  function selectAllProducts() {
    updateSelectedProducts(current => new Set([...current, ...festivalProducts.map(product => product.id)]))
  }

  function removeAllProducts() {
    const categoryProductIds = new Set(festivalProducts.map(product => product.id))
    updateSelectedProducts(current => new Set([...current].filter(id => !categoryProductIds.has(id))))
  }

  function toggleProduct(productId: string) {
    updateSelectedProducts(current => {
      if (current.has(productId)) current.delete(productId)
      else current.add(productId)
      return current
    })
  }

  function openCreateForm() {
    setNotice('')
    setTagFormName('')
    setNewTagProductIds([])
    createMutation.reset()
    renameMutation.reset()
    setTagFormMode('create')
  }

  function openEditForm() {
    if (!selectedManagementTag || selectionsQuery.isPending || selectionsQuery.isError) return
    setNotice('')
    setTagFormName(selectedManagementTag.name)
    setDraftSelections(current => ({
      ...current,
      [selectedManagementTag.id]: [...(selectionsQuery.data?.[selectedManagementTag.id] ?? [])],
    }))
    createMutation.reset()
    renameMutation.reset()
    setTagFormMode('edit')
  }

  function closeTagForm() {
    if (tagFormMode === 'create') setNewTagProductIds([])
    if (tagFormMode === 'edit' && selectedTagId) {
      setDraftSelections(current => ({
        ...current,
        [selectedTagId]: [...(selectionsQuery.data?.[selectedTagId] ?? [])],
      }))
    }
    setTagFormMode(null)
    setTagFormName('')
    createMutation.reset()
    renameMutation.reset()
  }

  function submitTagForm(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    if (tagFormMode === 'create') {
      createMutation.mutate({ name: tagFormName, productIds: savedProductIds })
    }
    if (tagFormMode === 'edit' && selectedManagementTag) {
      renameMutation.mutate({
        id: selectedManagementTag.id,
        name: tagFormName,
        productIds: savedProductIds,
      })
    }
  }

  function openView(tag: FestivalTag) {
    setViewSearch('')
    setViewingTag(tag)
  }

  function selectTag(tag: FestivalTag) {
    if (tagFormMode || deleteMutation.isPending) return
    setSelectedTagId(tag.id)
    setDraftSelections(current => ({
      ...current,
      [tag.id]: [...(selectionsQuery.data?.[tag.id] ?? [])],
    }))
    setNotice('')
  }

  function openDeleteConfirmation() {
    if (!selectedManagementTag || tagFormMode || deleteMutation.isPending) return
    setDeleteTargetId(selectedManagementTag.id)
    setDeleteConfirmationStep(1)
    deleteMutation.reset()
  }

  function continueDeleteConfirmation() {
    if (deleteConfirmationStep !== 1 || !deleteTargetTag || deleteMutation.isPending) return
    setDeleteConfirmationStep(2)
  }

  function confirmDelete() {
    if (deleteConfirmationStep !== 2 || !deleteTargetTag || deleteMutation.isPending || deleteInProgress.current) return
    deleteInProgress.current = true
    deleteMutation.mutate(deleteTargetId)
  }

  function closeDeleteConfirmation() {
    if (deleteMutation.isPending) return
    setDeleteConfirmationStep(null)
    setDeleteTargetId('')
    deleteMutation.reset()
  }

  const formMutation = tagFormMode === 'edit' ? renameMutation : createMutation

  return (
    <section className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-start">
            <div>
              <div>
                <h2 className="font-semibold text-slate-900">Created Tags</h2>
                <p className="mt-1 text-xs text-slate-500">Select one tag to view or edit it.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-center">
              <button type="button" onClick={openEditForm} disabled={!selectedManagementTag || tagFormMode !== null || selectionsQuery.isPending || selectionsQuery.isError} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                <Pencil size={14} />Edit
              </button>
              <button type="button" onClick={openDeleteConfirmation} disabled={!selectedManagementTag || tagFormMode !== null || deleteMutation.isPending} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50">
                <Trash2 size={14} />Delete
              </button>
            </div>
            <div className="md:justify-self-end">
              <button type="button" onClick={openCreateForm} disabled={tagFormMode !== null} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                <Plus size={15} />Create Tag
              </button>
            </div>
          </div>
        </div>

        {notice && <p role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 sm:px-5">{notice}</p>}
        {deleteMutation.error instanceof Error && <p role="alert" className="border-b border-rose-100 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 sm:px-5">{deleteMutation.error.message}</p>}

        {tagsQuery.isPending || selectionsQuery.isPending || productsQuery.isPending || categoriesQuery.isPending
          ? <div className="p-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" size={18} />Loading created tags…</div>
          : tagsQuery.isError || selectionsQuery.isError || productsQuery.isError || categoriesQuery.isError
            ? <p role="alert" className="p-5 text-sm text-rose-700">Created tags or linked products could not be loaded.</p>
            : createdTags.length === 0
              ? <p className="p-5 text-sm text-slate-500">No tags created yet.</p>
            : <>
                <ol className="divide-y divide-slate-100">
                  {createdTags.map((tag, index) => {
                    const productCount = linkedProductSelections[tag.id]?.length ?? 0
                    const isSelected = selectedTagId === tag.id
                    return (
                      <li key={tag.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 ${isSelected ? 'bg-slate-50' : ''}`}>
                        <button type="button" aria-pressed={isSelected} disabled={tagFormMode !== null || deleteMutation.isPending} onClick={() => selectTag(tag)} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
                          <span className="w-6 shrink-0 text-xs font-semibold text-slate-400">{index + 1}.</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">{tag.name}</span>
                            <span className="mt-0.5 block text-xs text-slate-500">{productCount} linked product{productCount === 1 ? '' : 's'}</span>
                          </span>
                        </button>
                        {isSelected && (
                          <button type="button" onClick={() => openView(tag)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-white">
                            <Eye size={14} />View
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </>}
      </section>

      {tagFormMode && (
        <form onSubmit={submitTagForm} className="grid gap-4 xl:grid-cols-[minmax(190px,0.8fr)_minmax(300px,1.3fr)_minmax(260px,1fr)]">
          <section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4">
              <h2 className="font-semibold text-slate-900">Festival Categories</h2>
              <p className="mt-1 text-xs text-slate-500">Select a category to see its Admin Products.</p>
            </div>
            <nav className="grid gap-1 p-3" aria-label="Festival categories">
              {FESTIVAL_CATEGORIES.map(festival => (
                <button
                  key={festival}
                  type="button"
                  aria-pressed={selectedFestival === festival}
                  onClick={() => {
                    onSelectFestival(festival)
                    setSearch('')
                  }}
                  className={`rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ${selectedFestival === festival ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                >
                  {festival}
                </button>
              ))}
            </nav>
          </section>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-slate-900">Products</h2>
                  <p className="mt-1 text-xs text-slate-500">{selectedFestival ?? 'Choose a festival category'} · Total Products: {selectedFestival ? festivalProducts.length : 0}</p>
                </div>
                <p className="text-xs text-slate-600">Selected: {selectedInCategoryCount}</p>
              </div>
              {selectedFestival && (
                <label className="relative mt-3 block">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Products" className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm" />
                </label>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={selectAllProducts} disabled={!selectedFestival || !canChangeProducts || productsQuery.isPending} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Select All</button>
                <button type="button" onClick={removeAllProducts} disabled={!selectedFestival || !canChangeProducts || productsQuery.isPending} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Remove All / Deselect All</button>
              </div>
            </div>
            {productsQuery.isPending || categoriesQuery.isPending
              ? <div className="p-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" size={18} />Loading Admin Products…</div>
              : productsQuery.isError || categoriesQuery.isError
                ? <p role="alert" className="p-5 text-sm text-rose-700">Admin Products or categories could not be loaded.</p>
                : !selectedFestival
                  ? <p className="p-8 text-center text-sm text-slate-500">Select a festival category to view products.</p>
                  : <ul className="max-h-[34rem] divide-y divide-slate-100 overflow-y-auto">
                    {filteredProducts.map(product => (
                      <li key={product.id}>
                        <label className={`flex items-start gap-2.5 px-3 py-2.5 text-sm ${canChangeProducts ? 'cursor-pointer hover:bg-slate-50' : 'cursor-not-allowed opacity-60'}`}>
                          <input type="checkbox" checked={selectedProductSet.has(product.id)} disabled={!canChangeProducts} onChange={() => toggleProduct(product.id)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-700" />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-slate-800">{product.name}</span>
                            <span className="mt-0.5 block text-[11px] capitalize text-slate-500">{product.status || 'Unknown status'}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                    {filteredProducts.length === 0 && (
                      <li className="px-3 py-8 text-center text-sm text-slate-500">
                        {festivalProducts.length ? 'No products match your search.' : 'No products are assigned to this festival category.'}
                      </li>
                    )}
                  </ul>}
          </section>

          <section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4">
              <h2 className="font-semibold text-slate-900">Tag Association</h2>
            </div>
            <div className="space-y-4 p-4">
              <label className="block text-sm font-medium text-slate-700">Tag Name
                <input
                  value={tagFormName}
                  onChange={event => {
                    setTagFormName(event.target.value)
                    createMutation.reset()
                    renameMutation.reset()
                  }}
                  maxLength={80}
                  required
                  placeholder="Enter tag name"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"
                />
              </label>
              {selectionsQuery.isError && tagFormMode === 'edit' && <p role="alert" className="text-xs text-rose-700">Saved product associations could not be loaded.</p>}
              <div>
                <p className="text-sm font-medium text-slate-700">Selected Product Count: {savedProductIds.length}</p>
                <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
                  {productsQuery.isPending
                    ? <p className="p-3 text-sm text-slate-500">Loading product names…</p>
                    : selectedProducts.length === 0
                      ? <p className="p-3 text-sm text-slate-500">No products selected.</p>
                      : <ul className="divide-y divide-slate-100">
                        {selectedProducts.map(product => <li key={product.id} className="px-3 py-2 text-sm text-slate-700">{product.name}</li>)}
                      </ul>}
                </div>
                {selectedProducts.length < savedProductIds.length && (
                  <p className="mt-1.5 text-xs text-amber-700">Some previously associated products are no longer in Admin Products and will be preserved.</p>
                )}
              </div>
              {formMutation.error instanceof Error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{formMutation.error.message}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeTagForm} disabled={formMutation.isPending} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={formMutation.isPending || (tagFormMode === 'edit' && selectionsQuery.isError) || !tagFormName.trim()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {formMutation.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </section>
        </form>
      )}

      {deleteConfirmationStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-tag-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl">
            <div>
              <h2 id="delete-tag-title" className="text-lg font-semibold text-slate-900">
                {deleteConfirmationStep === 1 ? 'Delete Tag?' : 'Permanently Delete Tag?'}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {deleteConfirmationStep === 1
                  ? 'Are you sure you want to delete this tag?'
                  : `You are about to permanently delete ${deleteTargetTag?.name ?? 'this tag'}. This action cannot be undone.`}
              </p>
            </div>
            {deleteMutation.error instanceof Error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{deleteMutation.error.message}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeDeleteConfirmation} disabled={deleteMutation.isPending} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">Cancel</button>
              {deleteConfirmationStep === 1
                ? <button type="button" onClick={continueDeleteConfirmation} disabled={!deleteTargetTag || deleteMutation.isPending} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Continue</button>
                : <button type="button" onClick={confirmDelete} disabled={!deleteTargetTag || deleteMutation.isPending} className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{deleteMutation.isPending ? 'Deleting…' : 'Delete'}</button>}
            </div>
          </section>
        </div>
      )}

      {viewingTag && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="saved-tag-title" className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 id="saved-tag-title" className="font-semibold text-slate-900">Tag: {createdTags.find(tag => tag.id === viewingTag.id)?.name ?? viewingTag.name}</h2>
                <p className="mt-1 text-xs text-slate-500">Linked Products: {selectionsQuery.isPending ? 'Loading…' : persistedViewIds.length}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setViewingTag(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="space-y-3 overflow-y-auto p-5">
              {persistedViewIds.length > 0 && (
                <label className="relative block">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input type="search" value={viewSearch} onChange={event => setViewSearch(event.target.value)} placeholder="Search Products" className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm" />
                </label>
              )}
              {selectionsQuery.isPending
                ? <div className="py-6 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" size={18} />Loading saved selections…</div>
                : selectionsQuery.isError
                  ? <p role="alert" className="py-6 text-center text-sm text-rose-700">Saved selections could not be loaded.</p>
                  : persistedViewIds.length === 0
                    ? <p className="py-6 text-center text-sm text-slate-500">No products selected for this tag.</p>
                    : viewProductsQuery.isPending
                      ? <div className="py-6 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 animate-spin" size={18} />Loading saved products…</div>
                      : viewProductsQuery.isError
                        ? <p role="alert" className="py-6 text-center text-sm text-rose-700">Saved products could not be loaded.</p>
                        : viewProductsQuery.data?.length === 0
                          ? <p className="py-6 text-center text-sm text-slate-500">Saved products are no longer in Admin Products.</p>
                          : filteredViewProducts.length === 0
                            ? <p className="py-6 text-center text-sm text-slate-500">No saved products match your search.</p>
                            : <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                              {filteredViewProducts.map(product => <li key={product.id} className="px-3 py-2.5 text-sm text-slate-800">{product.name}</li>)}
                            </ul>}
            </div>
            <div className="flex justify-end border-t border-slate-100 px-5 py-4">
              <button type="button" onClick={() => setViewingTag(null)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Close</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
