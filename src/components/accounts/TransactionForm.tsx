import { useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, FileText, X } from 'lucide-react'
import { formatINR } from '@/lib/accounts'
import type {
  FinancialAccount,
  FinancialAccountType,
  FinancialCategory,
  FinancialTransactionType,
  NewTransactionInput,
} from '@/types/accounts'

const EXPENSE_CATEGORIES = ['Purchases', 'Packaging', 'Transportation', 'Marketing', 'Salaries', 'Delivery', 'Utilities', 'Miscellaneous']
const INCOME_CATEGORIES = ['Sales Receipt', 'Other Income']

function localDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function amountToPaise(value: string): number {
  const text = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter an amount with no more than two decimal places.')
  const [whole, fraction = ''] = text.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter an amount greater than ₹0.')
  return amount
}

function actionTitle(type: Exclude<FinancialTransactionType, 'opening_balance'>, pettyCash: boolean): string {
  if (pettyCash) return 'Petty cash spending'
  if (type === 'income') return 'Money received'
  if (type === 'expense') return 'Money paid'
  return 'Transfer money'
}

export function TransactionForm({
  accounts,
  financialCategories,
  onCreateCategory,
  saving,
  type,
  accountType,
  onClose,
  onSave,
}: {
  accounts: FinancialAccount[]
  financialCategories: FinancialCategory[]
  onCreateCategory: (name: string, type: 'income' | 'expense') => Promise<void>
  saving: boolean
  type: Exclude<FinancialTransactionType, 'opening_balance'>
  accountType?: FinancialAccountType
  onClose: () => void
  onSave: (input: NewTransactionInput, receipt?: File) => Promise<void>
}) {
  const availableAccounts = accounts.filter(account => account.active && (!accountType || account.type === accountType))
  const [date, setDate] = useState(localDate)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [partyName, setPartyName] = useState('')
  const [category, setCategory] = useState(type === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0])
  const [customCategory, setCustomCategory] = useState('')
  const [accountId, setAccountId] = useState(availableAccounts[0]?.id ?? '')
  const [destinationId, setDestinationId] = useState(availableAccounts.find(item => item.id !== availableAccounts[0]?.id)?.id ?? '')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [reviewInput, setReviewInput] = useState<NewTransactionInput | null>(null)
  const [error, setError] = useState('')
  const title = actionTitle(type, accountType === 'petty_cash')
  const relevantCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const chosenCategory = category === '__custom' ? customCategory.trim() : category
  const selectedAccount = availableAccounts.find(account => account.id === accountId)
  const selectedDestination = availableAccounts.find(account => account.id === destinationId)

  function review(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      if (!description.trim()) throw new Error('Add a short description.')
      if (type === 'transfer' && (!destinationId || accountId === destinationId)) {
        throw new Error('Choose two different accounts.')
      }
      if (type !== 'transfer' && category === '__custom' && !chosenCategory) {
        throw new Error('Enter a category.')
      }
      const amountPaise = amountToPaise(amount)
      const uniqueReference = reference.trim() || `MANUAL-${crypto.randomUUID()}`
      setReviewInput({
        type,
        transaction_date: date,
        reference_no: uniqueReference,
        description: description.trim(),
        category_name: type === 'transfer' ? 'Account Transfer' : chosenCategory,
        amount_paise: amountPaise,
        account_id: accountId,
        transfer_to_account_id: type === 'transfer' ? destinationId : null,
        party_name: type === 'transfer' ? undefined : partyName.trim() || undefined,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check the details and try again.')
    }
  }

  async function confirmSave() {
    if (!reviewInput) return
    setError('')
    try {
      if (category === '__custom') {
        await onCreateCategory(chosenCategory, type === 'income' ? 'income' : 'expense')
      }
      await onSave(reviewInput, receipt ?? undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The record could not be saved.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="transaction-form-title"
        className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="transaction-form-title" className="text-lg font-semibold text-slate-900">
              {reviewInput ? 'Review before saving' : title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {reviewInput ? 'Check that everything looks right.' : 'Enter the details. You can review them before saving.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {reviewInput ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <dt className="text-slate-500">Type</dt><dd className="text-right font-medium">{title}</dd>
              <dt className="text-slate-500">Amount</dt><dd className="text-right font-semibold">{formatINR(reviewInput.amount_paise)}</dd>
              <dt className="text-slate-500">Date</dt><dd className="text-right">{new Date(`${reviewInput.transaction_date}T00:00:00`).toLocaleDateString('en-IN')}</dd>
              <dt className="text-slate-500">{type === 'transfer' ? 'From account' : 'Account'}</dt><dd className="text-right">{selectedAccount?.name ?? 'Choose an account'}</dd>
              {type === 'transfer' && <><dt className="text-slate-500">To account</dt><dd className="text-right">{selectedDestination?.name ?? 'Choose an account'}</dd></>}
              {type !== 'transfer' && <><dt className="text-slate-500">Category</dt><dd className="text-right">{reviewInput.category_name}</dd></>}
              {reviewInput.party_name && <><dt className="text-slate-500">Customer or vendor</dt><dd className="text-right">{reviewInput.party_name}</dd></>}
              <dt className="text-slate-500">Description</dt><dd className="break-words text-right">{reviewInput.description}</dd>
              {receipt && <><dt className="text-slate-500">Receipt</dt><dd className="flex items-center justify-end gap-1 text-right"><FileText size={14} />{receipt.name}</dd></>}
            </dl>
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setReviewInput(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">Back to edit</button>
              <button type="button" disabled={saving} onClick={() => void confirmSave()}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Confirm and save'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={review} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Amount (₹)
                <input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Date
                <input type="date" value={date} onChange={event => setDate(event.target.value)} required
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-medium text-slate-700">{type === 'transfer' ? 'From account' : 'Account'}
                <select value={accountId} onChange={event => setAccountId(event.target.value)} required
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                  {availableAccounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}
                </select>
              </label>
              {type === 'transfer' ? (
                <label className="block text-sm font-medium text-slate-700">To account
                  <select value={destinationId} onChange={event => setDestinationId(event.target.value)} required
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                    {availableAccounts.filter(account => account.id !== accountId).map(account => <option value={account.id} key={account.id}>{account.name}</option>)}
                  </select>
                </label>
              ) : (
                <label className="block text-sm font-medium text-slate-700">Category
                  <select value={category} onChange={event => setCategory(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                    {[...new Set([...relevantCategories, ...financialCategories.filter(item => item.type === type).map(item => item.name)])].map(item => <option key={item}>{item}</option>)}
                    <option value="__custom">Add a category…</option>
                  </select>
                </label>
              )}
              {type !== 'transfer' && category === '__custom' && (
                <label className="block text-sm font-medium text-slate-700">Category name
                  <input value={customCategory} onChange={event => setCustomCategory(event.target.value)} required maxLength={80}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Description
                <input value={description} onChange={event => setDescription(event.target.value)} required maxLength={250}
                  placeholder="What was the money for?"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              {type !== 'transfer' && (
                <>
                  <label className="block text-sm font-medium text-slate-700">Customer or vendor (optional)
                    <input value={partyName} onChange={event => setPartyName(event.target.value)} maxLength={120}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">Reference (optional)
                    <input value={reference} onChange={event => setReference(event.target.value)} maxLength={200}
                      placeholder="Receipt or payment reference"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Receipt (optional)
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                      onChange={event => setReceipt(event.target.files?.[0] ?? null)}
                      className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
                    <span className="mt-1 block text-xs font-normal text-slate-500">PDF, JPEG, PNG, or WebP under 10 MB.</span>
                  </label>
                </>
              )}
            </div>
            {type === 'transfer' && <p className="text-xs text-slate-500">Transfers update both account balances without changing Money Received or Money Spent.</p>}
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
              <button disabled={saving || !availableAccounts.length} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {type === 'income' ? <ArrowDownLeft size={15} /> : type === 'expense' ? <ArrowUpRight size={15} /> : <ArrowLeftRight size={15} />}
                Review
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
