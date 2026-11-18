import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { formatINR } from '@/lib/accounts'
import type { FinancialAccount, RecordPaymentInput } from '@/types/accounts'

const METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other']

export function PaymentForm({
  title,
  detail,
  outstandingPaise,
  accounts,
  saving,
  onClose,
  onSave,
}: {
  title: string
  detail: string
  outstandingPaise: number
  accounts: FinancialAccount[]
  saving: boolean
  onClose: () => void
  onSave: (input: RecordPaymentInput) => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState(accounts.find(item => item.active)?.id ?? '')
  const [reference, setReference] = useState('')
  const [method, setMethod] = useState(METHODS[0])
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const text = amount.trim()
      if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter a valid payment amount.')
      const [whole, fraction = ''] = text.split('.')
      const amountPaise = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
      if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0 || amountPaise > outstandingPaise) {
        throw new Error(`Enter an amount up to ${formatINR(outstandingPaise)}.`)
      }
      await onSave({ amount_paise: amountPaise, account_id: accountId, reference_no: reference, payment_method: method })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Payment could not be recorded.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="payment-form-title"
        className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="payment-form-title" className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{detail}</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">Outstanding: {formatINR(outstandingPaise)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="block text-sm font-medium text-slate-700">Payment amount (₹)
          <input type="number" min="0.01" max={outstandingPaise / 100} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Deposit account
          <select value={accountId} onChange={event => setAccountId(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
            {accounts.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name} · {item.type.toUpperCase()}</option>)}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Payment method
            <select value={method} onChange={event => setMethod(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
              {METHODS.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Unique reference
            <input value={reference} onChange={event => setReference(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
          <button disabled={saving || !accounts.some(item => item.active)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Record payment'}</button>
        </div>
      </form>
    </div>
  )
}
