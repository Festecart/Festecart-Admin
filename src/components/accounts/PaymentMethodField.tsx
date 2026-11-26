import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AccountsSelect } from '@/components/accounts/AccountsSelect'
import {
  fetchFinancialPaymentMethodSettings,
  setFinancialPaymentMethodPendingUse,
} from '@/lib/accounts'

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
  const methodsQuery = useQuery({
    queryKey: ['accounts', 'payment-methods'],
    queryFn: fetchFinancialPaymentMethodSettings,
  })
  const [usageError, setUsageError] = useState('')
  const methods = methodsQuery.data?.filter(method => method.is_enabled).map(method => method.name) ?? []
  const options = [
    ...(value && legacyValue === value && !methods.includes(value)
      ? [{ value, label: `Existing: ${value}` }]
      : []),
    ...methods.map(method => ({ value: method, label: method })),
  ]
  const selectedCustomMethod = methodsQuery.data?.some(method =>
    method.name === value && method.is_enabled && !method.is_default)
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

  return (
    <div>
      <AccountsSelect
        ariaLabel="Payment Method"
        value={value}
        options={options}
        placeholder="Select a payment method"
        required={required}
        onChange={method => {
          setUsageError('')
          onChange(method)
        }}
      />
      {methodsQuery.isError && (
        <span role="alert" className="mt-1 block text-xs text-rose-700">Saved payment methods could not be loaded.</span>
      )}
      {usageError && <span role="alert" className="mt-1 block text-xs text-rose-700">{usageError}</span>}
    </div>
  )
}
