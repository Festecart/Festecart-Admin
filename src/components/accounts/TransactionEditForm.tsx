import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { formatINR } from '@/lib/accounts'
import type { EditTransactionInput, FinancialTransaction } from '@/types/accounts'

function inputDate(transaction: FinancialTransaction): string {
  const date = transaction.transaction_date.toDate()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function TransactionEditForm({
  transaction,
  saving,
  onClose,
  onSave,
}: {
  transaction: FinancialTransaction
  saving: boolean
  onClose: () => void
  onSave: (input: EditTransactionInput) => Promise<void>
}) {
  const [date, setDate] = useState(inputDate(transaction))
  const [description, setDescription] = useState(transaction.description)
  const [category, setCategory] = useState(transaction.category_name)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await onSave({ transaction_date: date, description, category_name: category })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Transaction could not be updated.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="edit-transaction-title"
        className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="edit-transaction-title" className="text-lg font-semibold text-slate-900">Edit transaction details</h2>
            <p className="mt-1 text-sm text-slate-500">{transaction.transaction_id} · {formatINR(transaction.amount_paise)}</p>
            <p className="mt-1 text-xs text-slate-500">Posted amount, account, and reference are locked to preserve the ledger balance.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="block text-sm font-medium text-slate-700">Transaction date
          <input type="date" value={date} onChange={event => setDate(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Description
          <input value={description} onChange={event => setDescription(event.target.value)} required maxLength={250} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Category
          <input value={category} onChange={event => setCategory(event.target.value)} required maxLength={80} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save details'}</button>
        </div>
      </form>
    </div>
  )
}
