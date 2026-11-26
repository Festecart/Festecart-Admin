import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Toast from '@radix-ui/react-toast'
import {
  CalendarDays,
  Check,
  CheckCircle2,
  CreditCard,
  Pencil,
  Plus,
  RefreshCw,
  Store,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  createFinancialCategory,
  DEFAULT_FINANCIAL_PAYMENT_METHODS,
  deleteFinancialCategory,
  deleteFinancialPaymentMethod,
  deleteFinancialVendor,
  fetchFinancialCategories,
  fetchFinancialPaymentMethodSettings,
  fetchFinancialVendors,
  fetchFinancialSettingsLastUpdated,
  saveFinancialPaymentMethod,
  saveFinancialVendor,
  updateFinancialCategory,
} from '@/lib/accounts'
import type { FinancialPaymentMethod, FinancialVendor } from '@/lib/accounts'
import type { FinancialCategory } from '@/types/accounts'

type SettingsDeleteTarget =
  | { kind: 'payment'; id: string; name: string }
  | { kind: 'category'; id: string; name: string }
  | { kind: 'vendor'; id: string; name: string }

const inputClass = 'min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const iconButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white transition-colors disabled:cursor-not-allowed disabled:opacity-50'

function errorText(reason: unknown): string {
  if (typeof reason === 'object' && reason !== null && 'code' in reason && typeof reason.code === 'string') {
    if (reason.code === 'permission-denied') {
      return 'You do not have permission to change Accounts settings. Contact an authorized admin.'
    }
    if (reason.code === 'unavailable' || reason.code === 'network-request-failed') {
      return 'Could not connect to Firebase. Check your connection and try again.'
    }
    return 'Could not save Accounts settings. Please try again.'
  }
  return reason instanceof Error ? reason.message : 'Settings could not be saved.'
}

function formatUpdated(value?: { toDate: () => Date } | null): string {
  if (!value) return '—'
  return value.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TypeBadge({ children, kind }: { children: string; kind: 'default' | 'custom' }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
      kind === 'default' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
    }`}>
      {children}
    </span>
  )
}

function PanelHeader({
  title,
  subtitle,
  icon,
  tone,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  tone: 'blue' | 'purple'
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
        tone === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
      }`}>
        {icon}
      </span>
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}

function RowIcon({ kind }: { kind: 'payment' | 'category' | 'vendor' }) {
  return (
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
      kind === 'payment' || kind === 'vendor' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
    }`}>
      {kind === 'payment' ? <CreditCard size={15} /> : kind === 'vendor' ? <Store size={15} /> : <Tag size={15} />}
    </span>
  )
}

function ActionIconButton({
  label,
  tone,
  onClick,
  disabled,
}: {
  label: string
  tone: 'edit' | 'delete' | 'save' | 'cancel'
  onClick: () => void
  disabled?: boolean
}) {
  const Icon = tone === 'delete' ? Trash2 : tone === 'save' ? Check : tone === 'cancel' ? X : Pencil
  const color = tone === 'delete'
    ? 'text-rose-600 hover:border-rose-200 hover:bg-rose-50'
    : tone === 'save'
      ? 'text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50'
      : tone === 'cancel'
        ? 'text-slate-500 hover:bg-slate-50'
        : 'text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={`${iconButtonClass} ${color}`}>
      <Icon size={15} aria-hidden="true" />
    </button>
  )
}

export function AccountsSettings() {
  const { isAccountsAdmin } = useAuth()
  const queryClient = useQueryClient()
  const methodsQuery = useQuery({
    queryKey: ['accounts', 'payment-method-settings'],
    queryFn: fetchFinancialPaymentMethodSettings,
    enabled: isAccountsAdmin,
  })
  const categoriesQuery = useQuery({
    queryKey: ['accounts', 'categories'],
    queryFn: fetchFinancialCategories,
    enabled: isAccountsAdmin,
  })
  const vendorsQuery = useQuery({
    queryKey: ['accounts', 'financial-vendors'],
    queryFn: fetchFinancialVendors,
    enabled: isAccountsAdmin,
  })
  const updatedQuery = useQuery({
    queryKey: ['accounts', 'settings-last-updated'],
    queryFn: fetchFinancialSettingsLastUpdated,
    enabled: isAccountsAdmin,
  })
  const [methodName, setMethodName] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [vendorName, setVendorName] = useState('')
  const [editingMethod, setEditingMethod] = useState<FinancialPaymentMethod | null>(null)
  const [editingCategory, setEditingCategory] = useState<FinancialCategory | null>(null)
  const [editingVendor, setEditingVendor] = useState<FinancialVendor | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SettingsDeleteTarget | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const methods = methodsQuery.data ?? DEFAULT_FINANCIAL_PAYMENT_METHODS.map(name => ({
    id: `default_${name.toLocaleLowerCase().replace(/\s+/g, '_')}`,
    name,
    is_default: true,
    is_enabled: true,
  }))
  const customMethods = methods.filter(method => !method.is_default && method.is_enabled)
  const categories = categoriesQuery.data ?? []
  const defaultCategories = categories.filter(category => category.is_default)
  const customCategories = categories.filter(category =>
    !category.is_default && category.is_enabled !== false)
  const vendors = vendorsQuery.data ?? []

  async function refreshSettings() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['accounts', 'payment-method-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', 'payment-methods'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', 'categories'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', 'financial-vendors'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', 'vendors'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts', 'settings-last-updated'] }),
    ])
  }

  async function perform(action: () => Promise<void>, successMessage: string): Promise<boolean> {
    if (saving) return false
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await action()
      await refreshSettings()
      setSuccess(successMessage)
      return true
    } catch (reason) {
      console.error('[accounts-settings] Operation failed.', reason)
      setError(errorText(reason))
      return false
    } finally {
      setSaving(false)
    }
  }

  async function saveMethod(event: FormEvent) {
    event.preventDefault()
    await perform(async () => {
      await saveFinancialPaymentMethod({ name: methodName })
      setMethodName('')
    }, 'Payment method added successfully.')
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault()
    await perform(async () => {
      await createFinancialCategory(categoryName)
      setCategoryName('')
    }, 'Category added successfully.')
  }

  async function saveVendor(event: FormEvent) {
    event.preventDefault()
    await perform(async () => {
      await saveFinancialVendor({ name: vendorName })
      setVendorName('')
    }, 'Vendor added successfully.')
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    await perform(async () => {
      if (target.kind === 'payment') await deleteFinancialPaymentMethod(target.id)
      else if (target.kind === 'category') await deleteFinancialCategory(target.id)
      else await deleteFinancialVendor(target.id)
    }, `${target.kind === 'payment' ? 'Payment method' : target.kind === 'category' ? 'Category' : 'Vendor'} removed successfully.`)
    setDeleteTarget(null)
  }

  if (!isAccountsAdmin) {
    return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Only authorized Accounts admins can manage these settings.</p>
  }

  const isLoading = methodsQuery.isPending || categoriesQuery.isPending || vendorsQuery.isPending || updatedQuery.isPending
  const loadError = methodsQuery.isError || categoriesQuery.isError || vendorsQuery.isError || updatedQuery.isError

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-bold tracking-tight text-slate-950">Accounts Settings</h2>
        <p className="mt-1 text-sm text-slate-500">Manage custom payment methods, categories, and vendors used across Accounts.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Payment Methods"
          value={isLoading ? '…' : loadError ? '—' : String(methods.filter(method => method.is_enabled).length)}
          icon={<CreditCard size={18} />}
          tone="blue"
        />
        <StatCard
          label="Categories"
          value={isLoading ? '…' : loadError ? '—' : String(
            defaultCategories.filter(category => category.is_enabled !== false).length + customCategories.length,
          )}
          icon={<Tag size={18} />}
          tone="purple"
        />
        <StatCard
          label="Vendors"
          value={isLoading ? '…' : loadError ? '—' : String(vendors.filter(vendor => vendor.is_enabled).length)}
          icon={<Store size={18} />}
          tone="blue"
        />
        <StatCard
          label="Last Updated"
          value={isLoading ? '…' : loadError ? '—' : formatUpdated(updatedQuery.data)}
          icon={<CalendarDays size={18} />}
          tone="slate"
        />
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
      {isLoading ? (
        <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading Accounts settings…
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          Settings could not be loaded. Check your admin access and connection.
          <button type="button" onClick={() => {
            void methodsQuery.refetch()
            void categoriesQuery.refetch()
            void vendorsQuery.refetch()
            void updatedQuery.refetch()
          }} className="ml-3 inline-flex items-center gap-1.5 font-semibold underline">
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-3">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <PanelHeader
              title="Payment Methods"
              subtitle="Create and manage payment methods for income and expense records."
              icon={<CreditCard size={18} />}
              tone="blue"
            />
            <div className="p-5 sm:p-6">
              <form onSubmit={saveMethod} className="space-y-2.5">
                <label htmlFor="settings-payment-method" className="block text-xs font-semibold text-slate-700">Payment Method Name</label>
                <div className="flex gap-2">
                  <input id="settings-payment-method" value={methodName} onChange={event => setMethodName(event.target.value)}
                    placeholder="Enter custom payment method" maxLength={80} required className={inputClass} />
                  <button type="submit" disabled={saving || !methodName.trim()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50">
                    <Plus size={15} /> Save
                  </button>
                </div>
              </form>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] table-fixed text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                        <th className="w-[35%] px-3 py-3">Method Name</th>
                        <th className="w-[21%] px-3 py-3">Type</th>
                        <th className="w-[21%] px-3 py-3">Updated</th>
                        <th className="w-[23%] px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {methods.filter(method => method.is_default).map(method => (
                        <PaymentMethodRow
                          key={method.id}
                          method={method}
                          editing={editingMethod?.id === method.id}
                          editName={editingMethod?.name ?? ''}
                          saving={saving}
                          onEditName={name => setEditingMethod({ ...method, name })}
                          onEdit={() => { setError(''); setEditingMethod(method); setEditingCategory(null); setEditingVendor(null) }}
                          onCancel={() => setEditingMethod(null)}
                          onSave={() => void perform(async () => {
                            await saveFinancialPaymentMethod({ id: method.id, name: editingMethod?.name ?? method.name })
                            setEditingMethod(null)
                          }, 'Payment method updated successfully.')}
                          onRestore={() => void perform(async () => {
                            await saveFinancialPaymentMethod({ id: method.id, name: method.name, is_enabled: true })
                          }, 'Payment method restored successfully.')}
                          onDelete={() => setDeleteTarget({ kind: 'payment', id: method.id, name: method.name })}
                        />
                      ))}
                      {customMethods.map(method => (
                        <PaymentMethodRow
                          key={method.id}
                          method={method}
                          editing={editingMethod?.id === method.id}
                          editName={editingMethod?.name ?? ''}
                          saving={saving}
                          onEditName={name => setEditingMethod({ ...method, name })}
                          onEdit={() => { setError(''); setEditingMethod(method); setEditingCategory(null); setEditingVendor(null) }}
                          onCancel={() => setEditingMethod(null)}
                          onSave={() => void perform(async () => {
                            await saveFinancialPaymentMethod({ id: method.id, name: editingMethod?.name ?? method.name })
                            setEditingMethod(null)
                          }, 'Payment method updated successfully.')}
                          onDelete={() => setDeleteTarget({ kind: 'payment', id: method.id, name: method.name })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {methods.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No payment methods are configured.</p>}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <PanelHeader
              title="Categories"
              subtitle="Manage default and custom categories used in income and expense forms."
              icon={<Tag size={18} />}
              tone="purple"
            />
            <div className="p-5 sm:p-6">
              <form onSubmit={saveCategory} className="space-y-2.5">
                <label htmlFor="settings-category-name" className="block text-xs font-semibold text-slate-700">Category Name</label>
                <div className="flex flex-wrap gap-2">
                  <input id="settings-category-name" value={categoryName} onChange={event => setCategoryName(event.target.value)}
                    placeholder="Enter custom category" maxLength={80} required className={inputClass} />
                  <button type="submit" disabled={saving || !categoryName.trim()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50">
                    <Plus size={15} /> Save
                  </button>
                </div>
              </form>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] table-fixed text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                        <th className="w-[34%] px-3 py-3">Category Name</th>
                        <th className="w-[24%] px-3 py-3">Available in</th>
                        <th className="w-[19%] px-3 py-3">Updated</th>
                        <th className="w-[23%] px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {defaultCategories.map(category => (
                        <CategoryRow
                          key={category.id}
                          category={category}
                          isDefault
                          editing={editingCategory?.id === category.id}
                          editName={editingCategory?.name ?? ''}
                          saving={saving}
                          onEditName={name => setEditingCategory({ ...category, name })}
                          onEdit={() => { setError(''); setEditingCategory(category); setEditingMethod(null); setEditingVendor(null) }}
                          onCancel={() => setEditingCategory(null)}
                          onSave={() => void perform(async () => {
                            await updateFinancialCategory(category.id, {
                              name: editingCategory?.name ?? category.name,
                              is_enabled: category.is_enabled !== false,
                            })
                            setEditingCategory(null)
                          }, 'Category updated successfully.')}
                          onRestore={() => void perform(async () => {
                            await updateFinancialCategory(category.id, { name: category.name, is_enabled: true })
                          }, 'Category restored successfully.')}
                          onDelete={() => setDeleteTarget({ kind: 'category', id: category.id, name: category.name })}
                        />
                      ))}
                      {customCategories.map(category => (
                        <CategoryRow
                          key={category.id}
                          category={category}
                          editing={editingCategory?.id === category.id}
                          editName={editingCategory?.name ?? ''}
                          saving={saving}
                          onEditName={name => setEditingCategory({ ...category, name })}
                          onEdit={() => { setError(''); setEditingCategory(category); setEditingMethod(null); setEditingVendor(null) }}
                          onCancel={() => setEditingCategory(null)}
                          onSave={() => void perform(async () => {
                            await updateFinancialCategory(category.id, {
                              name: editingCategory?.name ?? category.name,
                              is_enabled: category.is_enabled !== false,
                            })
                            setEditingCategory(null)
                          }, 'Category updated successfully.')}
                          onRestore={() => void perform(async () => {
                            await updateFinancialCategory(category.id, { name: category.name, is_enabled: true })
                          }, 'Category restored successfully.')}
                          onDelete={() => setDeleteTarget({ kind: 'category', id: category.id, name: category.name })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <PanelHeader
              title="Vendors"
              subtitle="Manage vendor names used in Accounts forms without changing marketplace vendor profiles."
              icon={<Store size={18} />}
              tone="blue"
            />
            <div className="p-5 sm:p-6">
              <form onSubmit={saveVendor} className="space-y-2.5">
                <label htmlFor="settings-vendor-name" className="block text-xs font-semibold text-slate-700">Vendor Name</label>
                <div className="flex flex-wrap gap-2">
                  <input id="settings-vendor-name" value={vendorName} onChange={event => setVendorName(event.target.value)}
                    placeholder="Enter custom vendor" maxLength={120} required className={inputClass} />
                  <button type="submit" disabled={saving || !vendorName.trim()}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50">
                    <Plus size={15} /> Save
                  </button>
                </div>
              </form>

              <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] table-fixed text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                        <th className="w-[35%] px-3 py-3">Vendor Name</th>
                        <th className="w-[21%] px-3 py-3">Type</th>
                        <th className="w-[21%] px-3 py-3">Updated</th>
                        <th className="w-[23%] px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {vendors.map(vendor => (
                        <VendorRow
                          key={vendor.id}
                          vendor={vendor}
                          isDefault={vendor.is_default}
                          editing={editingVendor?.id === vendor.id}
                          editName={editingVendor?.name ?? ''}
                          saving={saving}
                          onEditName={name => setEditingVendor({ ...vendor, name })}
                          onEdit={() => {
                            setError('')
                            setEditingVendor(vendor)
                            setEditingMethod(null)
                            setEditingCategory(null)
                          }}
                          onCancel={() => setEditingVendor(null)}
                          onSave={() => void perform(async () => {
                            await saveFinancialVendor({ id: vendor.id, name: editingVendor?.name ?? vendor.name })
                            setEditingVendor(null)
                          }, 'Vendor updated successfully.')}
                          onRestore={() => void perform(async () => {
                            await saveFinancialVendor({ id: vendor.id, name: vendor.name })
                          }, 'Vendor restored successfully.')}
                          onDelete={() => setDeleteTarget({ kind: 'vendor', id: vendor.id, name: vendor.name })}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
                {vendors.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No vendors have been added.</p>}
              </div>
            </div>
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4"
          role="presentation" onMouseDown={event => {
            if (event.target === event.currentTarget && !saving) setDeleteTarget(null)
          }}>
          <section role="dialog" aria-modal="true" aria-labelledby="settings-delete-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600"><Trash2 size={18} /></span>
              <div>
                <h2 id="settings-delete-title" className="font-semibold text-slate-900">
                  {deleteTarget.kind === 'payment' ? 'Remove payment method?' : deleteTarget.kind === 'category' ? 'Delete category?' : 'Remove vendor?'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {deleteTarget.kind === 'payment'
                    ? `Remove '${deleteTarget.name}' from available payment methods? Existing transactions will remain unchanged.`
                    : deleteTarget.kind === 'vendor'
                      ? `${deleteTarget.name} will be hidden from Accounts forms. Its marketplace profile and historical records will remain unchanged.`
                      : `${deleteTarget.name} will be removed from future dropdowns. Historical records are retained.`}
                </p>
              </div>
            </div>
            {deleteTarget.kind === 'category' && (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                Existing transactions will keep their saved category name.
              </p>
            )}
            {deleteTarget.kind === 'vendor' && (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                Existing expense records will keep their saved vendor details.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setDeleteTarget(null)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={saving} onClick={() => void confirmDelete()}
                className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                {saving ? (deleteTarget.kind === 'category' ? 'Deleting…' : 'Removing…') : (deleteTarget.kind === 'category' ? 'Delete' : 'Remove')}
              </button>
            </div>
          </section>
        </div>
      )}
      <Toast.Provider duration={3000}>
        <Toast.Viewport label="Notifications" className="fixed right-4 top-4 z-[100] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2 outline-none" />
        {success && (
          <Toast.Root
            open
            onOpenChange={open => { if (!open) setSuccess('') }}
            className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-lg"
          >
            <CheckCircle2 size={17} className="shrink-0 text-emerald-600" aria-hidden="true" />
            <Toast.Title className="font-medium">{success}</Toast.Title>
            <Toast.Close aria-label="Dismiss notification" className="ml-auto text-slate-400 hover:text-slate-700">
              <X size={15} aria-hidden="true" />
            </Toast.Close>
          </Toast.Root>
        )}
      </Toast.Provider>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: 'blue' | 'purple' | 'slate'
}) {
  const iconClass = tone === 'blue'
    ? 'bg-blue-50 text-blue-600'
    : tone === 'purple'
      ? 'bg-purple-50 text-purple-600'
      : 'bg-slate-100 text-slate-600'
  return (
    <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${iconClass}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 truncate text-lg font-bold tracking-tight text-slate-900">{value}</p>
      </div>
    </section>
  )
}

function PaymentMethodRow({
  method,
  editing = false,
  editName = '',
  saving = false,
  onEditName,
  onEdit,
  onCancel,
  onSave,
  onRestore,
  onDelete,
}: {
  method: FinancialPaymentMethod
  editing?: boolean
  editName?: string
  saving?: boolean
  onEditName?: (name: string) => void
  onEdit?: () => void
  onCancel?: () => void
  onSave?: () => void
  onRestore?: () => void
  onDelete?: () => void
}) {
  const isDefault = method.is_default
  return (
    <tr className="group">
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <RowIcon kind="payment" />
          {editing
            ? <input autoFocus aria-label={`Edit ${method.name}`} value={editName}
                onChange={event => onEditName?.(event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
            : <span className="truncate text-sm font-medium text-slate-800">{method.name}</span>}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <TypeBadge kind={isDefault ? 'default' : 'custom'}>{isDefault ? 'Default' : 'Custom'}</TypeBadge>
          {!method.is_enabled && <span className="text-[11px] text-slate-400">Removed</span>}
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">{formatUpdated(method.updated_at)}</td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <ActionIconButton label="Save payment method" tone="save" onClick={() => onSave?.()} disabled={saving || !editName.trim()} />
              <ActionIconButton label="Cancel editing" tone="cancel" onClick={() => onCancel?.()} disabled={saving} />
            </>
          ) : !method.is_enabled ? (
            <ActionIconButton label={`Restore ${method.name}`} tone="save" onClick={() => onRestore?.()} disabled={saving} />
          ) : (
            <>
              <ActionIconButton label={`Edit ${method.name}`} tone="edit" onClick={() => onEdit?.()} disabled={saving} />
              <ActionIconButton label={`Delete ${method.name}`} tone="delete" onClick={() => onDelete?.()} disabled={saving} />
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function CategoryRow({
  category,
  isDefault = false,
  editing = false,
  editName = '',
  saving = false,
  onEditName,
  onEdit,
  onCancel,
  onSave,
  onRestore,
  onDelete,
}: {
  category: FinancialCategory
  isDefault?: boolean
  editing?: boolean
  editName?: string
  saving?: boolean
  onEditName?: (name: string) => void
  onEdit?: () => void
  onCancel?: () => void
  onSave?: () => void
  onRestore?: () => void
  onDelete?: () => void
}) {
  return (
    <tr className="group">
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <RowIcon kind="category" />
          {editing
            ? <input autoFocus aria-label={`Edit ${category.name}`} value={editName}
                onChange={event => onEditName?.(event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-purple-400" />
            : <span className="truncate text-sm font-medium text-slate-800">{category.name}</span>}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-500">
            {isDefault ? category.type === 'income' ? 'Income' : 'Expense' : 'Income & Expense'}
          </span>
          <TypeBadge kind={isDefault ? 'default' : 'custom'}>{isDefault ? 'Default' : 'Custom'}</TypeBadge>
          {category.is_enabled === false && <span className="text-[11px] text-slate-400">Removed</span>}
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">{formatUpdated(category.updated_at ?? category.created_at)}</td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <ActionIconButton label="Save category" tone="save" onClick={() => onSave?.()} disabled={saving || !editName.trim()} />
              <ActionIconButton label="Cancel editing" tone="cancel" onClick={() => onCancel?.()} disabled={saving} />
            </>
          ) : category.is_enabled === false ? (
            <ActionIconButton label={`Restore ${category.name}`} tone="save" onClick={() => onRestore?.()} disabled={saving} />
          ) : (
            <>
              <ActionIconButton label={`Edit ${category.name}`} tone="edit" onClick={() => onEdit?.()} disabled={saving} />
              <ActionIconButton label={`Delete ${category.name}`} tone="delete" onClick={() => onDelete?.()} disabled={saving} />
            </>
          )}
        </div>
      </td>
    </tr>
  )
}

function VendorRow({
  vendor,
  isDefault = false,
  editing = false,
  editName = '',
  saving = false,
  onEditName,
  onEdit,
  onCancel,
  onSave,
  onRestore,
  onDelete,
}: {
  vendor: FinancialVendor
  isDefault?: boolean
  editing?: boolean
  editName?: string
  saving?: boolean
  onEditName?: (name: string) => void
  onEdit?: () => void
  onCancel?: () => void
  onSave?: () => void
  onRestore?: () => void
  onDelete?: () => void
}) {
  return (
    <tr className="group">
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <RowIcon kind="vendor" />
          {editing
            ? <input autoFocus aria-label={`Edit ${vendor.name}`} value={editName}
                onChange={event => onEditName?.(event.target.value)} maxLength={120}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400" />
            : <span className="truncate text-sm font-medium text-slate-800">{vendor.name}</span>}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <TypeBadge kind={isDefault ? 'default' : 'custom'}>{isDefault ? 'Default' : 'Custom'}</TypeBadge>
          {!vendor.is_enabled && <span className="text-[11px] text-slate-400">Removed</span>}
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">{formatUpdated(vendor.updated_at ?? vendor.created_at)}</td>
      <td className="px-3 py-3">
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <ActionIconButton label="Save vendor" tone="save" onClick={() => onSave?.()} disabled={saving || !editName.trim()} />
              <ActionIconButton label="Cancel editing" tone="cancel" onClick={() => onCancel?.()} disabled={saving} />
            </>
          ) : !vendor.is_enabled ? (
            <ActionIconButton label={`Restore ${vendor.name}`} tone="save" onClick={() => onRestore?.()} disabled={saving} />
          ) : (
            <>
              <ActionIconButton label={`Edit ${vendor.name}`} tone="edit" onClick={() => onEdit?.()} disabled={saving} />
              <ActionIconButton label={`Remove ${vendor.name}`} tone="delete" onClick={() => onDelete?.()} disabled={saving} />
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
