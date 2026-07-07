import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db, collection, doc, getDocs, addDoc, updateDoc, deleteDoc, orderBy, query, Timestamp } from '@/lib/firebase'
import { Plus, MoreVertical, Loader2, X } from 'lucide-react'

interface CourierVendor {
  id: string; name: string; tracking_url: string | null
  tracking_number_mandatory: boolean; created_at: string
}

function useCourierVendors() {
  return useQuery({
    queryKey: ['courier-vendors'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'courier_vendors'), orderBy('created_at', 'desc')))
      return snap.docs.map(d => {
        const data = d.data()
        const ts = data.created_at
        return {
          id: d.id, name: data.name, tracking_url: data.tracking_url ?? null,
          tracking_number_mandatory: data.tracking_number_mandatory ?? true,
          created_at: ts?.toDate ? ts.toDate().toISOString() : (ts ?? ''),
        } as CourierVendor
      })
    },
  })
}

interface VendorModalProps {
  vendor: CourierVendor | null; onClose: () => void
  onSave: (payload: Omit<CourierVendor, 'id' | 'created_at'>) => Promise<void>
  saving: boolean; error: string | null
}

function VendorModal({ vendor, onClose, onSave, saving, error }: VendorModalProps) {
  const [name, setName]             = useState(vendor?.name ?? '')
  const [trackingUrl, setTrackingUrl] = useState(vendor?.tracking_url ?? '')
  const [mandatory, setMandatory]   = useState(vendor?.tracking_number_mandatory ?? true)

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-base">{vendor ? 'Edit Courier Vendor' : 'Add Courier Vendor'}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Courier Vendor Name"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tracking URL</label>
            <input type="text" value={trackingUrl} onChange={e => setTrackingUrl(e.target.value)} placeholder="Tracking URL"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            <button type="button" onClick={() => setTrackingUrl(u => u + '{tracking_number}')}
              className="mt-2 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700">
              Tracking Number
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tracking Number mandatory?</label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="mandatory" checked={mandatory}  onChange={() => setMandatory(true)}  className="accent-gray-900 w-4 h-4" /> Yes
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="mandatory" checked={!mandatory} onChange={() => setMandatory(false)} className="accent-gray-900 w-4 h-4" /> No
              </label>
            </div>
          </div>
          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>
        <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Close</button>
          <button onClick={() => onSave({ name, tracking_url: trackingUrl || null, tracking_number_mandatory: mandatory })}
            disabled={saving || !name.trim()}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-60">
            {saving && <Loader2 size={13} className="animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function CourierVendors() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: vendors = [], isLoading } = useCourierVendors()
  const [showModal,     setShowModal]     = useState(false)
  const [editingVendor, setEditingVendor] = useState<CourierVendor | null>(null)
  const [menuOpen,      setMenuOpen]      = useState<string | null>(null)
  const [modalError,    setModalError]    = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const openAdd  = () => { setEditingVendor(null); setModalError(null); setShowModal(true) }
  const openEdit = (v: CourierVendor) => { setEditingVendor(v); setModalError(null); setShowModal(true) }

  const handleSave = async (payload: Omit<CourierVendor, 'id' | 'created_at'>) => {
    setSaving(true); setModalError(null)
    try {
      if (editingVendor) {
        await updateDoc(doc(db, 'courier_vendors', editingVendor.id), { ...payload, updated_at: Timestamp.now() })
      } else {
        await addDoc(collection(db, 'courier_vendors'), { ...payload, created_at: Timestamp.now() })
      }
      qc.invalidateQueries({ queryKey: ['courier-vendors'] })
      setShowModal(false)
    } catch (e) { setModalError((e as { message?: string })?.message ?? 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'courier_vendors', id))
    qc.invalidateQueries({ queryKey: ['courier-vendors'] })
    setDeleteConfirm(null); setMenuOpen(null)
  }

  const formatDate = (ts: string) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
  }

  return (
    <div className="min-h-screen bg-gray-50" onClick={() => setMenuOpen(null)}>
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">
              <Link to="/" className="hover:underline">Dashboard</Link>{' / '}
              <Link to="/shipping-zones" className="hover:underline">Shipping Zone</Link>{' / '}
              Courier vendors
            </p>
            <h1 className="text-xl font-bold text-gray-900">Courier vendors</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/shipping-zones')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button onClick={openAdd} className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
              <Plus size={14} /> Add Courier Vendor
            </button>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-5">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gray-400"><Loader2 className="animate-spin inline" size={20} /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Courier Vendor</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Date Added</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {vendors.map(v => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-medium text-gray-900">{v.name}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{formatDate(v.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="relative inline-block">
                        <button onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === v.id ? null : v.id) }}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><MoreVertical size={16} /></button>
                        {menuOpen === v.id && (
                          <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[120px] py-1">
                            <button onClick={() => { openEdit(v); setMenuOpen(null) }}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Edit</button>
                            {deleteConfirm === v.id ? (
                              <div className="px-4 py-2 space-y-1">
                                <p className="text-xs text-red-600 font-medium">Confirm delete?</p>
                                <div className="flex gap-2">
                                  <button onClick={() => handleDelete(v.id)} className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded">Yes</button>
                                  <button onClick={() => setDeleteConfirm(null)} className="text-xs text-gray-500 px-2 py-1">No</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(v.id)} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {vendors.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-10 text-center text-gray-400">No courier vendors yet</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showModal && <VendorModal vendor={editingVendor} onClose={() => setShowModal(false)} onSave={handleSave} saving={saving} error={modalError} />}
    </div>
  )
}
