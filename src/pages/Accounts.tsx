import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  ArrowUpRight,
  CalendarDays,
  CircleDollarSign,
  CircleAlert,
  Download,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Pencil,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { AccountForm } from '@/components/accounts/AccountForm'
import { ExpenseForm } from '@/components/accounts/ExpenseForm'
import { ExpenseReceipts } from '@/components/accounts/ExpenseReceipts'
import { MetricCard } from '@/components/accounts/MetricCard'
import { TransactionForm } from '@/components/accounts/TransactionForm'
import { TransactionEditForm } from '@/components/accounts/TransactionEditForm'
import { TransactionReceiptLink } from '@/components/accounts/TransactionReceiptLink'
import { TransactionTable } from '@/components/accounts/TransactionTable'
import { FestivalProductTags } from '@/components/accounts/FestivalProductTags'
import { useAccounts } from '@/hooks/useAccounts'
import { useOrders } from '@/hooks/useOrders'
import { calculateOrderPaymentAmounts, eligibleDeliveredOrders, type CustomerPaymentStatus } from '@/lib/customerPayments'
import { festivalTagId, LEGACY_FINANCIAL_TAGS, resolveFestivalTagName } from '@/lib/festivalProducts'
import type { FestivalCategory } from '@/lib/festivalProducts'
import {
  createAccount,
  createFinancialCategory,
  createExpense,
  editTransaction,
  editFinancialExpense,
  deleteFinancialExpense,
  deleteFinancialTransaction,
  fetchCustomerPayments,
  fetchFestivalTags,
  fetchReportExpenses,
  fetchReportTransactions,
  formatINR,
  recordTransaction,
  PETTY_CASH_TRANSACTION_ACCOUNT_ID,
  UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID,
} from '@/lib/accounts'
import type {
  FinancialExpense,
  FestivalTag,
  CustomerPayment,
  NewAccountInput,
  NewExpenseInput,
  NewTransactionInput,
  EditTransactionInput,
  EditExpenseInput,
  FinancialTransaction,
} from '@/types/accounts'
import type { Order } from '@/types'

type Tab = 'overview' | 'transactions' | 'expenses' | 'receivables' | 'petty_cash' | 'reports' | 'tags'
type QuickTransactionAction = 'income' | 'expense' | 'transfer' | 'petty_cash'

type DatePreset = 'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'all'
const EXPENSES_PER_PAGE = 50

function expenseSpendingPaise(expense: FinancialExpense): number {
  return expense.is_full_amount_spending ? expense.amount_paise : expense.paid_paise
}

type PendingDelete =
  | { kind: 'transaction'; record: FinancialTransaction; pettyCashSpending?: boolean }
  | { kind: 'expense'; record: FinancialExpense }

type DeleteConfirmationDetails = {
  id: string
  date: string
  category: string
  tag: string
  amount: string
}

function isDisplayableExpenseId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(value.trim())
}

function isDisplayableTransactionId(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^FTX-[A-Z0-9%._-]{1,180}$/i.test(value.trim())
}

function deleteConfirmationDetails(
  target: PendingDelete,
  expenses: FinancialExpense[],
  festivalTags: FestivalTag[],
): DeleteConfirmationDetails {
  if (target.kind === 'expense') {
    const expense = target.record
    return {
      id: isDisplayableExpenseId(expense.expense_id) ? expense.expense_id : '—',
      date: expense.transaction_date.toDate().toLocaleDateString('en-GB'),
      category: expense.category_name || '—',
      tag: resolveFestivalTagName(expense.festival_tag_id, expense.festival_tag, festivalTags) || '—',
      amount: formatINR(expense.amount_paise),
    }
  }
  const transaction = target.record
  const linkedExpense = transaction.linked_expense_id
    ? expenses.find(expense => expense.id === transaction.linked_expense_id)
    : undefined
  return {
    id: isDisplayableExpenseId(linkedExpense?.expense_id)
      ? linkedExpense.expense_id
      : isDisplayableTransactionId(transaction.transaction_id) ? transaction.transaction_id : '—',
    date: transaction.transaction_date.toDate().toLocaleDateString('en-GB'),
    category: transaction.category_name || '—',
    tag: resolveFestivalTagName(transaction.festival_tag_id, transaction.festival_tag, festivalTags) || '—',
    amount: formatINR(transaction.amount_paise),
  }
}

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function deliveredOrderCustomerName(order: Order): string {
  const shippingName = typeof order.shipping_address === 'object' && order.shipping_address
    ? order.shipping_address.name
    : ''
  return order.guest_name?.trim() || shippingName?.trim() || order.customer_email?.trim() ||
    order.guest_email?.trim() || 'Customer'
}

function paymentMethodLabel(value: string): string {
  const method = value.trim()
  if (method.toLowerCase() === 'cod') return 'Cash on Delivery'
  return method
}

function dateRangeFor(preset: DatePreset, customFrom: string, customTo: string) {
  const today = new Date()
  const to = localDateString(today)
  if (preset === 'today') return { from: to, to }
  if (preset === 'yesterday') {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const day = localDateString(yesterday)
    return { from: day, to: day }
  }
  if (preset === 'week') {
    const from = new Date(today)
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
    return { from: localDateString(from), to }
  }
  if (preset === 'month') return { from: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, to }
  if (preset === 'custom') return {
    from: customFrom || undefined,
    to: customTo || undefined,
  }
  return {}
}

function escapeCsvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function downloadReportFile(filename: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function ReportTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold text-slate-900">{title}</h3></div>
      {rows.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No report data for this period.</p>
        : <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[400px] text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>{headers.map(header => <th key={header} className="px-4 py-3">{header}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 text-slate-700">{cell}</td>)}</tr>)}
            </tbody>
          </table>
        </div>}
    </section>
  )
}

function loadingOrUnavailable(pending: boolean, failed: boolean, value: number | undefined): string {
  if (failed) return 'Unavailable'
  if (pending || value === undefined) return 'Loading…'
  return formatINR(value)
}

function transactionPaymentStatus(
  transaction: FinancialTransaction,
  expenses: FinancialExpense[],
  payments: CustomerPayment[],
): string {
  if (transaction.linked_expense_id) {
    const expense = expenses.find(item => item.id === transaction.linked_expense_id)
    if (expense) return expense.payment_status.replace('_', ' ')
  }
  if (transaction.linked_order_id) {
    const payment = payments.find(item => item.transaction.id === transaction.id)
    if (payment) return payment.order_payment_status.replace('_', ' ')
  }
  if (transaction.type === 'expense') return 'Paid'
  if (transaction.type === 'income') return 'Received'
  return transaction.type === 'transfer' ? 'Completed' : '—'
}

export default function Accounts() {
  const [tab, setTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [transactionFrom, setTransactionFrom] = useState('')
  const [transactionTo, setTransactionTo] = useState('')
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
  const [selectedTagCategory, setSelectedTagCategory] = useState<FestivalCategory | null>(null)
  const [customerPaymentSearch, setCustomerPaymentSearch] = useState('')
  const [customerPaymentFrom, setCustomerPaymentFrom] = useState('')
  const [customerPaymentTo, setCustomerPaymentTo] = useState('')
  const [customerPaymentMethodFilter, setCustomerPaymentMethodFilter] = useState('all')
  const [customerPaymentStatusFilter, setCustomerPaymentStatusFilter] = useState<'all' | CustomerPaymentStatus>('all')
  const [transactionSuccessMessage, setTransactionSuccessMessage] = useState('')
  const transactionSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deleteSuccessMessage, setDeleteSuccessMessage] = useState('')
  const deleteSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [quickTransactionAction, setQuickTransactionAction] = useState<QuickTransactionAction | null>(null)
  const [queuedTransactionAction, setQueuedTransactionAction] = useState<QuickTransactionAction | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null)
  const [editingExpense, setEditingExpense] = useState<FinancialExpense | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [expensePage, setExpensePage] = useState(0)
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const clearTransactionSuccessTimer = () => {
    if (transactionSuccessTimer.current !== null) {
      clearTimeout(transactionSuccessTimer.current)
      transactionSuccessTimer.current = null
    }
  }
  const clearDeleteSuccessTimer = () => {
    if (deleteSuccessTimer.current !== null) {
      clearTimeout(deleteSuccessTimer.current)
      deleteSuccessTimer.current = null
    }
  }
  const showTransactionSuccess = (message: string, duration = 1000) => {
    clearTransactionSuccessTimer()
    setTransactionSuccessMessage(message)
    transactionSuccessTimer.current = setTimeout(() => {
      setTransactionSuccessMessage('')
      transactionSuccessTimer.current = null
    }, duration)
  }
  const showDeleteSuccess = (message: string) => {
    clearDeleteSuccessTimer()
    setDeleteSuccessMessage(message)
    deleteSuccessTimer.current = setTimeout(() => {
      setDeleteSuccessMessage('')
      deleteSuccessTimer.current = null
    }, 2000)
  }
  useEffect(() => () => {
    clearTransactionSuccessTimer()
    clearDeleteSuccessTimer()
  }, [])
  const dateRange = useMemo(() => dateRangeFor(datePreset, customFrom, customTo), [datePreset, customFrom, customTo])
  const queryClient = useQueryClient()
  const {
    accounts: accountsQuery,
    totals: totalsQuery,
    transactions: transactionsQuery,
    expenses: expensesQuery,
    vendors: vendorsQuery,
    categories: categoriesQuery,
    vendorDue: vendorDueQuery,
  } = useAccounts(dateRange)
  const reportTransactionsQuery = useQuery({
    queryKey: ['accounts', 'report-transactions', dateRange.from ?? '', dateRange.to ?? ''],
    queryFn: () => fetchReportTransactions(dateRange),
    enabled: tab === 'overview' || tab === 'reports',
  })
  const pettyCashTransactionsQuery = useQuery({
    queryKey: ['accounts', 'petty-cash-transactions'],
    queryFn: () => fetchReportTransactions({}),
    enabled: tab === 'petty_cash',
  })
  const reportExpensesQuery = useQuery({
    queryKey: ['accounts', 'report-expenses', dateRange.from ?? '', dateRange.to ?? ''],
    queryFn: () => fetchReportExpenses(dateRange),
    enabled: tab === 'overview' || tab === 'reports',
  })
  const customerPaymentsQuery = useQuery({
    queryKey: ['accounts', 'customer-payments'],
    queryFn: fetchCustomerPayments,
    enabled: tab === 'receivables' || tab === 'transactions',
    refetchInterval: 30_000,
  })
  const deliveredOrdersQuery = useOrders({
    status: 'delivered',
    enabled: tab === 'receivables',
    refetchInterval: tab === 'receivables' ? 30_000 : false,
  })
  const allTransactionsQuery = useQuery({
    queryKey: ['accounts', 'all-transactions'],
    queryFn: () => fetchReportTransactions({}),
    enabled: tab === 'transactions',
  })
  const festivalTagsQuery = useQuery({
    queryKey: ['accounts', 'festival-tags'],
    queryFn: fetchFestivalTags,
  })

  const accounts = accountsQuery.data ?? []
  const transactions = transactionsQuery.data?.pages.flatMap(page => page.items) ?? []
  const expenses = expensesQuery.data ?? []
  const expensePageCount = Math.ceil(expenses.length / EXPENSES_PER_PAGE)
  const visibleExpenses = expenses.slice(expensePage * EXPENSES_PER_PAGE, (expensePage + 1) * EXPENSES_PER_PAGE)
  const customerPayments: CustomerPayment[] = customerPaymentsQuery.data ?? []
  const deliveredOrderPayments = useMemo(() => {
    const paymentDetails = new Map<string, Set<string>>()
    for (const { transaction } of customerPayments) {
      const orderId = transaction.linked_order_id
      if (!orderId || transaction.type !== 'income') continue
      let details = paymentDetails.get(orderId)
      if (!details) {
        details = new Set<string>()
        paymentDetails.set(orderId, details)
      }
      const method = paymentMethodLabel(transaction.payment_method)
      if (method) details.add(method)
    }

    return eligibleDeliveredOrders(deliveredOrdersQuery.data ?? [])
      .map(({ order, orderNumber }) => {
        const { totalPaise, receivedPaise, pendingPaise, paymentStatus } =
          calculateOrderPaymentAmounts(order.total, order.amount_paid)
        const deliveredDate = order.delivered_at ? new Date(order.delivered_at) : null
        const deliveredDateKey = deliveredDate && Number.isFinite(deliveredDate.getTime())
          ? localDateString(deliveredDate)
          : ''
        const details = paymentDetails.get(order.id)

        return {
          order,
          orderNumber,
          customerName: deliveredOrderCustomerName(order),
          deliveredDate: deliveredDateKey && deliveredDate
            ? deliveredDate.toLocaleDateString('en-IN')
            : '—',
          deliveredDateKey,
          totalPaise,
          receivedPaise,
          pendingPaise,
          paymentStatus,
          paymentMethods: details?.size
            ? [...details]
            : [paymentMethodLabel(order.payment_method)].filter(Boolean),
        }
      })
  }, [customerPayments, deliveredOrdersQuery.data])
  const festivalTags = festivalTagsQuery.data ?? LEGACY_FINANCIAL_TAGS.map(name => ({ id: festivalTagId(name), name }))
  const displayTag = (tagId: string | null, storedName: string | null) =>
    resolveFestivalTagName(tagId, storedName, festivalTags) ?? '—'
  const transactionHistory = tab === 'transactions' ? allTransactionsQuery.data ?? transactions : transactions
  const customerPaymentMethods = [...new Set(deliveredOrderPayments.flatMap(payment => payment.paymentMethods))].sort()
  const normalizedCustomerPaymentSearch = customerPaymentSearch.trim().toLocaleLowerCase()
  const filteredDeliveredOrderPayments = deliveredOrderPayments.filter(payment => {
    const searchMatches = !normalizedCustomerPaymentSearch ||
      [payment.orderNumber, payment.order.id, payment.customerName]
        .some(value => value.toLocaleLowerCase().includes(normalizedCustomerPaymentSearch))
    const dateMatches = (!customerPaymentFrom && !customerPaymentTo) ||
      (Boolean(payment.deliveredDateKey) &&
        (!customerPaymentFrom || payment.deliveredDateKey >= customerPaymentFrom) &&
        (!customerPaymentTo || payment.deliveredDateKey <= customerPaymentTo))
    return searchMatches &&
      dateMatches &&
      (customerPaymentMethodFilter === 'all' || payment.paymentMethods.includes(customerPaymentMethodFilter)) &&
      (customerPaymentStatusFilter === 'all' || payment.paymentStatus === customerPaymentStatusFilter)
  })
  const deliveredOrderTotals = deliveredOrderPayments.reduce((totals, payment) => ({
    orderValuePaise: totals.orderValuePaise + payment.totalPaise,
    receivedPaise: totals.receivedPaise + payment.receivedPaise,
    pendingPaise: totals.pendingPaise + payment.pendingPaise,
  }), { orderValuePaise: 0, receivedPaise: 0, pendingPaise: 0 })
  const activeAccounts = accounts.filter(account => account.active)
  const isPettyCashSpending = (item: FinancialTransaction) =>
    item.is_petty_cash_spending === true ||
    item.account_id === PETTY_CASH_TRANSACTION_ACCOUNT_ID ||
    (item.type === 'expense' && accounts.some(account => account.id === item.account_id && account.type === 'petty_cash'))
  const overviewLedger = reportTransactionsQuery.data ?? []
  const reportExpenses = reportExpensesQuery.data ?? []
  const expensesPaidPaise = reportExpenses.reduce((total, item) => total + expenseSpendingPaise(item), 0)
  const pettyCashSpentPaise = overviewLedger
    .filter(item => item.type === 'expense' && isPettyCashSpending(item))
    .reduce((total, item) => total + item.amount_paise, 0)
  const totalSpendingPaise = expensesPaidPaise + pettyCashSpentPaise
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredTransactions = useMemo(() => {
    return transactionHistory.filter(item => {
      const date = localDateString(item.transaction_date.toDate())
      return (transactionTypeFilter === 'all' || item.type === transactionTypeFilter) &&
        (!transactionFrom || date >= transactionFrom) &&
        (!transactionTo || date <= transactionTo) &&
        (!normalizedSearch || [
          item.transaction_id,
          item.reference_no,
          item.description,
          item.category_name,
          item.party_name ?? '',
          item.created_by_name,
          displayTag(item.festival_tag_id, item.festival_tag),
        ].some(value => value.toLocaleLowerCase().includes(normalizedSearch)))
    })
  }, [normalizedSearch, transactionFrom, transactionTo, transactionTypeFilter, transactionHistory, festivalTags])
  const accountMutation = useMutation({
    mutationFn: (input: NewAccountInput) => createAccount(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setShowAccountForm(false)
      if (queuedTransactionAction) {
        setQuickTransactionAction(queuedTransactionAction)
        setQueuedTransactionAction(null)
      }
    },
  })
  const transactionMutation = useMutation({
    mutationFn: ({ input, receipt }: { input: NewTransactionInput; receipt?: File }) => recordTransaction(input, receipt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      if (quickTransactionAction === 'petty_cash') {
        showTransactionSuccess('Petty cash spending saved successfully.')
      }
      setQuickTransactionAction(null)
    },
  })
  const editTransactionMutation = useMutation({
    mutationFn: ({ transaction, input }: { transaction: FinancialTransaction; input: EditTransactionInput }) => editTransaction(transaction, input),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        variables.transaction.linked_order_id
          ? queryClient.invalidateQueries({ queryKey: ['orders'] })
          : Promise.resolve(),
      ])
      setEditingTransaction(null)
    },
  })
  const editExpenseMutation = useMutation({
    mutationFn: ({ expense, input }: { expense: FinancialExpense; input: EditExpenseInput }) => editFinancialExpense(expense, input),
    onSuccess: () => {
      setEditingExpense(null)
      showTransactionSuccess('Expense updated successfully.', 5000)
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: async (target: PendingDelete) => {
      if (target.kind === 'expense') await deleteFinancialExpense(target.record)
      else await deleteFinancialTransaction(target.record, target.pettyCashSpending === true)
    },
    onSuccess: async (_result, target) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        target.kind === 'transaction' && target.record.linked_order_id
          ? queryClient.invalidateQueries({ queryKey: ['orders'] })
          : Promise.resolve(),
      ])
      setPendingDelete(null)
      setDeleteError('')
      showDeleteSuccess(target.kind === 'expense'
        ? 'Expense deleted successfully.'
        : target.pettyCashSpending ? 'Petty cash spending deleted successfully.' : 'Transaction deleted successfully.')
    },
    onError: () => {
      setDeleteError('Unable to delete the transaction. Please try again.')
    },
  })
  const expenseMutation = useMutation({
    mutationFn: (input: NewExpenseInput) => createExpense(input),
    onSuccess: () => {
      setShowExpenseForm(false)
      showTransactionSuccess('Expense saved successfully.')
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
  const categoryMutation = useMutation({
    mutationFn: ({ name, type }: { name: string; type: 'income' | 'expense' }) => createFinancialCategory(name, type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', 'categories'] }),
  })

  const failures = [
    { source: 'financial_accounts', error: accountsQuery.error },
    { source: 'financial_transactions', error: totalsQuery.error },
    { source: 'financial_transactions', error: transactionsQuery.error },
    { source: 'financial_transactions (all transactions)', error: allTransactionsQuery.error },
    { source: 'financial_expenses', error: expensesQuery.error },
    { source: 'vendors', error: vendorsQuery.error },
    { source: 'financial_categories', error: categoriesQuery.error },
    { source: 'financial_transactions (customer payments)', error: customerPaymentsQuery.error },
    { source: 'orders (delivered customer payments)', error: deliveredOrdersQuery.error },
    { source: 'site_config (festival tags)', error: festivalTagsQuery.error },
    { source: 'financial_expenses (vendor payables)', error: vendorDueQuery.error },
    { source: 'financial_transactions (reports)', error: reportTransactionsQuery.error },
    { source: 'financial_transactions (petty cash)', error: pettyCashTransactionsQuery.error },
    { source: 'financial_expenses (reports)', error: reportExpensesQuery.error },
  ].filter((item): item is { source: string; error: Error } => item.error instanceof Error)
  const openAccountForm = (continueToTransaction?: QuickTransactionAction) => {
    setQueuedTransactionAction(continueToTransaction ?? null)
    setShowAccountForm(true)
  }
  const requestDelete = (target: PendingDelete) => {
    deleteMutation.reset()
    clearDeleteSuccessTimer()
    setDeleteSuccessMessage('')
    setDeleteError('')
    setPendingDelete(target.kind === 'transaction'
      ? { ...target, pettyCashSpending: target.pettyCashSpending === true || isPettyCashSpending(target.record) }
      : target)
  }
  const openTransactionAction = (action: QuickTransactionAction) => {
    clearTransactionSuccessTimer()
    setTransactionSuccessMessage('')
    if (action === 'petty_cash' || activeAccounts.some(account => account.type !== 'petty_cash')) {
      setQuickTransactionAction(action)
      return
    }
    openAccountForm(action)
  }
  const transactionTypeForAction = (action: QuickTransactionAction) =>
    action === 'income' ? 'income' : action === 'transfer' ? 'transfer' : 'expense'
  const accountTypeForAction = (action: QuickTransactionAction) =>
    action === 'petty_cash' ? 'petty_cash' as const : undefined
  const pendingDeleteIsPettyCash = pendingDelete?.kind === 'transaction' && pendingDelete.pettyCashSpending === true
  const pendingDeleteIsExpense = pendingDelete?.kind === 'expense' ||
    (pendingDelete?.kind === 'transaction' && pendingDelete.record.type === 'expense' && !pendingDeleteIsPettyCash)
  const pendingDeleteDetails = pendingDelete
    ? deleteConfirmationDetails(pendingDelete, expenses, festivalTags)
    : null

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Finance workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Accounts</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">See what came in, what went out, and how much is available.</p>
        </div>
        <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ['accounts'] })}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {transactionSuccessMessage && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {transactionSuccessMessage}
        </p>
      )}
      {deleteSuccessMessage && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {deleteSuccessMessage}
        </p>
      )}

      {failures.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <CircleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Some Accounts data could not be loaded.</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {failures.map((item, index) => (
                <li key={`${item.source}-${index}`}>
                  <strong>{item.source}:</strong> Unable to load. Check your connection and admin access, then retry.
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span>No unavailable data is treated as zero. Technical details are logged in the browser console.</span>
              <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ['accounts'] })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 font-semibold hover:bg-rose-100">
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          </div>
        </div>
      )}
      <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Accounts sections">
        {([
          ['overview', 'Overview'],
          ['transactions', 'Transaction History'],
          ['expenses', 'Expenses'],
          ['receivables', 'Customer Payments'],
          ['petty_cash', 'Petty Cash'],
          ['reports', 'Reports'],
          ['tags', 'Tags'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4 sm:py-2.5 ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Spending overview</h2>
              <p className="mt-1 text-sm text-slate-500">Expenses paid and Petty Cash spending for the selected period.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <CalendarDays size={16} />
                <select value={datePreset} onChange={event => setDatePreset(event.target.value as DatePreset)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This Week</option><option value="month">This Month</option><option value="custom">Custom Date Range</option><option value="all">All Time</option>
                </select>
              </label>
              {datePreset === 'custom' && (
                <>
                  <input aria-label="From date" type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <input aria-label="To date" type="date" value={customTo} onChange={event => setCustomTo(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Total Expenses Paid" value={loadingOrUnavailable(reportTransactionsQuery.isPending || reportExpensesQuery.isPending, reportTransactionsQuery.isError || reportExpensesQuery.isError, expensesPaidPaise)} icon={<ArrowUpRight size={18} />} tone="red" />
            <MetricCard label="Total Petty Cash Spent" value={loadingOrUnavailable(reportTransactionsQuery.isPending || reportExpensesQuery.isPending, reportTransactionsQuery.isError || reportExpensesQuery.isError, pettyCashSpentPaise)} icon={<CircleDollarSign size={18} />} tone="amber" />
            <MetricCard label="Total Spending" value={loadingOrUnavailable(reportTransactionsQuery.isPending || reportExpensesQuery.isPending, reportTransactionsQuery.isError || reportExpensesQuery.isError, totalSpendingPaise)} icon={<ArrowLeftRight size={18} />} tone="blue" />
          </div>
        </section>
      )}

      {tab === 'transactions' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">Transaction History</h2>
              <p className="mt-0.5 text-xs text-slate-500">Balance shows the account’s current balance. Transfers are shown separately from money in and out.</p>
            </div>
            <button type="button" onClick={() => downloadReportFile(
              'accounts-transactions.csv',
              `\uFEFF${[['Transaction ID', 'Date', 'Type', 'Reference', 'Description', 'Category', 'Tag', 'Amount (INR)', 'Account', 'Payment Status'], ...filteredTransactions.map(item => [
                item.transaction_id,
                item.transaction_date.toDate().toLocaleDateString('en-IN'),
                item.type,
                item.reference_no,
                item.description,
                item.category_name,
                displayTag(item.festival_tag_id, item.festival_tag),
                (item.amount_paise / 100).toFixed(2),
                accounts.find(account => account.id === item.account_id)?.name ?? item.account_id,
                transactionPaymentStatus(item, expenses, customerPayments),
              ])].map(row => row.map(escapeCsvCell).join(',')).join('\r\n')}`,
              'text/csv;charset=utf-8',
            )} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700">
              <Download size={15} /> Export Filtered
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-2 lg:grid-cols-[minmax(18rem,2fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(13rem,1.2fr)]">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
              Search Transactions
              <span className="relative block">
                <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search transactions"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm font-normal text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200" />
              </span>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
              From Date
              <input type="date" value={transactionFrom} max={transactionTo || undefined} onChange={event => setTransactionFrom(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
              To Date
              <input type="date" value={transactionTo} min={transactionFrom || undefined} onChange={event => setTransactionTo(event.target.value)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200" />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-slate-600">
              Transaction Type
              <select aria-label="Filter transaction type" value={transactionTypeFilter} onChange={event => setTransactionTypeFilter(event.target.value as typeof transactionTypeFilter)}
                className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200">
                <option value="all">All Money Movements</option><option value="income">Money received</option><option value="expense">Money spent</option><option value="transfer">Transfers</option>
              </select>
            </label>
          </div>
          {allTransactionsQuery.isPending ? <div className="p-8 text-center text-sm text-slate-500">Loading all transactions…</div>
            : allTransactionsQuery.isError ? <div className="p-8 text-center text-sm text-rose-700">Transaction history is unavailable. See the permission error above.</div>
              : <TransactionTable rows={filteredTransactions} accounts={accounts} festivalTags={festivalTags}
                  paymentStatus={item => transactionPaymentStatus(item, expenses, customerPayments)}
                  onView={setSelectedTransaction} onEdit={setEditingTransaction}
                  onDelete={record => requestDelete({ kind: 'transaction', record })} />}
        </section>
      )}

      {tab === 'expenses' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Expenses</h2>
              <p className="mt-1 text-sm text-slate-500">Record what was paid and what is still due. Vendor payment details stay available below.</p>
            </div>
            <button type="button" onClick={() => setShowExpenseForm(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              <Plus size={16} /> Add expense
            </button>
          </div>
          {expensesQuery.isPending ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading expenses…</div>
            : expensesQuery.isError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700">
              <p>Unable to load expense records. Existing records have not been changed.</p>
              <button type="button" onClick={() => void expensesQuery.refetch()}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 font-semibold hover:bg-rose-100">
                <RefreshCw size={14} /> Retry
              </button>
            </div>
              : expenses.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No expenses have been recorded.</div>
                : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-[1250px] w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                      <th className="px-4 py-3">Expense ID</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3">Tag</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Payment Status</th><th className="px-4 py-3">Payment Method</th>
                      <th className="px-4 py-3">Vendor / Reference / Receipts</th><th className="px-4 py-3">Actions</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleExpenses.map(expense => (
                        <tr key={expense.id}>
                          <td className="px-4 py-3 whitespace-nowrap font-medium text-slate-700">{isDisplayableExpenseId(expense.expense_id) ? expense.expense_id : '—'}</td>
                          <td className="px-4 py-3 whitespace-nowrap">{expense.transaction_date.toDate().toLocaleDateString('en-GB')}</td>
                          <td className="px-4 py-3">{expense.category_name}</td>
                          <td className="px-4 py-3 text-slate-700">{expense.description || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{displayTag(expense.festival_tag_id, expense.festival_tag)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatINR(expense.amount_paise)}</td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${expense.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : expense.payment_status === 'partially_paid' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{expense.payment_status === 'paid' ? 'Fully Paid' : expense.payment_status === 'partially_paid' ? 'Partially Paid' : 'Unpaid'}</span></td>
                          <td className="px-4 py-3 capitalize">{expense.payment_method || '—'}</td>
                          <td className="px-4 py-3">
                            <p>{expense.vendor_name || '—'}</p>
                            <p className="mt-1 text-xs text-slate-500">Payment ref: {expense.payment_reference || '—'}</p>
                            <p className="mt-1 text-xs text-slate-500">Reference: {expense.reference_no || '—'}</p>
                            <ExpenseReceipts expense={expense} />
                          </td>
                          <td className="px-4 py-3"><div className="flex items-center gap-1">
                            <button type="button" onClick={() => setEditingExpense(expense)} aria-label={`Edit expense ${expense.description}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                            <button type="button" onClick={() => requestDelete({ kind: 'expense', record: expense })} aria-label={`Delete expense ${expense.description}`} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                          </div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {expensePageCount > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                      <span>Page {expensePage + 1} of {expensePageCount} · {expenses.length} expenses</span>
                      <div className="flex gap-2">
                        <button type="button" disabled={expensePage === 0} onClick={() => setExpensePage(page => page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
                        <button type="button" disabled={expensePage + 1 >= expensePageCount} onClick={() => setExpensePage(page => page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
                      </div>
                    </div>
                  )}
                </div>}
        </section>
      )}

      {tab === 'receivables' && (
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Customer payments</h2>
            <p className="mt-1 text-sm text-slate-500">Delivered orders and their saved payment status.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Total Delivered Order Value"
              value={deliveredOrdersQuery.isPending ? 'Loading…' : deliveredOrdersQuery.isError ? 'Unavailable' : formatINR(deliveredOrderTotals.orderValuePaise)}
              icon={<CircleDollarSign size={18} />} tone="blue" />
            <MetricCard label="Total Payments Received"
              value={deliveredOrdersQuery.isPending ? 'Loading…' : deliveredOrdersQuery.isError ? 'Unavailable' : formatINR(deliveredOrderTotals.receivedPaise)}
              icon={<ArrowUpRight size={18} />} tone="green" />
            <MetricCard label="Total Pending Payments"
              value={deliveredOrdersQuery.isPending ? 'Loading…' : deliveredOrdersQuery.isError ? 'Unavailable' : formatINR(deliveredOrderTotals.pendingPaise)}
              icon={<ArrowLeftRight size={18} />} tone="amber" />
          </div>
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-2">
              <label className="relative min-w-[220px] flex-1">
                <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input value={customerPaymentSearch} onChange={event => setCustomerPaymentSearch(event.target.value)}
                  placeholder="Search order ID or customer"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">From
                <input type="date" value={customerPaymentFrom} max={customerPaymentTo || undefined}
                  onChange={event => setCustomerPaymentFrom(event.target.value)}
                  className="rounded-xl border border-slate-300 px-2 py-2 text-sm text-slate-700" />
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-500">To
                <input type="date" value={customerPaymentTo} min={customerPaymentFrom || undefined}
                  onChange={event => setCustomerPaymentTo(event.target.value)}
                  className="rounded-xl border border-slate-300 px-2 py-2 text-sm text-slate-700" />
              </label>
              <select aria-label="Filter customer payments by method" value={customerPaymentMethodFilter}
                onChange={event => setCustomerPaymentMethodFilter(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="all">All payment methods</option>
                {customerPaymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
              </select>
              <select aria-label="Filter customer payments by status" value={customerPaymentStatusFilter}
                onChange={event => setCustomerPaymentStatusFilter(event.target.value as typeof customerPaymentStatusFilter)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="all">All payment statuses</option>
                <option value="paid">Fully Paid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="pending">Unpaid</option>
              </select>
            </div>
            {deliveredOrdersQuery.isPending
              ? <div className="p-8 text-center text-sm text-slate-500">Loading delivered orders…</div>
              : deliveredOrdersQuery.isError
                ? <div role="alert" className="p-8 text-center text-sm text-rose-700">Delivered orders are unavailable.</div>
                : deliveredOrderPayments.length === 0
                  ? <div className="p-8 text-center text-sm text-slate-500">No delivered orders.</div>
                  : filteredDeliveredOrderPayments.length === 0
                    ? <div className="p-8 text-center text-sm text-slate-500">No delivered orders match these filters.</div>
                    : <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="min-w-[900px] w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Order ID</th>
                            <th className="px-4 py-3 text-right">Total Amount (₹)</th>
                            <th className="px-4 py-3 text-right">Pending Amount (₹)</th>
                            <th className="px-4 py-3">Payment Method</th>
                            <th className="px-4 py-3">Payment Status</th>
                            <th className="px-4 py-3">View</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredDeliveredOrderPayments.map(payment => (
                            <tr key={payment.order.id}>
                              <td className="px-4 py-3 font-medium text-slate-900">{payment.orderNumber}</td>
                              <td className="px-4 py-3 text-right">{formatINR(payment.totalPaise)}</td>
                              <td className="px-4 py-3 text-right">{formatINR(payment.pendingPaise)}</td>
                              <td className="px-4 py-3">{payment.paymentMethods.join(', ') || '—'}</td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  payment.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700'
                                    : payment.paymentStatus === 'partially_paid' ? 'bg-amber-50 text-amber-700'
                                      : 'bg-rose-50 text-rose-700'
                                }`}>
                                  {payment.paymentStatus === 'paid' ? 'Fully Paid'
                                    : payment.paymentStatus === 'partially_paid' ? 'Partially Paid' : 'Unpaid'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <Link to={`/orders/${payment.order.id}`}
                                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                  View
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>}
          </section>
        </section>
      )}

      {tab === 'petty_cash' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Petty Cash</h2>
              <p className="mt-1 text-sm text-slate-500">Record and review petty cash spending.</p>
            </div>
            <button type="button" onClick={() => openTransactionAction('petty_cash')}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              <Plus size={16} /> Add Spending
            </button>
          </div>
          {(() => {
            const pettyRows = (pettyCashTransactionsQuery.data ?? []).filter(item =>
              item.type === 'expense' && isPettyCashSpending(item),
            )
            const currentMonth = localDateString(new Date()).slice(0, 7)
            const totalSpent = pettyRows.reduce((total, item) => total + item.amount_paise, 0)
            const monthSpent = pettyRows
              .filter(item => localDateString(item.transaction_date.toDate()).slice(0, 7) === currentMonth)
              .reduce((total, item) => total + item.amount_paise, 0)
            return (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Total Petty Cash Spent" value={pettyCashTransactionsQuery.isPending ? 'Loading…' : pettyCashTransactionsQuery.isError ? 'Unavailable' : formatINR(totalSpent)} icon={<ArrowUpRight size={18} />} tone="red" />
                  <MetricCard label="Total Spending Transactions" value={pettyCashTransactionsQuery.isPending ? 'Loading…' : pettyCashTransactionsQuery.isError ? 'Unavailable' : String(pettyRows.length)} icon={<CircleDollarSign size={18} />} tone="blue" />
                  <MetricCard label="This Month's Spending" value={pettyCashTransactionsQuery.isPending ? 'Loading…' : pettyCashTransactionsQuery.isError ? 'Unavailable' : formatINR(monthSpent)} icon={<CalendarDays size={18} />} tone="amber" />
                </div>
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold text-slate-900">Spending history</h3></div>
                  {pettyCashTransactionsQuery.isPending ? <div className="p-8 text-center text-sm text-slate-500">Loading petty cash spending…</div>
                    : pettyCashTransactionsQuery.isError ? <div className="p-8 text-center text-sm text-rose-700">Petty cash spending is unavailable.</div>
                      : <TransactionTable rows={pettyRows} accounts={accounts} festivalTags={festivalTags} pettyCash
                        onEdit={setEditingTransaction}
                        onDelete={record => requestDelete({ kind: 'transaction', record, pettyCashSpending: true })} />}
                </section>
              </>
            )
          })()}
        </section>
      )}

      {tab === 'reports' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Spending reports</h2>
              <p className="mt-1 text-sm text-slate-500">Expenses paid and Petty Cash spending for the selected period.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <CalendarDays size={16} />
                <select value={datePreset} onChange={event => setDatePreset(event.target.value as DatePreset)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This Week</option><option value="month">This Month</option><option value="custom">Custom Date Range</option><option value="all">All Time</option>
                </select>
              </label>
              {datePreset === 'custom' && (
                <>
                  <input aria-label="From date" type="date" value={customFrom} onChange={event => setCustomFrom(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                  <input aria-label="To date" type="date" value={customTo} onChange={event => setCustomTo(event.target.value)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
                </>
              )}
            </div>
          </div>
          {reportTransactionsQuery.isPending || reportExpensesQuery.isPending
            ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Preparing spending reports…</div>
            : reportTransactionsQuery.isError || reportExpensesQuery.isError
              ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Spending reports could not be loaded. Check the financial transaction and expense collection permissions.</div>
              : (() => {
                const ledger = overviewLedger
                const expenses = reportExpenses
                const pettyCashRows = ledger.filter(item => item.type === 'expense' && isPettyCashSpending(item))
                const expensesPaid = expenses.reduce((sum, item) => sum + expenseSpendingPaise(item), 0)
                const pettyCashSpent = pettyCashRows.reduce((sum, item) => sum + item.amount_paise, 0)
                const totalSpending = expensesPaid + pettyCashSpent
                const daily = new Map<string, { expenses: number; pettyCash: number }>()
                const monthly = new Map<string, { expenses: number; pettyCash: number }>()
                const categories = new Map<string, { expenses: number; pettyCash: number }>()
                const ensure = <T,>(map: Map<string, T>, key: string, value: T) => map.get(key) ?? value
                for (const item of expenses) {
                  const day = localDateString(item.transaction_date.toDate())
                  const month = day.slice(0, 7)
                  const dailyValue = ensure(daily, day, { expenses: 0, pettyCash: 0 })
                  dailyValue.expenses += expenseSpendingPaise(item)
                  daily.set(day, dailyValue)
                  const monthlyValue = ensure(monthly, month, { expenses: 0, pettyCash: 0 })
                  monthlyValue.expenses += expenseSpendingPaise(item)
                  monthly.set(month, monthlyValue)
                  const categoryValue = ensure(categories, item.category_name || 'Uncategorized', { expenses: 0, pettyCash: 0 })
                  categoryValue.expenses += expenseSpendingPaise(item)
                  categories.set(item.category_name || 'Uncategorized', categoryValue)
                }
                for (const item of pettyCashRows) {
                  const day = localDateString(item.transaction_date.toDate())
                  const month = day.slice(0, 7)
                  const dailyValue = ensure(daily, day, { expenses: 0, pettyCash: 0 })
                  dailyValue.pettyCash += item.amount_paise
                  daily.set(day, dailyValue)
                  const monthlyValue = ensure(monthly, month, { expenses: 0, pettyCash: 0 })
                  monthlyValue.pettyCash += item.amount_paise
                  monthly.set(month, monthlyValue)
                  const categoryValue = ensure(categories, item.category_name || 'Uncategorized', { expenses: 0, pettyCash: 0 })
                  categoryValue.pettyCash += item.amount_paise
                  categories.set(item.category_name || 'Uncategorized', categoryValue)
                }
                const dayRows = [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => [
                  new Date(`${day}T00:00:00`).toLocaleDateString('en-GB'),
                  formatINR(value.expenses),
                  formatINR(value.pettyCash),
                  formatINR(value.expenses + value.pettyCash),
                ])
                const monthRows = [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => {
                  const [year, monthNumber] = month.split('-').map(Number)
                  return [
                    new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                    formatINR(value.expenses),
                    formatINR(value.pettyCash),
                    formatINR(value.expenses + value.pettyCash),
                  ]
                })
                const categoryRows = [...categories.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([category, value]) => [
                  category,
                  formatINR(value.expenses),
                  formatINR(value.pettyCash),
                  formatINR(value.expenses + value.pettyCash),
                ])
                const dailyTotalRow = ['Total', formatINR(expensesPaid), formatINR(pettyCashSpent), formatINR(totalSpending)]
                const dailyReportRows = [...dayRows, dailyTotalRow]
                const monthlyReportRows = [...monthRows, ['Total', formatINR(expensesPaid), formatINR(pettyCashSpent), formatINR(totalSpending)]]
                const categoryReportRows = [...categoryRows, ['Total', formatINR(expensesPaid), formatINR(pettyCashSpent), formatINR(totalSpending)]]
                const reportExportRows = [
                  ['SPENDING SUMMARY'],
                  ['Total Expenses Paid', (expensesPaid / 100).toFixed(2)],
                  ['Total Petty Cash Spent', (pettyCashSpent / 100).toFixed(2)],
                  ['Total Spending', (totalSpending / 100).toFixed(2)],
                  [],
                  ['DAILY SPENDING REPORT'],
                  ['Date', 'Expenses Paid', 'Petty Cash Spent', 'Total Spending'],
                  ...dayRows,
                  ['Total', (expensesPaid / 100).toFixed(2), (pettyCashSpent / 100).toFixed(2), (totalSpending / 100).toFixed(2)],
                  [],
                  ['MONTHLY SPENDING REPORT'],
                  ['Month', 'Expenses Paid', 'Petty Cash Spent', 'Total Spending'],
                  ...monthRows,
                  ['Total', (expensesPaid / 100).toFixed(2), (pettyCashSpent / 100).toFixed(2), (totalSpending / 100).toFixed(2)],
                  [],
                  ['CATEGORY-WISE SPENDING REPORT'],
                  ['Category', 'Expenses Paid', 'Petty Cash Spent', 'Total Spending'],
                  ...categoryRows,
                  ['Total', (expensesPaid / 100).toFixed(2), (pettyCashSpent / 100).toFixed(2), (totalSpending / 100).toFixed(2)],
                ]
                const exportCsv = () => downloadReportFile(
                  'accounts-spending-report.csv',
                  `\uFEFF${reportExportRows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n')}`,
                  'text/csv;charset=utf-8',
                )
                const exportExcel = () => {
                  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Spending Report"><Table>${reportExportRows.map(row => `<Row>${row.map(cell => `<Cell><Data ss:Type="String">${String(cell ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
                  downloadReportFile('accounts-spending-report.xml', xml, 'application/vnd.ms-excel;charset=utf-8')
                }
                return (
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MetricCard label="Total Expenses Paid" value={formatINR(expensesPaid)} icon={<ArrowUpRight size={18} />} tone="red" />
                      <MetricCard label="Total Petty Cash Spent" value={formatINR(pettyCashSpent)} icon={<CircleDollarSign size={18} />} tone="amber" />
                      <MetricCard label="Total Spending" value={formatINR(totalSpending)} icon={<ArrowLeftRight size={18} />} tone="blue" />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"><Download size={15} /> Export CSV</button>
                      <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"><Download size={15} /> Export Excel workbook</button>
                    </div>
                    <ReportTable title="Daily Spending Report" headers={['Date', 'Expenses Paid', 'Petty Cash Spent', 'Total Spending']} rows={dailyReportRows} />
                    <ReportTable title="Monthly Spending Report" headers={['Month', 'Expenses Paid', 'Petty Cash Spent', 'Total Spending']} rows={monthlyReportRows} />
                    <ReportTable title="Category-wise Spending Report" headers={['Category', 'Expenses Paid', 'Petty Cash Spent', 'Total Spending']} rows={categoryReportRows} />
                  </div>
                )
              })()}
        </section>
      )}

      {tab === 'tags' && (
        <section>
          <FestivalProductTags
            selectedFestival={selectedTagCategory}
            onSelectFestival={setSelectedTagCategory}
          />
        </section>
      )}

      {showAccountForm && (
        <AccountForm key={queuedTransactionAction ?? 'default-account'} initialType={queuedTransactionAction === 'petty_cash' ? 'petty_cash' : 'cash'}
          saving={accountMutation.isPending} onClose={() => {
          setShowAccountForm(false)
          setQueuedTransactionAction(null)
        }}
          onSave={input => accountMutation.mutateAsync(input)} />
      )}
      {quickTransactionAction && (
        <TransactionForm key={quickTransactionAction}
          type={transactionTypeForAction(quickTransactionAction)}
          accountType={accountTypeForAction(quickTransactionAction)}
          accounts={activeAccounts} financialCategories={categoriesQuery.data ?? []} festivalTags={festivalTags}
          onCreateCategory={(name, type) => categoryMutation.mutateAsync({ name, type })} saving={transactionMutation.isPending}
          onClose={() => setQuickTransactionAction(null)}
          onSave={(input, receipt) => transactionMutation.mutateAsync({ input, receipt })} />
      )}
      {editingTransaction && (
        isPettyCashSpending(editingTransaction)
          ? <TransactionForm key={`petty-edit-${editingTransaction.id}`} type="expense" accountType="petty_cash"
              accounts={activeAccounts} financialCategories={categoriesQuery.data ?? []} festivalTags={festivalTags}
              onCreateCategory={(name, type) => categoryMutation.mutateAsync({ name, type })} saving={editTransactionMutation.isPending}
              initialTransaction={editingTransaction} onClose={() => setEditingTransaction(null)}
              onEditSave={input => editTransactionMutation.mutateAsync({ transaction: editingTransaction, input })} />
          : <TransactionEditForm transaction={editingTransaction} accounts={accounts} festivalTags={festivalTags} saving={editTransactionMutation.isPending}
              onClose={() => setEditingTransaction(null)}
              onSave={input => editTransactionMutation.mutateAsync({ transaction: editingTransaction, input })} />
      )}
      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="transaction-details-title" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="transaction-details-title" className="text-lg font-semibold text-slate-900">Transaction details</h2><p className="mt-1 text-sm text-slate-500">{selectedTransaction.transaction_id}</p></div>
              <button type="button" onClick={() => setSelectedTransaction(null)} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">×</button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-slate-500">Type</dt><dd className="text-right font-medium capitalize">{selectedTransaction.type.replace(/_/g, ' ')}</dd>
              <dt className="text-slate-500">Amount</dt><dd className="text-right font-semibold">{formatINR(selectedTransaction.amount_paise)}</dd>
              <dt className="text-slate-500">Date</dt><dd className="text-right">{selectedTransaction.transaction_date.toDate().toLocaleDateString('en-IN')}</dd>
              <dt className="text-slate-500">Reference</dt><dd className="break-all text-right">{selectedTransaction.reference_no || '—'}</dd>
              <dt className="text-slate-500">Account</dt><dd className="text-right">{accounts.find(account => account.id === selectedTransaction.account_id)?.name ?? (selectedTransaction.account_id === PETTY_CASH_TRANSACTION_ACCOUNT_ID ? 'Petty Cash' : selectedTransaction.account_id === UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID ? 'Expense payment' : 'Unknown account')}</dd>
              {selectedTransaction.transfer_to_account_id && <><dt className="text-slate-500">Destination</dt><dd className="text-right">{accounts.find(account => account.id === selectedTransaction.transfer_to_account_id)?.name ?? 'Unknown account'}</dd></>}
              <dt className="text-slate-500">Category</dt><dd className="text-right">{selectedTransaction.category_name}</dd>
              <dt className="text-slate-500">Tag</dt><dd className="text-right">{displayTag(selectedTransaction.festival_tag_id, selectedTransaction.festival_tag)}</dd>
              <dt className="text-slate-500">Payment method</dt><dd className="text-right">{selectedTransaction.payment_method || '—'}</dd>
              <dt className="text-slate-500">Description</dt><dd className="text-right">{selectedTransaction.description}</dd>
              {selectedTransaction.party_name && <><dt className="text-slate-500">Customer or vendor</dt><dd className="text-right">{selectedTransaction.party_name}</dd></>}
            </dl>
            {selectedTransaction.receipt_paths.map(path => <TransactionReceiptLink key={path} path={path} />)}
            <div className="flex justify-end"><button type="button" onClick={() => setSelectedTransaction(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Close</button></div>
          </section>
        </div>
      )}
      {(showExpenseForm || editingExpense) && (
        <ExpenseForm key={editingExpense?.id ?? 'new-expense'} vendors={vendorsQuery.data ?? []} categories={categoriesQuery.data ?? []}
          festivalTags={festivalTagsQuery.data ?? []} festivalTagsLoading={festivalTagsQuery.isFetching}
          festivalTagsError={festivalTagsQuery.isError} initialExpense={editingExpense ?? undefined}
          onCreateCategory={(name, type) => categoryMutation.mutateAsync({ name, type })} saving={expenseMutation.isPending || editExpenseMutation.isPending}
          onClose={() => { setShowExpenseForm(false); setEditingExpense(null) }}
          onSave={input => expenseMutation.mutateAsync(input)}
          onEditSave={input => editingExpense
            ? editExpenseMutation.mutateAsync({ expense: editingExpense, input })
            : Promise.reject(new Error('Select an expense to edit.'))} />
      )}
      {pendingDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-transaction-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <h2 id="delete-transaction-title" className="text-lg font-semibold text-slate-900">
              {pendingDeleteIsPettyCash ? 'Delete Petty Cash Spending?' : pendingDeleteIsExpense ? 'Delete Expense?' : 'Delete Transaction?'}
            </h2>
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-3 text-sm">
              <dt className="text-slate-500">Transaction ID / Expense ID</dt><dd className="break-all text-right font-medium text-slate-800">{pendingDeleteDetails?.id}</dd>
              <dt className="text-slate-500">Date</dt><dd className="text-right font-medium text-slate-800">{pendingDeleteDetails?.date}</dd>
              <dt className="text-slate-500">Category</dt><dd className="text-right font-medium text-slate-800">{pendingDeleteDetails?.category}</dd>
              <dt className="text-slate-500">Tag</dt><dd className="text-right font-medium text-slate-800">{pendingDeleteDetails?.tag}</dd>
              <dt className="text-slate-500">Amount</dt><dd className="text-right font-semibold text-slate-900">{pendingDeleteDetails?.amount}</dd>
            </dl>
            <p className="mt-3 text-sm text-slate-600">
              {pendingDeleteIsExpense
                ? 'Are you sure you want to delete this expense? This action cannot be undone.'
                : 'Are you sure you want to delete this transaction? This action cannot be undone.'}
            </p>
            {deleteError && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={deleteMutation.isPending} onClick={() => { setPendingDelete(null); deleteMutation.reset() }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50">Cancel</button>
              <button type="button" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(pendingDelete)} className="rounded-xl bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
