import { useRef, useState, type FormEvent } from 'react'
import { CalendarDays, X } from 'lucide-react'
import { DEFAULT_FINANCIAL_CATEGORIES } from '@/lib/accounts'
import { festivalTagId } from '@/lib/festivalProducts'
import { PaymentMethodField } from '@/components/accounts/PaymentMethodField'
import type { EditExpenseInput, FinancialCategory, FinancialExpense, NewExpenseInput, VendorOption } from '@/types/accounts'
import type { FestivalTag } from '@/types/accounts'

function dateInput(value: FinancialExpense['transaction_date']): string {
  const date = value.toDate()
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

function dateToIso(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return ''
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const parsed = new Date(0)
  parsed.setFullYear(year, month - 1, day)
  parsed.setHours(0, 0, 0, 0)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isoToDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : ''
}

function paise(value: string, label: string, allowZero = false): number {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`Enter a valid ${label}.`)
  const [whole, fraction = ''] = normalized.split('.')
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(result) || (allowZero ? result < 0 : result <= 0)) throw new Error(`Enter a valid ${label}.`)
  return result
}

function isValidMoneyInput(value: string, allowZero = false): boolean {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return false
  const amount = Number(normalized)
  return Number.isSafeInteger(Math.round(amount * 100)) && (allowZero ? amount >= 0 : amount > 0)
}

export function ExpenseForm({
  vendors,
  categories,
  festivalTags,
  festivalTagsLoading = false,
  festivalTagsError = false,
  initialExpense,
  onCreateCategory,
  saving,
  onClose,
  onSave,
  onEditSave,
}: {
  vendors: VendorOption[]
  categories: FinancialCategory[]
  festivalTags: FestivalTag[]
  festivalTagsLoading?: boolean
  festivalTagsError?: boolean
  initialExpense?: FinancialExpense
  onCreateCategory: (name: string, type: 'expense') => Promise<void>
  saving: boolean
  onClose: () => void
  onSave: (input: NewExpenseInput) => Promise<void>
  onEditSave?: (input: EditExpenseInput) => Promise<void>
}) {
  const [amount, setAmount] = useState(initialExpense ? (initialExpense.amount_paise / 100).toFixed(2) : '')
  const [date, setDate] = useState(initialExpense ? dateInput(initialExpense.transaction_date) : '')
  const [category, setCategory] = useState(initialExpense?.category_name ?? '')
  const [customCategory, setCustomCategory] = useState('')
  const [expenseId, setExpenseId] = useState(initialExpense?.expense_id ?? '')
  const [description, setDescription] = useState(initialExpense?.description ?? '')
  const [festivalTagIdValue, setFestivalTagIdValue] = useState(
    initialExpense?.festival_tag_id ?? (initialExpense?.festival_tag ? festivalTagId(initialExpense.festival_tag) : ''),
  )
  const [vendorId, setVendorId] = useState(initialExpense?.vendor_id ?? '')
  const paymentReference = initialExpense?.payment_reference ?? ''
  const [reference, setReference] = useState(initialExpense?.reference_no ?? '')
  const [paymentMethod, setPaymentMethod] = useState(initialExpense?.payment_method ?? '')
  const [error, setError] = useState('')
  const isSubmitting = useRef(false)
  const datePickerRef = useRef<HTMLInputElement>(null)
  const vendor = vendors.find(item => item.id === vendorId)
  const createdTags = festivalTags.filter(tag => tag.is_custom)
  const existingTagId = initialExpense?.festival_tag_id ?? (initialExpense?.festival_tag ? festivalTagId(initialExpense.festival_tag) : '')
  const existingTag = existingTagId ? festivalTags.find(tag => tag.id === existingTagId) : undefined
  const availableFestivalTags = existingTagId && !createdTags.some(tag => tag.id === existingTagId)
    ? [...createdTags, existingTag ?? { id: existingTagId, name: initialExpense?.festival_tag ?? existingTagId, is_custom: true, is_enabled: false }]
    : createdTags
  const festivalTagName = availableFestivalTags.find(tag => tag.id === festivalTagIdValue)?.name ?? null
  const hasCreatedTag = !festivalTagsLoading && !festivalTagsError &&
    Boolean(festivalTagIdValue && createdTags.some(tag => tag.id === festivalTagIdValue))
  const isValidCategory = category !== '__custom' || Boolean(customCategory.trim())
  const isValidAmount = isValidMoneyInput(amount)
  const validDate = dateToIso(date)
  const hasValidTag = !festivalTagIdValue ||
    (Boolean(festivalTagName) && (Boolean(initialExpense) || hasCreatedTag))
  const hasValidExpenseId = Boolean(initialExpense) || !expenseId.trim() || /^[A-Za-z0-9-]{1,64}$/.test(expenseId.trim())
  const categoryOptions = [...new Set([
    ...DEFAULT_FINANCIAL_CATEGORIES,
    ...categories.filter(item => item.type === 'expense' && item.is_enabled !== false).map(item => item.name),
  ])]
  const canSave = !saving && !isSubmitting.current &&
    Boolean(hasValidExpenseId && validDate && isValidCategory && isValidAmount && hasValidTag &&
      (!initialExpense || paymentMethod.trim()))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (isSubmitting.current || saving) return
    isSubmitting.current = true
    setError('')
    try {
      const categoryName = category === '__custom' ? customCategory.trim() : category
      if (!validDate) throw new Error('Enter a valid date in DD/MM/YYYY format.')
      if (festivalTagIdValue && (!festivalTagName || (!initialExpense && !hasCreatedTag))) {
        throw new Error('Select a created tag or clear the Tag field to continue without one.')
      }
      if (category === '__custom' && !categoryName) throw new Error('Enter a category name.')
      if (initialExpense && !paymentMethod.trim()) throw new Error('Select a payment method.')
      if (!initialExpense && expenseId.trim() && !/^[A-Za-z0-9-]{1,64}$/.test(expenseId.trim())) {
        throw new Error('Enter an Expense ID using only letters, numbers, and hyphens.')
      }
      const amountValue = paise(amount, 'amount')
      if (category === '__custom') {
        await onCreateCategory(categoryName, 'expense')
      }
      if (initialExpense) {
        if (!onEditSave) throw new Error('Expense editing is unavailable.')
        await onEditSave({
          description,
          category_name: categoryName,
          vendor_id: vendorId || null,
          vendor_name: vendor?.name ?? (vendorId === initialExpense.vendor_id ? initialExpense.vendor_name : ''),
          payment_reference: paymentReference.trim(),
          reference_no: reference,
          transaction_date: validDate,
          amount_paise: amountValue,
          payment_method: paymentMethod.trim(),
          festival_tag: festivalTagName,
          festival_tag_id: festivalTagIdValue || null,
        })
      } else {
        await onSave({
          expense_id: expenseId.trim(),
          description,
          category_name: categoryName,
          vendor_id: vendorId || null,
          vendor_name: vendor?.name ?? '',
          payment_reference: paymentReference.trim(),
          reference_no: reference,
          transaction_date: validDate,
          amount_paise: amountValue,
          payment_method: paymentMethod.trim(),
          festival_tag: festivalTagName,
          festival_tag_id: festivalTagIdValue || null,
        })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Expense could not be saved.')
    } finally {
      isSubmitting.current = false
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="expense-form-title"
        className="max-h-[92vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="expense-form-title" className="text-lg font-semibold text-slate-900">{initialExpense ? 'Edit expense' : 'Record an expense'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Expense ID (Optional) / Cash / UPI / Bank / Ref Number
              <input type="text" value={expenseId} onChange={event => setExpenseId(event.target.value)}
                placeholder="Enter Expense ID" maxLength={64} pattern="[A-Za-z0-9-]{1,64}" title="Use only letters, numbers, and hyphens."
                readOnly={Boolean(initialExpense)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-700 read-only:bg-slate-50" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Expense Date
              <span className="mt-1.5 flex gap-2">
                <input type="text" inputMode="numeric" autoComplete="off" maxLength={10} value={date}
                  onChange={event => setDate(event.target.value)} placeholder="DD/MM/YYYY" required
                  aria-invalid={Boolean(date && !validDate)}
                  className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
                <span className="relative grid w-12 shrink-0 place-items-center">
                  <button type="button" aria-label="Open expense date calendar"
                    onClick={() => {
                      const picker = datePickerRef.current
                      if (!picker) return
                      if (typeof picker.showPicker === 'function') picker.showPicker()
                      else picker.click()
                    }}
                    className="grid h-full w-full place-items-center rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50">
                    <CalendarDays size={18} aria-hidden="true" />
                  </button>
                  <input ref={datePickerRef} type="date" aria-label="Choose expense date from calendar" value={validDate}
                    onChange={event => setDate(isoToDate(event.target.value))}
                    tabIndex={-1} className="pointer-events-none absolute h-px w-px opacity-0" />
                </span>
              </span>
              {date && !validDate && <span role="alert" className="mt-1 block text-xs text-rose-700">Enter a real date in DD/MM/YYYY format.</span>}
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Amount (₹)
              <input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} required
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Tag (Optional)
              <select value={festivalTagIdValue} onChange={event => setFestivalTagIdValue(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                <option value="">{festivalTagsLoading ? 'Loading tags…' : 'No tag'}</option>
                {availableFestivalTags.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {festivalTagsLoading && <span role="status" className="mt-1.5 block text-xs text-slate-500">Loading tags…</span>}
              {festivalTagsError && <span role="alert" className="mt-1.5 block text-xs text-rose-700">Saved tags could not be loaded. You can continue without a tag.</span>}
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Category (Optional)
              <select value={category} onChange={event => setCategory(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                <option value="">No category</option>
                {initialExpense?.category_name && !categoryOptions.includes(initialExpense.category_name) && (
                  <option value={initialExpense.category_name}>Existing: {initialExpense.category_name}</option>
                )}
                {categoryOptions.map(item => <option key={item}>{item}</option>)}
                <option value="__custom">Add custom category…</option>
              </select>
              {category === '__custom' && (
                <input aria-label="Custom category" value={customCategory} onChange={event => setCustomCategory(event.target.value)}
                  placeholder="Enter custom category" required maxLength={80}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
              )}
            </label>
            <label className="block text-sm font-medium text-slate-700">Description (Optional)
              <input value={description} onChange={event => setDescription(event.target.value)} maxLength={250}
                placeholder="What was purchased or paid for?"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">{initialExpense ? 'Payment Method' : 'Payment Method (Optional)'}
              <PaymentMethodField value={paymentMethod} onChange={setPaymentMethod} required={Boolean(initialExpense)}
                legacyValue={initialExpense?.payment_method} />
            </label>
            <label className="block text-sm font-medium text-slate-700">Vendor (Optional)
              <select value={vendorId} onChange={event => setVendorId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal">
                <option value="">No linked vendor</option>
                {initialExpense?.vendor_id && !vendors.some(item => item.id === initialExpense.vendor_id) && <option value={initialExpense.vendor_id}>{initialExpense.vendor_name || initialExpense.vendor_id}</option>}
                {vendors.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm font-medium text-slate-700">Reference Number (Optional)
            <input value={reference} onChange={event => setReference(event.target.value)} maxLength={200}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal" />
          </label>
        </div>
        {error && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
          <button disabled={!canSave} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save Expense'}</button>
        </div>
      </form>
    </div>
  )
}
