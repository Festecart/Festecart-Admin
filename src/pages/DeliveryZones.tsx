import { useState } from 'react'
import { MapPin, Plus, Pencil, Trash2, Search, X, Check, Loader2 } from 'lucide-react'
import {
  useDeliveryPincodes,
  useAddPincode,
  useUpdatePincode,
  useDeletePincode,
} from '@/hooks/useDeliveryPincodes'
import { formatCurrency } from '@/lib/utils'
import type { DeliveryPincode } from '@/types'

interface FormState {
  pincode: string
  area_name: string
  shipping_charge: string
  is_active: boolean
}

const EMPTY_FORM: FormState = { pincode: '', area_name: '', shipping_charge: '0', is_active: true }

export default function DeliveryZones() {
  const { data: pincodes, isLoading } = useDeliveryPincodes()
  const addPincode = useAddPincode()
  const updatePincode = useUpdatePincode()
  const deletePincode = useDeletePincode()

  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const filtered = (pincodes ?? []).filter(p => {
    const q = search.toLowerCase()
    return p.pincode.includes(q) || p.area_name.toLowerCase().includes(q)
  })

  const openAdd = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setEditingId(null)
    setShowAdd(true)
  }

  const openEdit = (p: DeliveryPincode) => {
    setForm({
      pincode: p.pincode,
      area_name: p.area_name,
      shipping_charge: String(p.shipping_charge),
      is_active: p.is_active,
    })
    setFormError(null)
    setEditingId(p.id)
    setShowAdd(false)
  }

  const closeForm = () => {
    setShowAdd(false)
    setEditingId(null)
    setFormError(null)
  }

  const handleSave = async () => {
    setFormError(null)
    if (!form.pincode.match(/^\d{6}$/)) {
      setFormError('Pincode must be exactly 6 digits')
      return
    }
    if (!form.area_name.trim()) {
      setFormError('Area name is required')
      return
    }
    const charge = parseFloat(form.shipping_charge)
    if (isNaN(charge) || charge < 0) {
      setFormError('Shipping charge must be a valid number')
      return
    }

    try {
      if (editingId) {
        await updatePincode.mutateAsync({
          id: editingId,
          area_name: form.area_name.trim(),
          shipping_charge: charge,
          is_active: form.is_active,
        })
      } else {
        await addPincode.mutateAsync({
          pincode: form.pincode.trim(),
          area_name: form.area_name.trim(),
          shipping_charge: charge,
          is_active: form.is_active,
        })
      }
      closeForm()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deletePincode.mutateAsync(id)
      setDeleteConfirmId(null)
    } catch (e) {
      console.error(e)
    }
  }

  const isSaving = addPincode.isPending || updatePincode.isPending

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin size={22} /> Delivery Zones
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Manage serviceable pincodes — changes reflect instantly on checkout
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={16} /> Add Pincode
        </button>
      </div>

      {/* Add / Edit Form */}
      {(showAdd || editingId) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit Pincode' : 'Add New Pincode'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pincode *</label>
              <input
                type="text"
                value={form.pincode}
                onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))}
                placeholder="560001"
                maxLength={6}
                disabled={!!editingId}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Area Name *</label>
              <input
                type="text"
                value={form.area_name}
                onChange={e => setForm(f => ({ ...f, area_name: e.target.value }))}
                placeholder="Koramangala"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Shipping Charge (₹)</label>
              <input
                type="number"
                value={form.shipping_charge}
                onChange={e => setForm(f => ({ ...f, shipping_charge: e.target.value }))}
                min="0"
                step="1"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-gray-400 mt-0.5">0 = free delivery</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Active?</label>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.is_active ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      form.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-600">{form.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>

          {formError && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editingId ? 'Save Changes' : 'Add Pincode'}
            </button>
            <button
              onClick={closeForm}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search + Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search pincode or area…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <span className="text-sm text-gray-500">{filtered.length} pincodes</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading pincodes…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Pincode</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Area Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Shipping Charge</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono font-medium text-gray-900">{p.pincode}</td>
                    <td className="px-5 py-3 text-gray-700">{p.area_name}</td>
                    <td className="px-5 py-3">
                      {p.shipping_charge === 0
                        ? <span className="text-green-600 text-xs font-medium">Free</span>
                        : <span>{formatCurrency(p.shipping_charge)}</span>
                      }
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        p.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        {deleteConfirmId === p.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(p.id)}
                              disabled={deletePincode.isPending}
                              className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-xs text-gray-500 px-2 py-1"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(p.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                      {search ? 'No pincodes match your search' : 'No pincodes added yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
