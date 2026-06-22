import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Plus, MoreVertical, Loader2 } from 'lucide-react'

interface ShippingMethod {
  id: string
  zone_id: string
  name: string
  delivery_min: number
  delivery_max: number
  time_unit: string
  condition_type: string | null
  price_min: number | null
  price_max: number | null
  weight_min: number | null
  weight_max: number | null
  free_shipping: boolean
  charge: number
  charge_type: string
  created_at: string
}

function formatRange(m: ShippingMethod): string {
  if (m.condition_type === 'price' && m.price_min != null && m.price_max != null)
    return `₹${m.price_min.toFixed(2)} – ₹${m.price_max.toFixed(2)}`
  if (m.condition_type === 'weight' && m.weight_min != null && m.weight_max != null)
    return `${m.weight_min} kg – ${m.weight_max} kg`
  return '—'
}

function formatCharge(m: ShippingMethod): string {
  if (m.free_shipping) return 'Free Shipping'
  if (m.charge_type === 'percentage') return `${m.charge}%`
  return `₹ ${m.charge.toFixed(0)}`
}

export default function ShippingMethodsList() {
  const { zoneId } = useParams<{ zoneId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const PER_PAGE = 8

  const { data: zone } = useQuery({
    queryKey: ['shipping-zone', zoneId],
    queryFn: async () => {
      const { data } = await supabase.from('shipping_zones').select('id, name').eq('id', zoneId!).single()
      return data
    },
    enabled: !!zoneId,
  })

  const { data: methods = [], isLoading } = useQuery({
    queryKey: ['shipping-methods', zoneId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_methods')
        .select('*')
        .eq('zone_id', zoneId!)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as ShippingMethod[]
    },
    enabled: !!zoneId,
  })

  const deleteMethod = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shipping_methods').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipping-methods', zoneId] }),
  })

  const total = methods.length
  const paged = methods.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div className="min-h-screen bg-gray-50" onClick={() => setMenuOpen(null)}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">
              <Link to="/" className="hover:underline">Dashboard</Link>{' / '}
              <Link to="/shipping-zones" className="hover:underline">Shipping Zones</Link>{' / '}
              Shipping Methods of "{zone?.name ?? '…'}"
            </p>
            <h1 className="text-xl font-bold text-gray-900">
              Shipping Methods of "{zone?.name ?? '…'}"
            </h1>
          </div>
          <button
            onClick={() => navigate(`/shipping-zones/${zoneId}/methods/add`)}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
            <Plus size={14} /> Add Shipping Method
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-gray-400">
              <Loader2 className="animate-spin inline" size={20} />
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Range</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Shipping Charges</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Est. Delivery</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paged.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 font-medium text-gray-900">{m.name}</td>
                      <td className="px-5 py-3 text-gray-600">{formatRange(m)}</td>
                      <td className="px-5 py-3 text-gray-700 font-medium">{formatCharge(m)}</td>
                      <td className="px-5 py-3 text-gray-600">
                        {m.delivery_min} – {m.delivery_max} {m.time_unit}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Active
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === m.id ? null : m.id) }}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                            <MoreVertical size={16} />
                          </button>
                          {menuOpen === m.id && (
                            <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[130px] py-1">
                              <button
                                onClick={() => { navigate(`/shipping-zones/${zoneId}/methods/${m.id}/edit`); setMenuOpen(null) }}
                                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50">
                                Edit
                              </button>
                              <button
                                onClick={async () => { await deleteMethod.mutateAsync(m.id); setMenuOpen(null) }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paged.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                        No shipping methods yet.{' '}
                        <button
                          onClick={() => navigate(`/shipping-zones/${zoneId}/methods/add`)}
                          className="text-gray-700 underline font-medium">
                          Add one
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {total > 0 && (
                <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 text-right">
                  Currently viewing {Math.min((page - 1) * PER_PAGE + 1, total)}–{Math.min(page * PER_PAGE, total)} out of {total}
                  {total > PER_PAGE && (
                    <>
                      <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="ml-3 px-2 py-1 border rounded disabled:opacity-40">Prev</button>
                      <button disabled={page * PER_PAGE >= total} onClick={() => setPage(p => p + 1)} className="ml-1 px-2 py-1 border rounded disabled:opacity-40">Next</button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
