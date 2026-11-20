import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { FinancialAccountType } from '@/types/accounts'

export function AccountForm({
  initialType = 'cash',
  saving,
  onClose,
  onSave,
}: {
  initialType?: FinancialAccountType
  saving: boolean
  onClose: () => void
  onSave: (input: { name: string; type: FinancialAccountType; opening_balance_paise: number }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<FinancialAccountType>(initialType)
  const [openingBalance, setOpeningBalance] = useState('0')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const text = openingBalance.trim()
      if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a valid opening balance.')
      const [whole, fraction = ''] = text.split('.')
      await onSave({
        name,
        type,
        opening_balance_paise: Number(whole) * 100 + Number(fraction.padEnd(2, '0')),
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Account could not be saved.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="account-form-title"
        className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="account-form-title" className="text-lg font-semibold text-slate-900">Add account</h2>
            <p className="mt-1 text-sm text-slate-500">The opening balance is not treated as income.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Account name
          <input value={name} onChange={event => setName(event.target.value)} required maxLength={100}
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-slate-500" placeholder="e.g. Main Bank" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Type
            <select value={type} onChange={event => setType(event.target.value as FinancialAccountType)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
              <option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Opening balance (₹)
            <input type="number" min="0" step="0.01" value={openingBalance} onChange={event => setOpeningBalance(event.target.value)} required
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save account'}
          </button>
        </div>
      </form>
    </div>
  )
}
