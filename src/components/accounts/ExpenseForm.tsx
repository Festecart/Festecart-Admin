import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { formatINR } from '@/lib/accounts'
import type { FinancialAccount, FinancialCategory, NewExpenseInput, VendorOption } from '@/types/accounts'

const CATEGORIES = ['Purchases', 'Packaging', 'Transportation', 'Marketing', 'Salaries', 'Delivery', 'Utilities', 'Miscellaneous']
const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Other']

function today(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function paise(value: string, label: string, allowZero = false): number {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`Enter a valid ${label}.`)
  const [whole, fraction = ''] = normalized.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result) || (allowZero ? result < 0 : result <= 0)) throw new Error(`Enter a valid ${label}.`)
  return result
}

export function ExpenseForm({
  accounts,
  vendors,
  categories,
  onCreateCategory,
  saving,
  onClose,
  onSave,
}: {
  accounts: FinancialAccount[]
  vendors: VendorOption[]
  categories: FinancialCategory[]
  onCreateCategory: (name: string, type: 'expense') => Promise<void>
  saving: boolean
  onClose: () => void
  onSave: (input: NewExpenseInput) => Promise<void>
}) {
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(today)
  const [dueDate, setDueDate] = useState('')
  const [amount, setAmount] = useState('')
  const [paid, setPaid] = useState('0')
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [paymentReference, setPaymentReference] = useState('')
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0])
  const [error, setError] = useState('')
  const vendor = vendors.find(item => item.id === vendorId)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const categoryName = category === '__custom' ? customCategory.trim() : category
      if (category === '__custom') {
        if (!categoryName) throw new Error('Enter a category name.')
        await onCreateCategory(categoryName, 'expense')
      }
      await onSave({
        description,
        category_name: categoryName,
        vendor_id: vendorId || null,
        vendor_name: vendor?.name ?? '',
        reference_no: reference,
        transaction_date: date,
        due_date: dueDate,
        amount_paise: paise(amount, 'expense amount'),
        paid_paise: paise(paid || '0', 'paid amount', true),
        account_id: paid.trim() && Number(paid) > 0 ? accountId : null,
        payment_reference: paymentReference,
        payment_method: paymentMethod,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Expense could not be saved.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="expense-form-title"
        className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="expense-form-title" className="text-lg font-semibold text-slate-900">Record an expense</h2>
            <p className="mt-1 text-sm text-slate-500">The unpaid amount remains a payable; only paid amounts affect account balances.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Description
            <input value={description} onChange={event => setDescription(event.target.value)} required maxLength={250} placeholder="What was purchased or paid for?"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Category
            <select value={category} onChange={event => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
              {[...new Set([...CATEGORIES, ...categories.filter(item => item.type === 'expense').map(item => item.name)])].map(item => <option key={item}>{item}</option>)}
              <option value="__custom">Add custom category…</option>
            </select>
          </label>
          {category === '__custom' && (
            <label className="block text-sm font-medium text-slate-700">Custom category
              <input value={customCategory} onChange={event => setCustomCategory(event.target.value)} required maxLength={80} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
          )}
          <label className="block text-sm font-medium text-slate-700">Vendor (optional)
            <select value={vendorId} onChange={event => setVendorId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
              <option value="">No linked vendor</option>
              {vendors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Invoice / reference
            <input value={reference} onChange={event => setReference(event.target.value)} maxLength={200} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Expense date
            <input type="date" value={date} onChange={event => setDate(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Due date
            <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Total amount (₹)
            <input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          <label className="block text-sm font-medium text-slate-700">Paid now (₹)
            <input type="number" min="0" step="0.01" value={paid} onChange={event => setPaid(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
          {Number(paid) > 0 && (
            <>
              <label className="block text-sm font-medium text-slate-700">Payment account
                <select value={accountId} onChange={event => setAccountId(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                  {accounts.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name} · {item.type.toUpperCase()}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Payment method
                <select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                  {PAYMENT_METHODS.map(item => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Unique payment reference
                <input value={paymentReference} onChange={event => setPaymentReference(event.target.value)} required maxLength={200} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" placeholder="Bank reference, UPI ID, or receipt number" />
              </label>
            </>
          )}
        </div>
        {amount && paid && Number.isFinite(Number(amount) - Number(paid)) && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Remaining payable: {formatINR(Math.max(0, Math.round((Number(amount) - Number(paid)) * 100)))}</p>
        )}
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save expense'}</button>
        </div>
      </form>
    </div>
  )
}
