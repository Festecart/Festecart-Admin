import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import {
  useCoupons,
  useDeleteCoupon,
  useToggleCouponActive,
} from '@/hooks/useCoupons'
import type { CouponListRow } from '@/types/coupon'

const TYPE_LABELS: Record<string, string> = {
  flat:              'Flat ₹',
  percentage:        'Percentage %',
  shipping_discount: 'Shipping Discount',
  free_shipping:     'Free Shipping',
}

function ValueDisplay({ row }: { row: CouponListRow }) {
  if (row.type === 'free_shipping') return <span className="text-green-700 font-medium">Free</span>
  if (row.type === 'flat') return <span>₹{row.value.toLocaleString('en-IN')}</span>
  if (row.type === 'percentage') return <span>{row.value}%</span>
  if (row.type === 'shipping_discount') return <span>₹{row.value.toLocaleString('en-IN')} off shipping</span>
  return <span>{row.value}</span>
}

export default function Coupons() {
  const { data: coupons, isLoading, error } = useCoupons()
  const deleteMutation = useDeleteCoupon()
  const toggleMutation = useToggleCouponActive()
  const [deleteTarget, setDeleteTarget] = useState<CouponListRow | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleToggle = (row: CouponListRow) => {
    toggleMutation.mutate({ id: row.id, is_active: !row.is_active })
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      await deleteMutation.mutateAsync(deleteTarget.id)
    } finally {
      setDeletingId(null)
      setDeleteTarget(null)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coupons</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage discount codes and promotional offers</p>
        </div>
        <button
          onClick={() => navigate('/coupons/add')}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
        >
          <Plus size={16} /> Add Coupon
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={28} className="animate-spin text-gray-400" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          Failed to load coupons: {(error as Error).message}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && coupons?.length === 0 && (
        <div className="text-center py-20 border border-dashed border-gray-200 rounded-xl bg-white">
          <p className="text-gray-400 text-sm mb-3">No coupons yet</p>
          <button
            onClick={() => navigate('/coupons/add')}
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm px-4 py-2 rounded-lg"
          >
            <Plus size={14} /> Create your first coupon
          </button>
        </div>
      )}

      {/* Table */}
      {!isLoading && !error && (coupons?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Value</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Valid From</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Valid To</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Uses / Limit</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {coupons!.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    {/* Code */}
                    <td className="px-4 py-3">
                      <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-xs">
                        {row.code}
                      </span>
                    </td>
                    {/* Type */}
                    <td className="px-4 py-3 text-gray-600">{TYPE_LABELS[row.type] ?? row.type}</td>
                    {/* Value */}
                    <td className="px-4 py-3"><ValueDisplay row={row} /></td>
                    {/* Valid From */}
                    <td className="px-4 py-3 text-gray-500">{row.valid_from || '—'}</td>
                    {/* Valid To */}
                    <td className="px-4 py-3 text-gray-500">{row.valid_to || '—'}</td>
                    {/* Uses / Limit */}
                    <td className="px-4 py-3 text-gray-600">
                      {row.total_uses}
                      {row.total_usage_limit != null ? ` / ${row.total_usage_limit}` : ' / ∞'}
                    </td>
                    {/* Status toggle */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(row)}
                        disabled={toggleMutation.isPending}
                        aria-label={row.is_active ? 'Deactivate' : 'Activate'}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${row.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${row.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/coupons/${row.id}/edit`}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          aria-label="Edit"
                        >
                          <Pencil size={14} />
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(row)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          aria-label="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 text-lg">Delete Coupon</h3>
            <p className="text-sm text-gray-600">
              Are you sure you want to delete the coupon{' '}
              <span className="font-mono font-semibold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded">
                {deleteTarget.code}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={!!deletingId}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg"
              >
                {deletingId ? <Loader2 size={14} className="animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
