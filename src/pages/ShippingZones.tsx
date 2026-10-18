import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db, collection, doc, getDocs, deleteDoc, updateDoc, query, orderBy, Timestamp } from '@/lib/firebase'
import { MoreVertical, Plus, Loader2 } from 'lucide-react'

interface ShippingZone { id: string; name: string; location: string | null; is_active?: boolean; created_at: string }
interface ShippingMethod { id: string; zone_id: string; name: string }

function useShippingZones() {
  return useQuery({
    queryKey: ['shipping-zones'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'shipping_zones'), orderBy('created_at', 'asc')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ShippingZone))
    },
  })
}

function useShippingMethods() {
  return useQuery({
    queryKey: ['shipping-methods-all'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'shipping_methods'))
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ShippingMethod))
    },
  })
}

function useDeleteZone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => { await deleteDoc(doc(db, 'shipping_zones', id)) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping-zones'] })
      qc.invalidateQueries({ queryKey: ['shipping-methods-all'] })
    },
  })
}

function useToggleZoneActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      await updateDoc(doc(db, 'shipping_zones', id), { is_active, updated_at: Timestamp.now() })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-zones'] }),
  })
}

function ZoneMenu({ zone, onClose, anchorRef }: {
  zone: ShippingZone; onClose: () => void; anchorRef: React.RefObject<HTMLButtonElement>
}) {
  const navigate = useNavigate()
  const deleteZone = useDeleteZone()
  const menuRef = useRef<HTMLDivElement>(null)
  const rect = anchorRef.current?.getBoundingClientRect()
  const top  = (rect?.bottom ?? 0) + window.scrollY + 4
  const left = (rect?.right  ?? 0) + window.scrollX - 144

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          !anchorRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return createPortal(
    <div ref={menuRef} style={{ position: 'absolute', top, left, zIndex: 9999, minWidth: 144 }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl py-1">
      <button onClick={() => { navigate(`/shipping-zones/${zone.id}/methods`); onClose() }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">View Methods</button>
      <button onClick={() => { navigate(`/shipping-zones/${zone.id}/edit`); onClose() }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Edit Zone</button>
      <button onClick={() => { navigate(`/shipping-zones/${zone.id}/methods/add`); onClose() }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">Add Method</button>
      <button onClick={async () => { await deleteZone.mutateAsync(zone.id); onClose() }}
        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete Zone</button>
    </div>,
    document.body
  )
}

export default function ShippingZones() {
  const navigate = useNavigate()
  const { data: zones = [], isLoading } = useShippingZones()
  const { data: methods = [] }          = useShippingMethods()
  const toggleZoneActive = useToggleZoneActive()
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 8
  const total = zones.length
  const paged = zones.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const methodCount = (zoneId: string) => methods.filter(m => m.zone_id === zoneId).length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-1">
            <Link to="/" className="hover:underline">Dashboard</Link> / Shipping Zones
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Shipping Zones</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/shipping-zones/vendors')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50">
            Courier Vendors
          </button>
          <button onClick={() => navigate('/shipping-zones/add')}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
            <Plus size={14} /> Add Shipping Zone
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400"><Loader2 className="animate-spin inline" size={20} /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Zone</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Location</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Shipping Methods</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paged.map(zone => {
                  const count = methodCount(zone.id)
                  const isActive = zone.is_active !== false
                  return (
                    <tr key={zone.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3">
                        <button onClick={() => navigate(`/shipping-zones/${zone.id}/edit`)}
                          className="font-medium text-gray-900 hover:text-gray-600 hover:underline text-left">
                          {zone.name}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-gray-400 text-xs">{zone.location || ''}</td>
                      <td className="px-5 py-3">
                        {count > 0 ? (
                          <button onClick={() => navigate(`/shipping-zones/${zone.id}/methods`)}
                            className="text-xs text-gray-500 hover:underline">
                            {count} Shipping Method{count !== 1 ? 's' : ''}
                          </button>
                        ) : (
                          <button onClick={() => navigate(`/shipping-zones/${zone.id}/methods/add`)}
                            className="text-xs text-gray-700 hover:underline font-medium">
                            Add Shipping Method
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isActive}
                            aria-label={`${isActive ? 'Disable' : 'Enable'} ${zone.name}`}
                            title={`${isActive ? 'Disable' : 'Enable'} ${zone.name}`}
                            disabled={toggleZoneActive.isPending && toggleZoneActive.variables?.id === zone.id}
                            onClick={() => {
                              toggleZoneActive.reset()
                              toggleZoneActive.mutate({ id: zone.id, is_active: !isActive })
                            }}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                          <span className={`text-xs font-medium ${isActive ? 'text-green-700' : 'text-gray-500'}`}>
                            {isActive ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button ref={el => { btnRefs.current[zone.id] = el }}
                          onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === zone.id ? null : zone.id) }}
                          className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                          <MoreVertical size={16} />
                        </button>
                        {menuOpen === zone.id && (
                          <ZoneMenu zone={zone} onClose={() => setMenuOpen(null)}
                            anchorRef={{ current: btnRefs.current[zone.id] } as React.RefObject<HTMLButtonElement>} />
                        )}
                      </td>
                    </tr>
                  )
                })}
                {toggleZoneActive.isError && (
                  <tr>
                    <td colSpan={5} className="px-5 py-3 text-sm text-red-700 bg-red-50" role="alert">
                      Could not update shipping zone status: {(toggleZoneActive.error as Error).message}
                    </td>
                  </tr>
                )}
                {paged.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">No shipping zones yet</td></tr>
                )}
              </tbody>
            </table>
            {total > PER_PAGE && (
              <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 text-right">
                {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, total)} of {total}
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="ml-3 px-2 py-1 border rounded disabled:opacity-40">Prev</button>
                <button disabled={page * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}
                  className="ml-1 px-2 py-1 border rounded disabled:opacity-40">Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
