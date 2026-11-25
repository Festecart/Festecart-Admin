import { useRef, useState, type FormEvent } from 'react'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, FileText, X } from 'lucide-react'
import {
  DEFAULT_FINANCIAL_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  formatINR,
  PETTY_CASH_TRANSACTION_ACCOUNT_ID,
} from '@/lib/accounts'
import type {
  FinancialAccount,
  FinancialAccountType,
  FinancialCategory,
  FinancialTransactionType,
  FinancialTransaction,
  EditTransactionInput,
  FestivalTag,
  NewTransactionInput,
} from '@/types/accounts'

const EXPENSE_CATEGORIES = DEFAULT_FINANCIAL_CATEGORIES
const INCOME_CATEGORIES = DEFAULT_INCOME_CATEGORIES

function localDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
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
  festivalTags,
  onCreateCategory,
  saving,
  type,
  accountType,
  onClose,
  onSave,
  initialTransaction,
  onEditSave,
}: {
  accounts: FinancialAccount[]
  financialCategories: FinancialCategory[]
  festivalTags: FestivalTag[]
  onCreateCategory: (name: string, type: 'income' | 'expense') => Promise<void>
  saving: boolean
  type: Exclude<FinancialTransactionType, 'opening_balance'>
  accountType?: FinancialAccountType
  onClose: () => void
  onSave?: (input: NewTransactionInput, receipt?: File) => Promise<void>
  initialTransaction?: FinancialTransaction
  onEditSave?: (input: EditTransactionInput) => Promise<void>
}) {
  const isPettyCash = type === 'expense' && accountType === 'petty_cash'
  const availableAccounts = isPettyCash
    ? []
    : accounts.filter(account => account.active && account.type !== 'petty_cash' && (!accountType || account.type === accountType))
  const [date, setDate] = useState(initialTransaction
    ? localDateString(initialTransaction.transaction_date.toDate())
    : localDate())
  const [amount, setAmount] = useState(initialTransaction ? (initialTransaction.amount_paise / 100).toFixed(2) : '')
  const [reference, setReference] = useState(initialTransaction?.reference_no ?? '')
  const [description, setDescription] = useState(initialTransaction?.description ?? '')
  const [partyName, setPartyName] = useState(initialTransaction?.party_name ?? '')
  const [festivalTagIdValue, setFestivalTagIdValue] = useState(initialTransaction?.festival_tag_id ?? '')
  const [category, setCategory] = useState(initialTransaction?.category_name ?? (type === 'income' ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]))
  const [customCategory, setCustomCategory] = useState('')
  const [accountId, setAccountId] = useState(availableAccounts[0]?.id ?? '')
  const [destinationId, setDestinationId] = useState(availableAccounts.find(item => item.id !== availableAccounts[0]?.id)?.id ?? '')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [reviewInput, setReviewInput] = useState<NewTransactionInput | null>(null)
  const [error, setError] = useState('')
  const title = initialTransaction ? 'Edit petty cash spending' : actionTitle(type, isPettyCash)
  const relevantCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const categoryOptions = [...new Set([
    ...relevantCategories,
    ...financialCategories.filter(item => item.type === type && item.is_enabled !== false).map(item => item.name),
  ])]
  const chosenCategory = category === '__custom' ? customCategory.trim() : category
  const selectedAccount = availableAccounts.find(account => account.id === accountId)
  const selectedDestination = availableAccounts.find(account => account.id === destinationId)
  const availableFestivalTags = festivalTags.filter(tag => tag.is_custom)
  const festivalTagName = availableFestivalTags.find(tag => tag.id === festivalTagIdValue)?.name ?? null
  const isSubmitting = useRef(false)
  const generatedReference = useRef('')

  function createInput(requireDescription: boolean, referenceNo: string): NewTransactionInput {
    if (requireDescription && !description.trim()) throw new Error('Add a short description.')
    if (type === 'transfer' && (!destinationId || accountId === destinationId)) {
      throw new Error('Choose two different accounts.')
    }
    if (type !== 'transfer' && !chosenCategory) {
      throw new Error('Choose a category.')
    }
    if (!date) throw new Error('Choose a date.')
    return {
      type,
      transaction_date: date,
      reference_no: referenceNo,
      description: description.trim(),
      category_name: type === 'transfer' ? 'Account Transfer' : chosenCategory,
      amount_paise: amountToPaise(amount),
      account_id: isPettyCash ? PETTY_CASH_TRANSACTION_ACCOUNT_ID : accountId,
      transfer_to_account_id: type === 'transfer' ? destinationId : null,
      party_name: type === 'transfer' ? undefined : partyName.trim() || undefined,
      festival_tag: festivalTagName,
      festival_tag_id: festivalTagIdValue || null,
    }
  }

  function review(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const uniqueReference = reference.trim() || `MANUAL-${crypto.randomUUID()}`
      setReviewInput(createInput(true, uniqueReference))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Check the details and try again.')
    }
  }

  async function savePettyCash(event: FormEvent) {
    event.preventDefault()
    if (saving || isSubmitting.current) return
    isSubmitting.current = true
    setError('')
    try {
      const input = createInput(false, reference.trim())
      if (category === '__custom') {
        await onCreateCategory(chosenCategory, 'expense')
      }
      if (initialTransaction) {
        if (!onEditSave) throw new Error('Petty cash spending editing is unavailable.')
        await onEditSave({
          transaction_date: input.transaction_date,
          description: input.description,
          category_name: input.category_name,
          amount_paise: input.amount_paise,
          account_id: PETTY_CASH_TRANSACTION_ACCOUNT_ID,
          transfer_to_account_id: null,
          payment_method: '',
          festival_tag: input.festival_tag ?? null,
          festival_tag_id: input.festival_tag_id ?? null,
          is_petty_cash_spending: true,
          reference_no: input.reference_no,
          party_name: input.party_name ?? null,
        })
      } else {
        if (!generatedReference.current) generatedReference.current = `MANUAL-${crypto.randomUUID()}`
        if (!onSave) throw new Error('Petty cash spending is unavailable.')
        await onSave({
          ...input,
          is_petty_cash_spending: true,
          idempotency_key: generatedReference.current,
        }, receipt ?? undefined)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The record could not be saved.')
    } finally {
      isSubmitting.current = false
    }
  }

  async function confirmSave() {
    if (!reviewInput) return
    setError('')
    try {
      if (!onSave) throw new Error('Transaction saving is unavailable.')
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
        className={`max-h-[92vh] w-full ${isPettyCash ? 'max-w-3xl' : 'max-w-xl'} space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="transaction-form-title" className="text-lg font-semibold text-slate-900">{reviewInput ? 'Review before saving' : title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {reviewInput ? 'Check that everything looks right.' : isPettyCash ? 'Enter the spending details.' : 'Enter the details. You can review them before saving.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>

        {isPettyCash ? (
          <form onSubmit={event => void savePettyCash(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">Amount (₹)
                <input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Date
                <input type="date" value={date} onChange={event => setDate(event.target.value)} required
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Category
                <select value={category} onChange={event => setCategory(event.target.value)} required
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                  {initialTransaction?.category_name && !categoryOptions.includes(initialTransaction.category_name) && (
                    <option value={initialTransaction.category_name}>Existing: {initialTransaction.category_name}</option>
                  )}
                  {categoryOptions.map(item => <option key={item}>{item}</option>)}
                  <option value="__custom">Add a category…</option>
                </select>
              </label>
              {category === '__custom' && (
                <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Category name
                  <input value={customCategory} onChange={event => setCustomCategory(event.target.value)} required maxLength={80}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
                </label>
              )}
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Description (Optional)
                <input value={description} onChange={event => setDescription(event.target.value)} maxLength={250}
                  placeholder="What was the money for?"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Tag
                <select value={festivalTagIdValue} onChange={event => setFestivalTagIdValue(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                  <option value="">No tag</option>
                  {availableFestivalTags.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Customer or Vendor (Optional)
                <input value={partyName} onChange={event => setPartyName(event.target.value)} maxLength={120}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Reference (Optional)
                <input value={reference} onChange={event => setReference(event.target.value)} maxLength={200}
                  placeholder="Receipt or payment reference"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              {!initialTransaction && <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Receipt (Optional)
                <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={event => setReceipt(event.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
                <span className="mt-1 block text-xs font-normal text-slate-500">PDF, JPEG, PNG, or WebP under 10 MB.</span>
              </label>}
            </div>
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" disabled={saving} onClick={onClose}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        ) : reviewInput ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm">
              <dt className="text-slate-500">Type</dt><dd className="text-right font-medium">{title}</dd>
              <dt className="text-slate-500">Amount</dt><dd className="text-right font-semibold">{formatINR(reviewInput.amount_paise)}</dd>
              <dt className="text-slate-500">Date</dt><dd className="text-right">{new Date(`${reviewInput.transaction_date}T00:00:00`).toLocaleDateString('en-IN')}</dd>
              <dt className="text-slate-500">{type === 'transfer' ? 'From account' : 'Account'}</dt><dd className="text-right">{selectedAccount?.name ?? 'Choose an account'}</dd>
              {type === 'transfer' && <><dt className="text-slate-500">To account</dt><dd className="text-right">{selectedDestination?.name ?? 'Choose an account'}</dd></>}
              {type !== 'transfer' && <><dt className="text-slate-500">Category</dt><dd className="text-right">{reviewInput.category_name}</dd></>}
              {reviewInput.party_name && <><dt className="text-slate-500">Customer or vendor</dt><dd className="text-right">{reviewInput.party_name}</dd></>}
              {reviewInput.festival_tag && <><dt className="text-slate-500">Tag</dt><dd className="text-right">{reviewInput.festival_tag}</dd></>}
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
                    {initialTransaction?.category_name && !categoryOptions.includes(initialTransaction.category_name) && (
                      <option value={initialTransaction.category_name}>Existing: {initialTransaction.category_name}</option>
                    )}
                    {categoryOptions.map(item => <option key={item}>{item}</option>)}
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
                <label className="block text-sm font-medium text-slate-700">Tag
                  <select value={festivalTagIdValue} onChange={event => setFestivalTagIdValue(event.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                    <option value="">No tag</option>
                    {availableFestivalTags.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              )}
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
