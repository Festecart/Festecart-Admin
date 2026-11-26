import { useRef, useState, type FormEvent } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { getFinancialCategoryOptions, rupeesToPaise } from '@/lib/accounts'
import { incomeDateToIso, isoToIncomeDate } from '@/lib/incomeDate'
import { AccountsSelect } from '@/components/accounts/AccountsSelect'
import { PaymentMethodField } from '@/components/accounts/PaymentMethodField'
import type {
  FinancialCategory,
  FestivalTag,
  NewIncomeInput,
} from '@/types/accounts'

const PRESERVED_INCOME_TAG = '__preserved_income_tag__'

function currentDateInput(): string {
  const date = new Date()
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

function incomeSaveErrorMessage(reason: unknown): string {
  const details = reason && typeof reason === 'object'
    ? reason as { code?: unknown; message?: unknown }
    : {}
  const code = typeof details.code === 'string' ? details.code : ''
  const message = typeof details.message === 'string' ? details.message : ''

  if (code === 'functions/not-found') {
    return 'The Income service is not available in this Firebase project. An administrator must deploy the Income Cloud Functions.'
  }
  if (code === 'functions/unauthenticated') {
    return 'Your admin session has expired. Sign in again and retry.'
  }
  if (code === 'functions/permission-denied') {
    return 'Your account is not authorized to record income. Ask an administrator to verify your Admin access.'
  }
  if (
    code === 'functions/internal' ||
    code === 'functions/unavailable' ||
    code === 'functions/deadline-exceeded' ||
    /^internal \[\d+\]$/i.test(message.trim())
  ) {
    return 'The Income service could not confirm the save. You can retry safely; repeated submissions from this form will not create duplicate income records. If the problem continues, ask an administrator to check the Cloud Functions logs.'
  }
  return message || 'Income could not be saved. Check the browser console for the Firebase error code and try again.'
}

export function IncomeForm({
  categories,
  festivalTags,
  saving,
  initialIncome,
  onClose,
  onSave,
  onUpdate,
}: {
  categories: FinancialCategory[]
  festivalTags: FestivalTag[]
  saving: boolean
  initialIncome?: NewIncomeInput
  onClose: () => void
  onSave: (input: NewIncomeInput, idempotencyKey: string) => Promise<void>
  onUpdate?: (input: NewIncomeInput) => Promise<void>
}) {
  const availableCategories = getFinancialCategoryOptions(categories)
  const initialCategory = initialIncome?.category_name ?? ''
  const categoryOptions = initialCategory && !availableCategories.includes(initialCategory)
    ? [...availableCategories, initialCategory]
    : availableCategories
  const initialTagId = initialIncome?.festival_tag_id ?? (initialIncome?.festival_tag ? PRESERVED_INCOME_TAG : '')
  const [amount, setAmount] = useState(initialIncome ? (initialIncome.amount_paise / 100).toFixed(2) : '')
  const [date, setDate] = useState(initialIncome ? isoToIncomeDate(initialIncome.transaction_date) : currentDateInput())
  const [tagId, setTagId] = useState(initialTagId)
  const [category, setCategory] = useState(initialCategory)
  const [description, setDescription] = useState(initialIncome?.description ?? '')
  const [paymentMethod, setPaymentMethod] = useState(initialIncome?.payment_method ?? '')
  const [vendor, setVendor] = useState(initialIncome?.vendor_name ?? '')
  const [reference, setReference] = useState(initialIncome?.reference_no ?? '')
  const [source, setSource] = useState(initialIncome?.source_of_income ?? '')
  const [error, setError] = useState('')
  const isSubmitting = useRef(false)
  const datePickerRef = useRef<HTMLInputElement>(null)
  const idempotencyKey = useRef(crypto.randomUUID())
  const selectedTags = festivalTags.filter(tag => tag.is_custom)
  const selectedTag = selectedTags.find(tag => tag.id === tagId)
  const preservedTag = initialIncome &&
    (tagId === PRESERVED_INCOME_TAG
      ? !initialIncome.festival_tag_id
      : initialIncome.festival_tag_id === tagId)
    ? initialIncome.festival_tag
    : null
  const validDate = incomeDateToIso(date)

  function collectInput(): NewIncomeInput {
    const amountPaise = rupeesToPaise(amount)
    if (!validDate) throw new Error('Enter a valid date in DD/MM/YYYY format.')
    if (tagId && !selectedTag && !preservedTag) throw new Error('Select a saved tag or clear the Tag field to continue.')
    return {
      amount_paise: amountPaise,
      transaction_date: validDate,
      festival_tag: selectedTag?.name ?? preservedTag ?? null,
      festival_tag_id: tagId === PRESERVED_INCOME_TAG ? null : tagId || null,
      category_name: category.trim(),
      description: description.trim(),
      payment_method: paymentMethod.trim(),
      vendor_name: vendor.trim(),
      reference_no: reference.trim(),
      source_of_income: source.trim(),
    }
  }

  async function submitIncome(event: FormEvent) {
    event.preventDefault()
    if (saving || isSubmitting.current) return
    isSubmitting.current = true
    setError('')
    try {
      const input = collectInput()
      if (initialIncome) {
        if (!onUpdate) throw new Error('Income editing is unavailable. Refresh and try again.')
        await onUpdate(input)
      } else {
        await onSave(input, idempotencyKey.current)
      }
      onClose()
    } catch (reason) {
      setError(incomeSaveErrorMessage(reason))
    } finally {
      isSubmitting.current = false
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
        <form onSubmit={submitIncome} role="dialog" aria-modal="true" aria-labelledby="income-form-title"
          className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="income-form-title" className="text-lg font-semibold text-slate-900">{initialIncome ? 'Edit Income' : 'Record Income'}</h2>
              <p className="mt-1 text-sm text-slate-500">Enter the required details to record this income.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Description <span className="text-rose-600" aria-hidden="true">**</span>
                <input value={description} onChange={event => setDescription(event.target.value)} maxLength={250}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">Amount (₹) <span className="text-rose-600" aria-hidden="true">**</span>
                <input aria-label="Amount (₹)" type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">Source of income <span className="text-rose-600" aria-hidden="true">**</span>
                <input value={source} onChange={event => setSource(event.target.value)} maxLength={120}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-semibold text-slate-700">Payment Method <span className="text-rose-600" aria-hidden="true">**</span>
                <PaymentMethodField value={paymentMethod} onChange={setPaymentMethod} legacyValue={initialIncome?.payment_method} />
              </label>
              <label className="block text-sm font-medium text-slate-700">Category (Optional)
                <AccountsSelect ariaLabel="Income category" value={category}
                  options={categoryOptions.map(item => ({ value: item, label: item }))}
                  onChange={setCategory} placeholder="Select category" />
              </label>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">Income Date <span className="text-rose-600" aria-hidden="true">**</span>
                <span className="mt-1.5 flex gap-2">
                  <input aria-label="Income Date" type="text" inputMode="numeric" autoComplete="off" maxLength={10}
                    value={date} onChange={event => setDate(event.target.value)} placeholder="DD/MM/YYYY" required
                    aria-invalid={Boolean(date && !validDate)}
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
                  <span className="relative grid w-12 shrink-0 place-items-center">
                    <button type="button" aria-label="Open income date calendar"
                      onClick={() => {
                        const picker = datePickerRef.current
                        if (!picker) return
                        if (typeof picker.showPicker === 'function') picker.showPicker()
                        else picker.click()
                      }}
                      className="grid h-full w-full place-items-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50">
                      <CalendarDays size={18} aria-hidden="true" />
                    </button>
                    <input ref={datePickerRef} type="date" aria-label="Choose income date from calendar" value={validDate}
                      onChange={event => setDate(isoToIncomeDate(event.target.value))}
                      tabIndex={-1} className="pointer-events-none absolute h-px w-px opacity-0" />
                  </span>
                </span>
                {date && !validDate && <span role="alert" className="mt-1 block text-xs text-rose-700">Enter a real date in DD/MM/YYYY format.</span>}
              </label>
              <label className="block text-sm font-medium text-slate-700">Tag
                <select value={tagId} onChange={event => setTagId(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                  <option value="">No tag</option>
                  {tagId && !selectedTag && preservedTag && (
                    <option value={tagId}>Existing: {preservedTag}</option>
                  )}
                  {selectedTags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">Vendor
                <input value={vendor} onChange={event => setVendor(event.target.value)} maxLength={120}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
              <label className="block text-sm font-medium text-slate-700">Reference Number
                <input value={reference} onChange={event => setReference(event.target.value)} maxLength={200}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              </label>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
            <button type="submit" disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              Save Income
            </button>
          </div>
        </form>
      </div>

    </>
  )
}
