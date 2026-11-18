import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  CircleDollarSign,
  CircleAlert,
  CircleOff,
  Download,
  Plus,
  Power,
  ReceiptText,
  RefreshCw,
  Search,
  UserRound,
  Wallet,
} from 'lucide-react'
import { AccountForm } from '@/components/accounts/AccountForm'
import { ExpenseForm } from '@/components/accounts/ExpenseForm'
import { ExpenseReceipts } from '@/components/accounts/ExpenseReceipts'
import { MetricCard } from '@/components/accounts/MetricCard'
import { PaymentForm } from '@/components/accounts/PaymentForm'
import { TransactionForm } from '@/components/accounts/TransactionForm'
import { TransactionEditForm } from '@/components/accounts/TransactionEditForm'
import { TransactionReceiptLink } from '@/components/accounts/TransactionReceiptLink'
import { TransactionTable } from '@/components/accounts/TransactionTable'
import { useAccounts } from '@/hooks/useAccounts'
import {
  createAccount,
  createFinancialCategory,
  createExpense,
  editTransaction,
  fetchReportExpenses,
  fetchReportTransactions,
  formatINR,
  recordCustomerPayment,
  recordExpensePayment,
  recordTransaction,
  setAccountActive,
} from '@/lib/accounts'
import type {
  FinancialExpense,
  CustomerReceivable,
  NewAccountInput,
  NewExpenseInput,
  NewTransactionInput,
  RecordPaymentInput,
  EditTransactionInput,
  FinancialTransaction,
} from '@/types/accounts'

type Tab = 'overview' | 'transactions' | 'expenses' | 'receivables' | 'petty_cash' | 'reports'
type QuickTransactionAction = 'income' | 'expense' | 'transfer' | 'petty_cash'

type DatePreset = 'today' | 'week' | 'month' | 'custom' | 'all'
const EXPENSES_PER_PAGE = 50

function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function dateRangeFor(preset: DatePreset, customFrom: string, customTo: string) {
  const today = new Date()
  const to = localDateString(today)
  if (preset === 'today') return { from: to, to }
  if (preset === 'week') {
    const from = new Date(today)
    from.setDate(from.getDate() - 6)
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

export default function Accounts() {
  const [tab, setTab] = useState<Tab>('overview')
  const [search, setSearch] = useState('')
  const [transactionFrom, setTransactionFrom] = useState('')
  const [transactionTo, setTransactionTo] = useState('')
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [quickTransactionAction, setQuickTransactionAction] = useState<QuickTransactionAction | null>(null)
  const [queuedTransactionAction, setQueuedTransactionAction] = useState<QuickTransactionAction | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null)
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [expensePage, setExpensePage] = useState(0)
  const [receivablePage, setReceivablePage] = useState(0)
  const [selectedExpense, setSelectedExpense] = useState<FinancialExpense | null>(null)
  const [selectedReceivable, setSelectedReceivable] = useState<CustomerReceivable | null>(null)
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const dateRange = useMemo(() => dateRangeFor(datePreset, customFrom, customTo), [datePreset, customFrom, customTo])
  const queryClient = useQueryClient()
  const {
    accounts: accountsQuery,
    totals: totalsQuery,
    transactions: transactionsQuery,
    expenses: expensesQuery,
    vendors: vendorsQuery,
    categories: categoriesQuery,
    receivables: receivablesQuery,
    vendorDue: vendorDueQuery,
  } = useAccounts(dateRange)
  const reportTransactionsQuery = useQuery({
    queryKey: ['accounts', 'report-transactions', dateRange.from ?? '', dateRange.to ?? ''],
    queryFn: () => fetchReportTransactions(dateRange),
    enabled: tab === 'reports',
  })
  const reportExpensesQuery = useQuery({
    queryKey: ['accounts', 'report-expenses', dateRange.from ?? '', dateRange.to ?? ''],
    queryFn: () => fetchReportExpenses(dateRange),
    enabled: tab === 'reports',
  })

  const accounts = accountsQuery.data ?? []
  const transactions = transactionsQuery.data?.pages.flatMap(page => page.items) ?? []
  const expenses = expensesQuery.data ?? []
  const expensePageCount = Math.ceil(expenses.length / EXPENSES_PER_PAGE)
  const visibleExpenses = expenses.slice(expensePage * EXPENSES_PER_PAGE, (expensePage + 1) * EXPENSES_PER_PAGE)
  const receivables = receivablesQuery.data ?? []
  const receivablePageCount = Math.ceil(receivables.length / EXPENSES_PER_PAGE)
  const visibleReceivables = receivables.slice(receivablePage * EXPENSES_PER_PAGE, (receivablePage + 1) * EXPENSES_PER_PAGE)
  const activeAccounts = accounts.filter(account => account.active)
  const accountBalance = (type: 'cash' | 'bank' | 'upi') =>
    accountsQuery.data?.filter(account => account.type === type).reduce((total, account) => total + account.balance_paise, 0)
  const customerDuePaise = receivablesQuery.data?.reduce((total, order) => total + order.outstanding_paise, 0)
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredTransactions = useMemo(() => {
    return transactions.filter(item => {
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
        ].some(value => value.toLocaleLowerCase().includes(normalizedSearch)))
    })
  }, [normalizedSearch, transactionFrom, transactionTo, transactionTypeFilter, transactions])
  const availableBalancePaise = accountsQuery.data
    ?.filter(account => account.active)
    .reduce((total, account) => total + account.balance_paise, 0)

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
      setQuickTransactionAction(null)
    },
  })
  const editTransactionMutation = useMutation({
    mutationFn: ({ transaction, input }: { transaction: FinancialTransaction; input: EditTransactionInput }) => editTransaction(transaction, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setEditingTransaction(null)
    },
  })
  const expenseMutation = useMutation({
    mutationFn: (input: NewExpenseInput) => createExpense(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setShowExpenseForm(false)
    },
  })
  const vendorPaymentMutation = useMutation({
    mutationFn: ({ expense, input }: { expense: FinancialExpense; input: RecordPaymentInput }) => recordExpensePayment(expense, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setSelectedExpense(null)
    },
  })
  const customerPaymentMutation = useMutation({
    mutationFn: ({ receivable, input }: { receivable: CustomerReceivable; input: RecordPaymentInput }) => recordCustomerPayment(receivable, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['accounts'] }),
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
      ])
      setSelectedReceivable(null)
    },
  })
  const accountStatusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setAccountActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', 'accounts'] }),
  })
  const categoryMutation = useMutation({
    mutationFn: ({ name, type }: { name: string; type: 'income' | 'expense' }) => createFinancialCategory(name, type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', 'categories'] }),
  })

  const failures = [
    { source: 'financial_accounts', error: accountsQuery.error },
    { source: 'financial_transactions', error: totalsQuery.error },
    { source: 'financial_transactions', error: transactionsQuery.error },
    { source: 'financial_expenses', error: expensesQuery.error },
    { source: 'vendors', error: vendorsQuery.error },
    { source: 'financial_categories', error: categoriesQuery.error },
    { source: 'orders (customer receivables)', error: receivablesQuery.error },
    { source: 'financial_expenses (vendor payables)', error: vendorDueQuery.error },
    { source: 'financial_transactions (reports)', error: reportTransactionsQuery.error },
    { source: 'financial_expenses (reports)', error: reportExpensesQuery.error },
  ].filter((item): item is { source: string; error: Error } => item.error instanceof Error)
  const actionError = accountStatusMutation.error
  const openAccountForm = (continueToTransaction?: QuickTransactionAction) => {
    setQueuedTransactionAction(continueToTransaction ?? null)
    setShowAccountForm(true)
  }
  const openTransactionAction = (action: QuickTransactionAction) => {
    const needsPettyCash = action === 'petty_cash'
    const hasAccount = activeAccounts.some(account => !needsPettyCash || account.type === 'petty_cash')
    if (hasAccount) {
      setQuickTransactionAction(action)
      return
    }
    openAccountForm(action)
  }
  const transactionTypeForAction = (action: QuickTransactionAction) =>
    action === 'income' ? 'income' : action === 'transfer' ? 'transfer' : 'expense'
  const accountTypeForAction = (action: QuickTransactionAction) =>
    action === 'petty_cash' ? 'petty_cash' as const : undefined

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-600">Finance workspace</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Accounts</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-500">See what came in, what went out, and how much is available.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ['accounts'] })}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw size={15} /> Refresh
          </button>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button type="button" onClick={() => openTransactionAction('income')} disabled={accountsQuery.isPending || accountsQuery.isError}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              <ArrowDownLeft size={16} /> Money Received
            </button>
            <button type="button" onClick={() => openTransactionAction('expense')} disabled={accountsQuery.isPending || accountsQuery.isError}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-50">
              <ArrowUpRight size={16} /> Money Paid
            </button>
            <button type="button" onClick={() => openTransactionAction('transfer')} disabled={accountsQuery.isPending || accountsQuery.isError}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
              <ArrowLeftRight size={16} /> Transfer Money
            </button>
            <button type="button" onClick={() => openTransactionAction('petty_cash')} disabled={accountsQuery.isPending || accountsQuery.isError}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              <Wallet size={16} /> Petty Cash
            </button>
          </div>
        </div>
      </header>

      {accountsQuery.isSuccess && activeAccounts.length === 0 && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Choose a money action to set up an account first. The form will open when the account is saved.
        </p>
      )}

      {failures.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <CircleAlert size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Some Accounts data could not be loaded.</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {failures.map((item, index) => <li key={`${item.source}-${index}`}><strong>{item.source}:</strong> {item.error.message}</li>)}
            </ul>
            <p className="mt-2 text-xs">No missing totals are treated as zero. Check the user role and the admin-only Firestore rules.</p>
          </div>
        </div>
      )}
      {actionError instanceof Error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError.message}</p>
      )}

      <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Accounts sections">
        {([
          ['overview', 'Overview'],
          ['transactions', 'All Transactions'],
          ['expenses', 'Expenses'],
          ['receivables', 'Customer Payments'],
          ['petty_cash', 'Petty Cash'],
          ['reports', 'Reports'],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4 sm:py-2.5 ${tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <section className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Financial overview</h2>
              <p className="mt-1 text-sm text-slate-500">Income and expenses follow the selected period. Balances and outstanding dues are current.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <CalendarDays size={16} />
                <select value={datePreset} onChange={event => setDatePreset(event.target.value as DatePreset)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="custom">Custom dates</option><option value="all">All time</option>
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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Money Received" value={loadingOrUnavailable(totalsQuery.isPending, totalsQuery.isError, totalsQuery.data?.income_paise)} icon={<ArrowDownLeft size={18} />} tone="green" />
            <MetricCard label="Money Spent" value={loadingOrUnavailable(totalsQuery.isPending, totalsQuery.isError, totalsQuery.data?.expense_paise)} icon={<ArrowUpRight size={18} />} tone="red" />
            <MetricCard label="Net Money Movement" value={loadingOrUnavailable(
              totalsQuery.isPending,
              totalsQuery.isError,
              totalsQuery.data && totalsQuery.data.income_paise - totalsQuery.data.expense_paise,
            )} icon={<ArrowLeftRight size={18} />} tone="blue" />
            <MetricCard label="Available Balance" value={loadingOrUnavailable(
              accountsQuery.isPending,
              accountsQuery.isError,
              availableBalancePaise,
            )} icon={<CircleDollarSign size={18} />} tone="green" />
            <MetricCard label="Cash balance" value={loadingOrUnavailable(accountsQuery.isPending, accountsQuery.isError, accountBalance('cash'))} icon={<Wallet size={18} />} />
            <MetricCard label="Bank balance" value={loadingOrUnavailable(accountsQuery.isPending, accountsQuery.isError, accountBalance('bank'))} icon={<Banknote size={18} />} tone="blue" />
            <MetricCard label="UPI balance" value={loadingOrUnavailable(accountsQuery.isPending, accountsQuery.isError, accountBalance('upi'))} icon={<ArrowDownLeft size={18} />} tone="amber" />
            <MetricCard label="Petty cash balance" value={loadingOrUnavailable(
              accountsQuery.isPending,
              accountsQuery.isError,
              accountsQuery.data?.filter(account => account.type === 'petty_cash').reduce((total, account) => total + account.balance_paise, 0),
            )} icon={<Wallet size={18} />} tone="amber" />
            <MetricCard label="Customer Payments Due" value={loadingOrUnavailable(receivablesQuery.isPending, receivablesQuery.isError, customerDuePaise)} icon={<UserRound size={18} />} />
            <MetricCard label="Vendor Payments Due" value={loadingOrUnavailable(vendorDueQuery.isPending, vendorDueQuery.isError, vendorDueQuery.data)} icon={<ReceiptText size={18} />} tone="red" />
          </div>
          <p className="-mt-3 text-xs text-slate-500">Available Balance combines active Cash, Bank, UPI and Petty Cash accounts. Opening balances are not counted as money received or spent.</p>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">Your accounts</h2>
                <p className="mt-0.5 text-xs text-slate-500">Opening balances stay separate from money received and money spent. Transfers only move money between accounts.</p>
              </div>
              <button type="button" onClick={() => openAccountForm()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Plus size={15} /> Add account
              </button>
            </div>
            {accountsQuery.isPending ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading accounts…</div>
            ) : accountsQuery.isError ? (
              <div className="p-8 text-center text-sm text-rose-700">Account balances are unavailable. See the permission error above.</div>
            ) : accounts.length ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map(account => (
                  <article key={account.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-semibold text-slate-900">{account.name}</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{account.type.replace('_', ' ')}</span>
                    </div>
                    <p className="mt-4 text-xl font-bold text-slate-950">{formatINR(account.balance_paise)}</p>
                    <p className="mt-1 text-xs text-slate-500">Opening balance {formatINR(account.opening_balance_paise)}</p>
                    <button type="button" disabled={accountStatusMutation.isPending || (!account.active && account.balance_paise !== 0)}
                      onClick={() => accountStatusMutation.mutate({ id: account.id, active: !account.active })}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40">
                      {account.active ? <><CircleOff size={13} /> Deactivate</> : <><Power size={13} /> Activate</>}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-10 text-center">
                <Wallet className="mx-auto text-slate-300" size={30} />
                <p className="mt-3 font-semibold text-slate-800">Set up your first account</p>
                <p className="mt-1 text-sm text-slate-500">Add a cash, bank, or UPI account to start recording transactions.</p>
                <button type="button" onClick={() => openAccountForm()} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Add account</button>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">Recent transactions</h2>
                <p className="mt-0.5 text-xs text-slate-500">Latest 100 money movements. Transfers do not count as money received or spent.</p>
              </div>
              <button type="button" onClick={() => setTab('transactions')} className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">View all</button>
            </div>
            {transactionsQuery.isPending ? <div className="p-8 text-center text-sm text-slate-500">Loading transactions…</div>
              : transactionsQuery.isError ? <div className="p-8 text-center text-sm text-rose-700">Transaction history is unavailable. See the permission error above.</div>
                : <TransactionTable rows={transactions.slice(0, 8)} accounts={accounts} simple />}
          </section>
        </section>
      )}

      {tab === 'transactions' && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-slate-900">All transactions</h2>
              <p className="mt-0.5 text-xs text-slate-500">Balance shows the account’s current balance. Transfers are shown separately from money in and out.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="relative block">
                <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search transactions"
                  className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-sm sm:w-64" />
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-500">From
                <input type="date" value={transactionFrom} max={transactionTo || undefined} onChange={event => setTransactionFrom(event.target.value)}
                  className="rounded-xl border border-slate-300 px-2 py-2 text-sm text-slate-700" />
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-500">To
                <input type="date" value={transactionTo} min={transactionFrom || undefined} onChange={event => setTransactionTo(event.target.value)}
                  className="rounded-xl border border-slate-300 px-2 py-2 text-sm text-slate-700" />
              </label>
              <select aria-label="Filter transaction type" value={transactionTypeFilter} onChange={event => setTransactionTypeFilter(event.target.value as typeof transactionTypeFilter)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="all">All money movements</option><option value="income">Money received</option><option value="expense">Money spent</option><option value="transfer">Transfers</option>
              </select>
              <button type="button" onClick={() => downloadReportFile(
                'accounts-transactions.csv',
                `\uFEFF${[['Transaction ID', 'Date', 'Type', 'Reference', 'Description', 'Category', 'Amount (INR)', 'Account'], ...filteredTransactions.map(item => [
                  item.transaction_id,
                  item.transaction_date.toDate().toLocaleDateString('en-IN'),
                  item.type,
                  item.reference_no,
                  item.description,
                  item.category_name,
                  (item.amount_paise / 100).toFixed(2),
                  accounts.find(account => account.id === item.account_id)?.name ?? item.account_id,
                ])].map(row => row.map(escapeCsvCell).join(',')).join('\r\n')}`,
                'text/csv;charset=utf-8',
              )} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                <Download size={15} /> Export loaded
              </button>
            </div>
          </div>
          {transactionsQuery.isPending ? <div className="p-8 text-center text-sm text-slate-500">Loading transactions…</div>
            : transactionsQuery.isError ? <div className="p-8 text-center text-sm text-rose-700">Transaction history is unavailable. See the permission error above.</div>
              : <>
                <TransactionTable rows={filteredTransactions} accounts={accounts} simple
                  onView={setSelectedTransaction} onEdit={setEditingTransaction} />
                {transactionsQuery.hasNextPage && (
                  <div className="border-t border-slate-100 p-4 text-center">
                    <button type="button" disabled={transactionsQuery.isFetchingNextPage} onClick={() => void transactionsQuery.fetchNextPage()}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">
                      {transactionsQuery.isFetchingNextPage ? 'Loading…' : 'Load older transactions'}
                    </button>
                  </div>
                )}
              </>}
        </section>
      )}

      {tab === 'expenses' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Expenses</h2>
              <p className="mt-1 text-sm text-slate-500">Record what was paid and what is still due. Vendor payment details stay available below.</p>
            </div>
            <button type="button" onClick={() => setShowExpenseForm(true)} disabled={!accounts.length}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              <Plus size={16} /> Add expense
            </button>
          </div>
          {expensesQuery.isPending ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading expenses…</div>
            : expensesQuery.isError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700">Expense records are unavailable.</div>
              : expenses.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No expenses have been recorded.</div>
                : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-[900px] w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                      <th className="px-4 py-3">Date / Description</th><th className="px-4 py-3">Category / Vendor</th><th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-right">Paid</th><th className="px-4 py-3 text-right">Due</th><th className="px-4 py-3">Receipts</th><th className="px-4 py-3">Action</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleExpenses.map(expense => (
                        <tr key={expense.id}>
                          <td className="px-4 py-3"><p className="font-medium text-slate-900">{expense.description}</p><p className="mt-1 text-xs text-slate-500">{expense.transaction_date.toDate().toLocaleDateString('en-IN')} · {expense.reference_no || 'No invoice reference'}</p></td>
                          <td className="px-4 py-3"><p className="text-slate-800">{expense.category_name}</p><p className="mt-1 text-xs text-slate-500">{expense.vendor_name || 'No vendor linked'}</p></td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${expense.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : expense.payment_status === 'partially_paid' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>{expense.payment_status.replace('_', ' ')}</span></td>
                          <td className="px-4 py-3 text-right font-medium">{formatINR(expense.amount_paise)}</td>
                          <td className="px-4 py-3 text-right">{formatINR(expense.paid_paise)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatINR(expense.outstanding_paise)}</td>
                          <td className="px-4 py-3"><ExpenseReceipts expense={expense} /></td>
                          <td className="px-4 py-3">{expense.outstanding_paise > 0 && <button type="button" onClick={() => setSelectedExpense(expense)} className="whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Record payment</button>}</td>
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
            <h2 className="text-lg font-semibold text-slate-900">Customer payments due</h2>
            <p className="mt-1 text-sm text-slate-500">These amounts come from existing orders. Recording a payment updates the order and adds one linked receipt.</p>
          </div>
          {receivablesQuery.isPending ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading customer balances…</div>
            : receivablesQuery.isError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700">Customer balances are unavailable. Existing Orders access must be permitted for this account.</div>
              : receivables.length === 0 ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">There are no outstanding customer payments.</div>
                : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <table className="min-w-[760px] w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>
                      <th className="px-4 py-3">Order / Customer</th><th className="px-4 py-3">Order status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Received</th><th className="px-4 py-3 text-right">Outstanding</th><th className="px-4 py-3">Action</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleReceivables.map(order => (
                        <tr key={order.id}>
                          <td className="px-4 py-3"><p className="font-semibold text-slate-900">{order.order_number}</p><p className="mt-1 text-xs text-slate-500">{order.customer_name}</p></td>
                          <td className="px-4 py-3 capitalize">{order.status.replace(/_/g, ' ')}</td>
                          <td className="px-4 py-3 text-right">{formatINR(order.total_paise)}</td>
                          <td className="px-4 py-3 text-right">{formatINR(order.paid_paise)}</td>
                          <td className="px-4 py-3 text-right font-semibold">{formatINR(order.outstanding_paise)}</td>
                          <td className="px-4 py-3"><button type="button" onClick={() => setSelectedReceivable(order)} className="whitespace-nowrap rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Record receipt</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {receivablePageCount > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
                      <span>Page {receivablePage + 1} of {receivablePageCount} · {receivables.length} outstanding orders</span>
                      <div className="flex gap-2">
                        <button type="button" disabled={receivablePage === 0} onClick={() => setReceivablePage(page => page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Previous</button>
                        <button type="button" disabled={receivablePage + 1 >= receivablePageCount} onClick={() => setReceivablePage(page => page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40">Next</button>
                      </div>
                    </div>
                  )}
                </div>}
        </section>
      )}

      {tab === 'petty_cash' && (
        <section className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Petty cash</h2>
            <p className="mt-1 text-sm text-slate-500">See small cash balances and spending. Use the Petty Cash button above to record spending from a petty cash account.</p>
          </div>
          {accountsQuery.isPending ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading petty cash accounts…</div>
            : accountsQuery.isError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700">Petty cash balances are unavailable.</div>
              : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {accounts.filter(account => account.type === 'petty_cash').map(account => (
                  <article key={account.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-medium text-slate-500">{account.name}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{formatINR(account.balance_paise)}</p>
                    <p className="mt-1 text-xs text-slate-500">Opening balance {formatINR(account.opening_balance_paise)}</p>
                  </article>
                ))}
                {!accounts.some(account => account.type === 'petty_cash') && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center sm:col-span-2 xl:col-span-3">
                    <Wallet className="mx-auto text-slate-300" size={30} />
                    <p className="mt-3 font-semibold text-slate-800">No petty cash account yet</p>
                    <button type="button" onClick={() => openAccountForm()} className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Create petty cash account</button>
                  </div>
                )}
              </div>}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold text-slate-900">Petty cash activity</h3></div>
            {transactionsQuery.isPending ? <div className="p-8 text-center text-sm text-slate-500">Loading petty cash activity…</div>
              : transactionsQuery.isError ? <div className="p-8 text-center text-sm text-rose-700">Petty cash activity is unavailable.</div>
                : <TransactionTable rows={transactions.filter(item => {
                  const sourceIsPetty = accounts.find(account => account.id === item.account_id)?.type === 'petty_cash'
                  const destinationIsPetty = item.transfer_to_account_id != null && accounts.find(account => account.id === item.transfer_to_account_id)?.type === 'petty_cash'
                  return sourceIsPetty || destinationIsPetty
                })} accounts={accounts} />}
          </section>
        </section>
      )}

      {tab === 'reports' && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Financial reports</h2>
              <p className="mt-1 text-sm text-slate-500">Cashbook, income and expense statement, account ledger, expense categories, and monthly summary.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <CalendarDays size={16} />
                <select value={datePreset} onChange={event => setDatePreset(event.target.value as DatePreset)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="today">Today</option><option value="week">Last 7 days</option><option value="month">This month</option><option value="custom">Custom dates</option><option value="all">All time</option>
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
            ? <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Preparing reports…</div>
            : reportTransactionsQuery.isError || reportExpensesQuery.isError
              ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Reports could not be fully loaded. Check the financial transaction and expense collection permissions.</div>
              : (() => {
                const ledger = reportTransactionsQuery.data ?? []
                const reportExpenses = reportExpensesQuery.data ?? []
                const income = ledger.filter(item => item.type === 'income').reduce((total, item) => total + item.amount_paise, 0)
                const expense = ledger.filter(item => item.type === 'expense').reduce((total, item) => total + item.amount_paise, 0)
                const daily = new Map<string, { income: number; expense: number }>()
                const monthly = new Map<string, { income: number; expense: number; count: number }>()
                const byAccount = new Map<string, { opening: number; incoming: number; outgoing: number; count: number }>()
                for (const item of ledger) {
                  const date = item.transaction_date.toDate()
                  const dayKey = localDateString(date)
                  const monthKey = dayKey.slice(0, 7)
                  const day = daily.get(dayKey) ?? { income: 0, expense: 0 }
                  const month = monthly.get(monthKey) ?? { income: 0, expense: 0, count: 0 }
                  const account = byAccount.get(item.account_id) ?? { opening: 0, incoming: 0, outgoing: 0, count: 0 }
                  if (item.type === 'income') {
                    day.income += item.amount_paise
                    month.income += item.amount_paise
                    account.incoming += item.amount_paise
                  } else if (item.type === 'expense') {
                    day.expense += item.amount_paise
                    month.expense += item.amount_paise
                    account.outgoing += item.amount_paise
                  } else if (item.type === 'transfer') {
                    account.outgoing += item.amount_paise
                    const destination = byAccount.get(item.transfer_to_account_id ?? '') ?? { opening: 0, incoming: 0, outgoing: 0, count: 0 }
                    destination.incoming += item.amount_paise
                    destination.count += 1
                    byAccount.set(item.transfer_to_account_id ?? '', destination)
                  } else if (item.type === 'opening_balance') {
                    account.opening += item.amount_paise
                  }
                  month.count += 1
                  account.count += 1
                  daily.set(dayKey, day)
                  monthly.set(monthKey, month)
                  byAccount.set(item.account_id, account)
                }
                const expenseByCategory = new Map<string, number>()
                for (const item of reportExpenses) expenseByCategory.set(item.category_name, (expenseByCategory.get(item.category_name) ?? 0) + item.amount_paise)
                const rows = [
                  ['Date', 'Transaction ID', 'Type', 'Reference', 'Description', 'Category', 'Amount (INR)', 'Account', 'Transfer destination'],
                  ...ledger.map(item => [
                    item.transaction_date.toDate().toLocaleDateString('en-IN'),
                    item.transaction_id,
                    item.type,
                    item.reference_no,
                    item.description,
                    item.category_name,
                    (item.amount_paise / 100).toFixed(2),
                    accounts.find(account => account.id === item.account_id)?.name ?? item.account_id,
                    accounts.find(account => account.id === item.transfer_to_account_id)?.name ?? '',
                  ]),
                ]
                const reportExportRows = [
                  ['FINANCIAL SUMMARY', 'Amount (INR)'],
                  ['Income', (income / 100).toFixed(2)],
                  ['Expenses paid', (expense / 100).toFixed(2)],
                  ['Net cash flow', ((income - expense) / 100).toFixed(2)],
                  [],
                  ['EXPENSE CATEGORY BREAKDOWN', 'Amount (INR)'],
                  ...[...expenseByCategory.entries()].map(([category, amount]) => [category, (amount / 100).toFixed(2)]),
                  [],
                  ['TRANSACTION LEDGER'],
                  ...rows,
                ]
                const exportCsv = () => downloadReportFile(
                  'accounts-report.csv',
                  `\uFEFF${reportExportRows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n')}`,
                  'text/csv;charset=utf-8',
                )
                const exportExcel = () => {
                  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Accounts Report"><Table>${reportExportRows.map(row => `<Row>${row.map(cell => `<Cell><Data ss:Type="String">${String(cell ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`
                  downloadReportFile('accounts-report.xml', xml, 'application/vnd.ms-excel;charset=utf-8')
                }
                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"><Download size={15} /> Export CSV</button>
                      <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700"><Download size={15} /> Export Excel workbook</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MetricCard label="Income" value={formatINR(income)} icon={<ArrowDownLeft size={18} />} tone="green" />
                      <MetricCard label="Expenses paid" value={formatINR(expense)} icon={<ArrowUpRight size={18} />} tone="red" />
                      <MetricCard label="Net cash flow" value={formatINR(income - expense)} icon={<ArrowLeftRight size={18} />} tone="blue" />
                    </div>
                    <div className="grid gap-5 xl:grid-cols-2">
                      <ReportTable title="Daily cashbook" headers={['Date', 'Income', 'Expense', 'Net']} rows={[...daily.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, value]) => [date, formatINR(value.income), formatINR(value.expense), formatINR(value.income - value.expense)])} />
                      <ReportTable title="Monthly summary" headers={['Month', 'Income', 'Expense', 'Entries']} rows={[...monthly.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, value]) => [month, formatINR(value.income), formatINR(value.expense), String(value.count)])} />
                      <ReportTable title="Account-wise ledger" headers={['Account', 'Opening entries', 'Money in', 'Money out', 'Current balance']} rows={[...byAccount.entries()].map(([id, value]) => [accounts.find(account => account.id === id)?.name ?? 'Unknown account', formatINR(value.opening), formatINR(value.incoming), formatINR(value.outgoing), formatINR(accounts.find(account => account.id === id)?.balance_paise ?? 0)])} />
                      <ReportTable title="Expense category breakdown" headers={['Category', 'Expense amount']} rows={[...expenseByCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => [category, formatINR(amount)])} />
                    </div>
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-semibold text-slate-900">Recent cashbook transactions</h3><p className="mt-1 text-xs text-slate-500">Showing the latest 100 in this period; exports include the full report.</p></div>
                      <TransactionTable rows={ledger.slice(0, 100)} accounts={accounts} />
                    </section>
                  </div>
                )
              })()}
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
          accounts={activeAccounts} financialCategories={categoriesQuery.data ?? []}
          onCreateCategory={(name, type) => categoryMutation.mutateAsync({ name, type })} saving={transactionMutation.isPending}
          onClose={() => setQuickTransactionAction(null)}
          onSave={(input, receipt) => transactionMutation.mutateAsync({ input, receipt })} />
      )}
      {editingTransaction && (
        <TransactionEditForm transaction={editingTransaction} saving={editTransactionMutation.isPending}
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
              <dt className="text-slate-500">Account</dt><dd className="text-right">{accounts.find(account => account.id === selectedTransaction.account_id)?.name ?? 'Unknown account'}</dd>
              {selectedTransaction.transfer_to_account_id && <><dt className="text-slate-500">Destination</dt><dd className="text-right">{accounts.find(account => account.id === selectedTransaction.transfer_to_account_id)?.name ?? 'Unknown account'}</dd></>}
              <dt className="text-slate-500">Category</dt><dd className="text-right">{selectedTransaction.category_name}</dd>
              <dt className="text-slate-500">Payment method</dt><dd className="text-right">{selectedTransaction.payment_method || '—'}</dd>
              <dt className="text-slate-500">Description</dt><dd className="text-right">{selectedTransaction.description}</dd>
              {selectedTransaction.party_name && <><dt className="text-slate-500">Customer or vendor</dt><dd className="text-right">{selectedTransaction.party_name}</dd></>}
            </dl>
            {selectedTransaction.receipt_paths.map(path => <TransactionReceiptLink key={path} path={path} />)}
            <div className="flex justify-end"><button type="button" onClick={() => setSelectedTransaction(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Close</button></div>
          </section>
        </div>
      )}
      {showExpenseForm && (
        <ExpenseForm accounts={activeAccounts} vendors={vendorsQuery.data ?? []} categories={categoriesQuery.data ?? []}
          onCreateCategory={(name, type) => categoryMutation.mutateAsync({ name, type })} saving={expenseMutation.isPending}
          onClose={() => setShowExpenseForm(false)} onSave={input => expenseMutation.mutateAsync(input)} />
      )}
      {selectedExpense && (
        <PaymentForm title="Record vendor payment" detail={selectedExpense.vendor_name || selectedExpense.description}
          outstandingPaise={selectedExpense.outstanding_paise} accounts={activeAccounts} saving={vendorPaymentMutation.isPending}
          onClose={() => setSelectedExpense(null)} onSave={input => vendorPaymentMutation.mutateAsync({ expense: selectedExpense, input })} />
      )}
      {selectedReceivable && (
        <PaymentForm title="Record customer receipt" detail={`${selectedReceivable.order_number} · ${selectedReceivable.customer_name}`}
          outstandingPaise={selectedReceivable.outstanding_paise} accounts={activeAccounts} saving={customerPaymentMutation.isPending}
          onClose={() => setSelectedReceivable(null)} onSave={input => customerPaymentMutation.mutateAsync({ receivable: selectedReceivable, input })} />
      )}
    </div>
  )
}
