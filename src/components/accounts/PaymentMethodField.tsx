import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createFinancialPaymentMethod,
  DEFAULT_FINANCIAL_PAYMENT_METHODS,
  fetchFinancialPaymentMethods,
  setFinancialPaymentMethodPendingUse,
} from '@/lib/accounts'

const ADD_CUSTOM_METHOD = '__add_custom_method__'

export function PaymentMethodField({
  value,
  onChange,
  required = false,
  legacyValue,
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  legacyValue?: string
}) {
  const queryClient = useQueryClient()
  const methodsQuery = useQuery({
    queryKey: ['accounts', 'payment-methods'],
    queryFn: fetchFinancialPaymentMethods,
  })
  const [adding, setAdding] = useState(false)
  const [customName, setCustomName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [usageError, setUsageError] = useState('')
  const selectedCustomMethod = value &&
    (methodsQuery.data ?? []).includes(value) &&
    !DEFAULT_FINANCIAL_PAYMENT_METHODS.includes(value)
    ? value
    : ''

  useEffect(() => {
    if (!selectedCustomMethod) return
    const sessionId = crypto.randomUUID()
    let active = true
    let heartbeat: number | undefined

    const reportUsageError = (reason: unknown) => {
      if (active) {
        setUsageError(reason instanceof Error
          ? reason.message
          : 'This payment method could not be reserved for the unfinished transaction.')
      } else {
        console.error('[accounts] Could not release pending payment method usage.', reason)
      }
    }

    const registerUsage = async () => {
      try {
        await setFinancialPaymentMethodPendingUse(sessionId, selectedCustomMethod)
        if (!active) {
          await setFinancialPaymentMethodPendingUse(sessionId, null)
          return
        }
        heartbeat = window.setInterval(() => {
          void setFinancialPaymentMethodPendingUse(sessionId, selectedCustomMethod)
            .catch(reportUsageError)
        }, 60_000)
      } catch (reason) {
        reportUsageError(reason)
        if (active) onChange('')
      }
    }
    void registerUsage()

    return () => {
      active = false
      if (heartbeat !== undefined) window.clearInterval(heartbeat)
      void setFinancialPaymentMethodPendingUse(sessionId, null).catch(reportUsageError)
    }
  }, [onChange, selectedCustomMethod])

  async function saveCustomMethod() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const method = await createFinancialPaymentMethod(customName)
      await queryClient.invalidateQueries({ queryKey: ['accounts', 'payment-methods'] })
      onChange(method)
      setCustomName('')
      setAdding(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The payment method could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <select
        aria-label="Payment Method"
        value={adding ? ADD_CUSTOM_METHOD : value}
        required={required}
        onChange={event => {
          if (event.target.value === ADD_CUSTOM_METHOD) {
            setAdding(true)
            setCustomName('')
            setError('')
          } else {
            setAdding(false)
            setUsageError('')
            onChange(event.target.value)
          }
        }}
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal"
      >
        <option value="">Select a payment method</option>
        {value && legacyValue === value && !(methodsQuery.data ?? []).includes(value) && (
          <option value={value}>Existing: {value}</option>
        )}
        {(methodsQuery.data ?? []).map(method => <option key={method} value={method}>{method}</option>)}
        <option value={ADD_CUSTOM_METHOD}>+ Add Custom Payment Method</option>
      </select>
      {methodsQuery.isError && (
        <span role="alert" className="mt-1 block text-xs text-rose-700">Saved payment methods could not be loaded.</span>
      )}
      {usageError && <span role="alert" className="mt-1 block text-xs text-rose-700">{usageError}</span>}
      {adding && (
        <div className="mt-2 space-y-2">
          <input
            aria-label="Custom payment method name"
            value={customName}
            onChange={event => setCustomName(event.target.value)}
            placeholder="Enter custom payment method"
            maxLength={80}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal"
          />
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setError('') }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
              Cancel
            </button>
            <button type="button" onClick={() => void saveCustomMethod()} disabled={saving || !customName.trim()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save method'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
