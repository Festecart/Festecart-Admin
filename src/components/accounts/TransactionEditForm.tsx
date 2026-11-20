import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { formatINR, rupeesToPaise, UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID } from '@/lib/accounts'
import { festivalTagId } from '@/lib/festivalProducts'
import type { EditTransactionInput, FinancialAccount, FinancialTransaction } from '@/types/accounts'
import type { FestivalTag } from '@/types/accounts'

function inputDate(transaction: FinancialTransaction): string {
  const date = transaction.transaction_date.toDate()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function TransactionEditForm({
  transaction,
  accounts,
  festivalTags,
  saving,
  onClose,
  onSave,
}: {
  transaction: FinancialTransaction
  accounts: FinancialAccount[]
  festivalTags: FestivalTag[]
  saving: boolean
  onClose: () => void
  onSave: (input: EditTransactionInput) => Promise<void>
}) {
  const [date, setDate] = useState(inputDate(transaction))
  const [description, setDescription] = useState(transaction.description)
  const [category, setCategory] = useState(transaction.category_name)
  const [amount, setAmount] = useState((transaction.amount_paise / 100).toFixed(2))
  const [accountId, setAccountId] = useState(transaction.account_id)
  const [transferToAccountId, setTransferToAccountId] = useState(transaction.transfer_to_account_id ?? '')
  const [paymentMethod, setPaymentMethod] = useState(transaction.payment_method)
  const [festivalTagIdValue, setFestivalTagIdValue] = useState(
    transaction.festival_tag_id ?? (transaction.festival_tag ? festivalTagId(transaction.festival_tag) : ''),
  )
  const [error, setError] = useState('')
  const isUnallocatedExpensePayment = transaction.is_unallocated_expense_payment === true
  const availableAccounts = accounts.filter(account =>
    (account.type !== 'petty_cash' || account.id === transaction.account_id || account.id === transaction.transfer_to_account_id) &&
    (account.active || account.id === transaction.account_id || account.id === transaction.transfer_to_account_id),
  )
  const customFestivalTags = festivalTags.filter(tag => tag.is_custom)
  const existingTagId = transaction.festival_tag_id ?? (transaction.festival_tag ? festivalTagId(transaction.festival_tag) : '')
  const existingTag = existingTagId ? festivalTags.find(tag => tag.id === existingTagId) : undefined
  const availableFestivalTags = existingTagId && !customFestivalTags.some(tag => tag.id === existingTagId)
    ? [...customFestivalTags, existingTag ?? { id: existingTagId, name: transaction.festival_tag ?? existingTagId, is_custom: true, is_enabled: false }]
    : customFestivalTags
  const festivalTagName = availableFestivalTags.find(tag => tag.id === festivalTagIdValue)?.name ?? null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await onSave({
        transaction_date: date,
        description,
        category_name: category,
        amount_paise: rupeesToPaise(amount),
        account_id: isUnallocatedExpensePayment ? UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID : accountId,
        transfer_to_account_id: transaction.type === 'transfer' ? transferToAccountId : null,
        payment_method: paymentMethod,
        festival_tag: festivalTagName,
        festival_tag_id: festivalTagIdValue || null,
      })
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
            <p className="mt-1 text-xs text-slate-500">{isUnallocatedExpensePayment ? 'This expense payment is not linked to a financial account.' : 'Changing the amount or account recalculates linked balances. Transaction type and reference stay fixed.'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="block text-sm font-medium text-slate-700">Transaction date
          <input type="date" value={date} onChange={event => setDate(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Amount (₹)
          <input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        {!isUnallocatedExpensePayment && <label className="block text-sm font-medium text-slate-700">{transaction.type === 'transfer' ? 'From account' : 'Account'}
          <select value={accountId} onChange={event => setAccountId(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
            {availableAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>}
        {transaction.type === 'transfer' && (
          <label className="block text-sm font-medium text-slate-700">To account
            <select value={transferToAccountId} onChange={event => setTransferToAccountId(event.target.value)} required className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
              {availableAccounts.filter(account => account.id !== accountId).map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium text-slate-700">Description
          <input value={description} onChange={event => setDescription(event.target.value)} required maxLength={250} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Category
          <input value={category} onChange={event => setCategory(event.target.value)} required maxLength={80} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Payment method
          <input value={paymentMethod} onChange={event => setPaymentMethod(event.target.value)} maxLength={80} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Tag
          <select value={festivalTagIdValue} onChange={event => setFestivalTagIdValue(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
            <option value="">No tag</option>
            {availableFestivalTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
          </select>
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
