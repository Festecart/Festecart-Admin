import {
  arrayUnion,
  collection,
  doc,
  getAggregateFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  sum,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type Query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from 'firebase/firestore'
import { deleteObject, ref as storageRef, uploadBytes } from 'firebase/storage'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { app, auth, db, storage } from '@/lib/firebase'
import type {
  AccountTotals,
  AccountDateRange,
  EditTransactionInput,
  FinancialAccount,
  FinancialAccountType,
  FinancialCategory,
  FinancialExpense,
  FinancialTransaction,
  FinancialTransactionType,
  CustomerReceivable,
  NewExpenseInput,
  NewAccountInput,
  NewTransactionInput,
  RecordPaymentInput,
  VendorOption,
} from '@/types/accounts'

const ACCOUNTS = 'financial_accounts'
const TRANSACTIONS = 'financial_transactions'
const EXPENSES = 'financial_expenses'
const CATEGORIES = 'financial_categories'
const PAGE_SIZE = 100

function requireActor() {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in with an admin account to use Accounts.')
  return {
    uid: user.uid,
    name: user.displayName || user.email || user.uid,
    email: user.email || '',
  }
}

function assertPaise(amount: number, label: string, allowZero = false): void {
  if (!Number.isSafeInteger(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw new Error(`${label} must be a valid ${allowZero ? 'non-negative' : 'positive'} paise amount.`)
  }
}

function readNonnegativeInteger(value: unknown, label: string): number {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`The stored ${label} is invalid. Ask an administrator to review this record.`)
  }
  return amount
}

function readAccount(id: string, data: DocumentData): FinancialAccount {
  if (!['cash', 'bank', 'upi', 'petty_cash'].includes(String(data.type))) {
    throw new Error(`Account ${id} has an unsupported type.`)
  }
  if (!(data.created_at instanceof Timestamp)) {
    throw new Error(`Account ${id} has no valid creation timestamp.`)
  }
  return {
    id,
    name: String(data.name ?? ''),
    type: data.type as FinancialAccountType,
    opening_balance_paise: readNonnegativeInteger(data.opening_balance_paise, 'opening balance'),
    balance_paise: readNonnegativeInteger(data.balance_paise, 'account balance'),
    active: data.active !== false,
    created_at: data.created_at,
  }
}

function readTransaction(id: string, data: DocumentData): FinancialTransaction {
  if (!['income', 'expense', 'transfer', 'opening_balance'].includes(String(data.type))) {
    throw new Error(`Transaction ${id} has an unsupported type.`)
  }
  if (!(data.transaction_date instanceof Timestamp) || !(data.created_at instanceof Timestamp)) {
    throw new Error(`Transaction ${id} has an invalid date.`)
  }
  return {
    id,
    transaction_id: String(data.transaction_id ?? id),
    type: data.type as FinancialTransactionType,
    transaction_date: data.transaction_date,
    reference_no: String(data.reference_no ?? ''),
    description: String(data.description ?? ''),
    category_name: String(data.category_name ?? ''),
    amount_paise: readNonnegativeInteger(data.amount_paise, 'transaction amount'),
    account_id: String(data.account_id ?? ''),
    transfer_to_account_id: (data.transfer_to_account_id as string | null) ?? null,
    linked_order_id: (data.linked_order_id as string | null) ?? null,
    linked_expense_id: (data.linked_expense_id as string | null) ?? null,
    party_name: (data.party_name as string | null) ?? null,
    receipt_paths: Array.isArray(data.receipt_paths) ? data.receipt_paths.filter((path): path is string => typeof path === 'string') : [],
    payment_method: String(data.payment_method ?? ''),
    created_by: String(data.created_by ?? ''),
    created_by_name: String(data.created_by_name ?? ''),
    created_at: data.created_at,
  }
}

function readExpense(id: string, data: DocumentData): FinancialExpense {
  if (!(data.transaction_date instanceof Timestamp) || !(data.created_at instanceof Timestamp)) {
    throw new Error(`Expense ${id} has an invalid date.`)
  }
  if (data.due_date != null && !(data.due_date instanceof Timestamp)) {
    throw new Error(`Expense ${id} has an invalid due date.`)
  }
  if (!['unpaid', 'partially_paid', 'paid'].includes(String(data.payment_status))) {
    throw new Error(`Expense ${id} has an unsupported payment status.`)
  }
  const amountPaise = readNonnegativeInteger(data.amount_paise, 'expense amount')
  const paidPaise = readNonnegativeInteger(data.paid_paise, 'expense paid amount')
  const outstandingPaise = readNonnegativeInteger(data.outstanding_paise, 'expense outstanding amount')
  if (paidPaise + outstandingPaise !== amountPaise) {
    throw new Error(`Expense ${id} has inconsistent paid and outstanding balances.`)
  }
  if (data.receipt_paths != null && (!Array.isArray(data.receipt_paths) || data.receipt_paths.some((path: unknown) => typeof path !== 'string'))) {
    throw new Error(`Expense ${id} has invalid receipt attachments.`)
  }
  return {
    id,
    description: String(data.description ?? ''),
    category_name: String(data.category_name ?? ''),
    vendor_id: (data.vendor_id as string | null) ?? null,
    vendor_name: String(data.vendor_name ?? ''),
    reference_no: String(data.reference_no ?? ''),
    transaction_date: data.transaction_date,
    due_date: (data.due_date as Timestamp | null) ?? null,
    amount_paise: amountPaise,
    paid_paise: paidPaise,
    outstanding_paise: outstandingPaise,
    payment_status: data.payment_status,
    is_vendor_payable: data.is_vendor_payable === true,
    receipt_paths: (data.receipt_paths as string[] | undefined) ?? [],
    created_by: String(data.created_by ?? ''),
    created_at: data.created_at,
  }
}

export function rupeesToPaise(value: string): number {
  const normalized = value.trim()
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Enter an amount with no more than two decimal places.')
  }
  const [whole, fraction = ''] = normalized.split('.')
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  assertPaise(amount, 'Amount')
  return amount
}

export function formatINR(amountPaise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountPaise / 100)
}

export function dateInputTimestamp(value: string): Timestamp {
  const date = new Date(`${value}T00:00:00`)
  if (!value || Number.isNaN(date.getTime())) throw new Error('Choose a valid transaction date.')
  return Timestamp.fromDate(date)
}

export async function fetchAccounts(): Promise<FinancialAccount[]> {
  const snapshot = await getDocs(query(collection(db, ACCOUNTS), orderBy('created_at', 'desc')))
  return snapshot.docs.map(item => readAccount(item.id, item.data()))
}

export interface FinancialTransactionPage {
  items: FinancialTransaction[]
  cursor: QueryDocumentSnapshot<DocumentData> | null
  hasMore: boolean
}

export async function editTransaction(
  transactionRow: FinancialTransaction,
  input: EditTransactionInput,
): Promise<void> {
  const actor = requireActor()
  if (transactionRow.type === 'opening_balance' || transactionRow.linked_order_id || transactionRow.linked_expense_id) {
    throw new Error('This linked or opening-balance entry is protected. Correct it through its source workflow.')
  }
  if (!input.description.trim() || input.description.trim().length > 250) throw new Error('Enter a description of 1–250 characters.')
  if (!input.category_name.trim() || input.category_name.trim().length > 80) throw new Error('Choose a category of 1–80 characters.')
  const transactionRef = doc(db, TRANSACTIONS, transactionRow.id)
  const now = Timestamp.now()
  const nextDate = dateInputTimestamp(input.transaction_date)

  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(transactionRef)
    if (!snapshot.exists()) throw new Error('The transaction no longer exists.')
    const data = snapshot.data()
    if (!data || data.linked_order_id || data.linked_expense_id || data.type === 'opening_balance') {
      throw new Error('This linked or opening-balance entry is protected. Correct it through its source workflow.')
    }
    transaction.update(transactionRef, {
      transaction_date: nextDate,
      description: input.description.trim(),
      category_name: input.category_name.trim(),
      updated_by: actor.uid,
      updated_by_name: actor.name,
      updated_at: now,
      audit: arrayUnion({
        action: 'metadata_edited',
        previous: {
          transaction_date: data.transaction_date,
          description: data.description,
          category_name: data.category_name,
        },
        next: {
          transaction_date: nextDate,
          description: input.description.trim(),
          category_name: input.category_name.trim(),
        },
        admin_user_id: actor.uid,
        created_at: now,
      }),
    })
  })
}

export async function fetchTransactionPage(
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<FinancialTransactionPage> {
  const baseQuery = query(collection(db, TRANSACTIONS), orderBy('transaction_date', 'desc'))
  const pageQuery = cursor
    ? query(baseQuery, startAfter(cursor), limit(PAGE_SIZE))
    : query(baseQuery, limit(PAGE_SIZE))
  const snapshot = await getDocs(pageQuery)
  return {
    items: snapshot.docs.map(item => readTransaction(item.id, item.data())),
    cursor: snapshot.docs[snapshot.docs.length - 1] ?? null,
    hasMore: snapshot.docs.length === PAGE_SIZE,
  }
}

async function fetchAllPages(baseQuery: Query<DocumentData>): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const rows: QueryDocumentSnapshot<DocumentData>[] = []
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null
  while (true) {
    const pageQuery: Query<DocumentData> = cursor
      ? query(baseQuery, startAfter(cursor), limit(500))
      : query(baseQuery, limit(500))
    const snapshot: QuerySnapshot<DocumentData> = await getDocs(pageQuery)
    rows.push(...snapshot.docs)
    if (snapshot.docs.length < 500) break
    cursor = snapshot.docs[snapshot.docs.length - 1]
  }
  return rows
}

function rangeConstraints(range: AccountDateRange): QueryConstraint[] {
  const constraints: QueryConstraint[] = []
  if (range.from && range.to && range.from > range.to) {
    throw new Error('The start date cannot be after the end date.')
  }
  if (range.from) constraints.push(where('transaction_date', '>=', dateInputTimestamp(range.from)))
  if (range.to) {
    const end = new Date(`${range.to}T00:00:00`)
    end.setDate(end.getDate() + 1)
    constraints.push(where('transaction_date', '<', Timestamp.fromDate(end)))
  }
  return constraints
}

export async function fetchReportTransactions(range: AccountDateRange): Promise<FinancialTransaction[]> {
  const baseQuery = query(collection(db, TRANSACTIONS), ...rangeConstraints(range), orderBy('transaction_date', 'desc'))
  const documents = await fetchAllPages(baseQuery)
  return documents.map(item => readTransaction(item.id, item.data()))
}

export async function fetchReportExpenses(range: AccountDateRange): Promise<FinancialExpense[]> {
  const baseQuery = query(collection(db, EXPENSES), ...rangeConstraints(range), orderBy('transaction_date', 'desc'))
  const documents = await fetchAllPages(baseQuery)
  return documents.map(item => readExpense(item.id, item.data()))
}

export async function fetchExpenses(): Promise<FinancialExpense[]> {
  const documents = await fetchAllPages(query(collection(db, EXPENSES), orderBy('transaction_date', 'desc')))
  return documents.map(item => readExpense(item.id, item.data()))
}

export async function fetchVendors(): Promise<VendorOption[]> {
  const snapshot = await getDocs(collection(db, 'vendors'))
  return snapshot.docs.map(item => ({
    id: item.id,
    name: String(item.data().business_name ?? item.data().name ?? item.id),
  }))
}

export async function fetchFinancialCategories(): Promise<FinancialCategory[]> {
  const snapshot = await getDocs(query(collection(db, CATEGORIES), orderBy('name', 'asc')))
  return snapshot.docs.map(item => ({
    id: item.id,
    name: String(item.data().name ?? ''),
    type: item.data().type === 'income' ? 'income' : 'expense',
  }))
}

export async function refreshAccountsAdminClaims(): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('Sign in with an admin account to access Accounts.')
  const refreshClaims = httpsCallable<Record<string, never>, { accountsAdmin: boolean }>(
    getFunctions(app, 'us-central1'),
    'refreshAccountsAdminClaims',
  )
  const result = await refreshClaims({})
  if (result.data.accountsAdmin !== true) throw new Error('This user is not authorized to access Accounts.')
  await user.getIdToken(true)
}

export async function uploadExpenseReceipt(expenseId: string, file: File): Promise<void> {
  const actor = requireActor()
  await refreshAccountsAdminClaims()
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) throw new Error('Attach a PDF, JPEG, PNG, or WebP receipt.')
  if (file.size <= 0 || file.size >= 10 * 1024 * 1024) throw new Error('Receipt files must be smaller than 10 MB.')
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]
  const path = `financial-receipts/${actor.uid}/${expenseId}/${crypto.randomUUID()}.${extension}`
  const fileRef = storageRef(storage, path)
  await uploadBytes(fileRef, file, { contentType: file.type })

  try {
    const expenseRef = doc(db, EXPENSES, expenseId)
    const now = Timestamp.now()
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(expenseRef)
      if (!snapshot.exists()) throw new Error('The expense no longer exists.')
      transaction.update(expenseRef, {
        receipt_paths: arrayUnion(path),
        updated_by: actor.uid,
        updated_at: now,
        audit: arrayUnion({
          action: 'receipt_attached',
          storage_path: path,
          admin_user_id: actor.uid,
          created_at: now,
        }),
      })
    })
  } catch (error) {
    try {
      await deleteObject(fileRef)
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'unknown cleanup error'
      throw new Error(`Receipt metadata could not be saved and the uploaded file could not be removed: ${cleanupMessage}`)
    }
    throw error
  }
}

export async function getExpenseReceiptUrl(path: string): Promise<string> {
  const getReceiptUrl = httpsCallable<{ path: string }, { url: string }>(
    getFunctions(app, 'us-central1'),
    'getFinancialReceiptDownloadUrl',
  )
  const result = await getReceiptUrl({ path })
  return result.data.url
}

export async function getTransactionReceiptUrl(path: string): Promise<string> {
  const getReceiptUrl = httpsCallable<{ path: string }, { url: string }>(
    getFunctions(app, 'us-central1'),
    'getFinancialReceiptDownloadUrl',
  )
  const result = await getReceiptUrl({ path })
  return result.data.url
}

export async function createFinancialCategory(nameInput: string, type: 'income' | 'expense'): Promise<void> {
  const actor = requireActor()
  const name = nameInput.trim()
  if (!name || name.length > 80) throw new Error('Category names must contain 1–80 characters.')
  const id = `${type}_${encodeURIComponent(name.toLocaleLowerCase())}`
  const categoryRef = doc(db, CATEGORIES, id)
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(categoryRef)
    if (snapshot.exists()) return
    transaction.set(categoryRef, {
      name,
      type,
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: Timestamp.now(),
    })
  })
}

export async function fetchVendorDueTotal(): Promise<number> {
  const result = await getAggregateFromServer(
    query(collection(db, EXPENSES), where('is_vendor_payable', '==', true)),
    { total: sum('outstanding_paise') },
  )
  return Number(result.data().total ?? 0)
}

export async function setAccountActive(accountId: string, active: boolean): Promise<void> {
  const actor = requireActor()
  const accountRef = doc(db, ACCOUNTS, accountId)
  const now = Timestamp.now()
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(accountRef)
    if (!snapshot.exists()) throw new Error('The account no longer exists.')
    const data = snapshot.data()
    if (!data) throw new Error('The account data is unavailable.')
    if (!active && readNonnegativeInteger(data.balance_paise, 'account balance') !== 0) {
      throw new Error('Transfer or spend the remaining balance before deactivating this account.')
    }
    transaction.update(accountRef, {
      active,
      updated_by: actor.uid,
      updated_at: now,
    })
  })
}

function orderCustomerName(data: DocumentData): string {
  const address = data.shipping_address && typeof data.shipping_address === 'object'
    ? data.shipping_address as Record<string, unknown>
    : {}
  return String(data.guest_name || address.name || data.customer_email || data.guest_email || 'Customer')
}

export async function fetchCustomerReceivables(): Promise<CustomerReceivable[]> {
  const rows: CustomerReceivable[] = []
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null
  while (true) {
    const pageQuery: Query<DocumentData> = cursor
      ? query(collection(db, 'orders'), orderBy('created_at', 'desc'), startAfter(cursor), limit(500))
      : query(collection(db, 'orders'), orderBy('created_at', 'desc'), limit(500))
    const snapshot: QuerySnapshot<DocumentData> = await getDocs(pageQuery)
    for (const item of snapshot.docs) {
      const data = item.data()
      if (String(data.status ?? '').toLowerCase() === 'cancelled') continue
      const totalRupees = Number(data.total ?? 0)
      const paidRupees = data.amount_paid == null && data.payment_status === 'paid'
        ? totalRupees
        : Number(data.amount_paid ?? 0)
      if (!Number.isFinite(totalRupees) || !Number.isFinite(paidRupees) || totalRupees < 0 || paidRupees < 0) {
        throw new Error(`Order ${String(data.order_number ?? item.id)} has an invalid payment balance.`)
      }
      const totalPaise = Math.round(totalRupees * 100)
      const paidPaise = Math.min(totalPaise, Math.round(paidRupees * 100))
      const outstandingPaise = totalPaise - paidPaise
      if (outstandingPaise <= 0) continue
      rows.push({
        id: item.id,
        order_number: String(data.order_number ?? item.id),
        customer_name: orderCustomerName(data),
        user_id: (data.user_id as string | null) ?? null,
        status: String(data.status ?? 'unknown'),
        total_paise: totalPaise,
        paid_paise: paidPaise,
        outstanding_paise: outstandingPaise,
      })
    }
    if (snapshot.docs.length < 500) break
    cursor = snapshot.docs[snapshot.docs.length - 1]
  }
  return rows
}

export async function fetchAccountTotals(range: AccountDateRange = {}): Promise<AccountTotals> {
  const rangeFilters = rangeConstraints(range)
  const results = await Promise.all(
    (['income', 'expense'] as const).map(type => getAggregateFromServer(
      query(collection(db, TRANSACTIONS), where('type', '==', type), ...rangeFilters),
      { amount: sum('amount_paise') },
    )),
  )
  return {
    income_paise: Number(results[0].data().amount ?? 0),
    expense_paise: Number(results[1].data().amount ?? 0),
  }
}

function transactionReferenceId(reference: string): string {
  const normalized = reference.trim().toLocaleLowerCase()
  if (!normalized || normalized.length > 200) {
    throw new Error('Enter a unique reference of 1–200 characters.')
  }
  return `ref_${encodeURIComponent(normalized)}`
}

export async function createAccount(input: NewAccountInput): Promise<void> {
  const actor = requireActor()
  const name = input.name.trim()
  if (!name) throw new Error('Enter an account name.')
  assertPaise(input.opening_balance_paise, 'Opening balance', true)

  const accountRef = doc(collection(db, ACCOUNTS))
  const openingRef = input.opening_balance_paise > 0
    ? doc(db, TRANSACTIONS, `opening_${accountRef.id}`)
    : null
  const now = Timestamp.now()

  await runTransaction(db, async transaction => {
    transaction.set(accountRef, {
      name,
      type: input.type,
      opening_balance_paise: input.opening_balance_paise,
      balance_paise: input.opening_balance_paise,
      active: true,
      created_by: actor.uid,
      created_at: now,
      updated_by: actor.uid,
      updated_at: now,
    })
    if (openingRef) {
      transaction.set(openingRef, {
        transaction_id: `FTX-${accountRef.id.toUpperCase()}-OPEN`,
        type: 'opening_balance',
        transaction_date: now,
        reference_no: '',
        description: `Opening balance — ${name}`,
        category_name: 'Opening Balance',
        amount_paise: input.opening_balance_paise,
        account_id: accountRef.id,
        transfer_to_account_id: null,
        created_by: actor.uid,
        created_by_name: actor.name,
        created_at: now,
        audit: [{ action: 'created', admin_user_id: actor.uid, created_at: now }],
      })
    }
  })
}

export async function recordTransaction(input: NewTransactionInput, receipt?: File): Promise<void> {
  const actor = requireActor()
  const amount = input.amount_paise
  assertPaise(amount, 'Amount')
  if (!input.account_id) throw new Error('Choose an account.')
  if (!input.description.trim()) throw new Error('Enter a description.')
  if (!input.category_name.trim()) throw new Error('Choose a category.')
  if (input.type === 'transfer' && (!input.transfer_to_account_id || input.account_id === input.transfer_to_account_id)) {
    throw new Error('Choose two different accounts for a transfer.')
  }
  if (input.type !== 'transfer' && input.transfer_to_account_id) {
    throw new Error('A destination account is only valid for a transfer.')
  }

  const transactionRef = doc(db, TRANSACTIONS, transactionReferenceId(input.reference_no))
  const accountRef = doc(db, ACCOUNTS, input.account_id)
  const destinationRef = input.transfer_to_account_id
    ? doc(db, ACCOUNTS, input.transfer_to_account_id)
    : null
  const now = Timestamp.now()
  let uploadedReceiptPath: string | null = null

  if (receipt) {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(receipt.type)) throw new Error('Attach a PDF, JPEG, PNG, or WebP receipt.')
    if (receipt.size <= 0 || receipt.size >= 10 * 1024 * 1024) throw new Error('Receipt files must be smaller than 10 MB.')
    await refreshAccountsAdminClaims()
    const extension = receipt.type === 'application/pdf' ? 'pdf' : receipt.type.split('/')[1]
    uploadedReceiptPath = `financial-receipts/${actor.uid}/${transactionRef.id}/${crypto.randomUUID()}.${extension}`
    await uploadBytes(storageRef(storage, uploadedReceiptPath), receipt, { contentType: receipt.type })
  }

  try {
    await runTransaction(db, async transaction => {
    const [existing, accountSnapshot, destinationSnapshot] = await Promise.all([
      transaction.get(transactionRef),
      transaction.get(accountRef),
      destinationRef ? transaction.get(destinationRef) : Promise.resolve(null),
    ])
    if (existing.exists()) throw new Error('That reference has already been used.')
    if (!accountSnapshot.exists()) throw new Error('The selected account no longer exists.')
    if (destinationRef && (!destinationSnapshot || !destinationSnapshot.exists())) {
      throw new Error('The destination account no longer exists.')
    }

    const source = accountSnapshot.data()
    if (!source || source.active === false) throw new Error('The selected account is inactive.')
    const sourceBalance = readNonnegativeInteger(source.balance_paise, 'account balance')
    const credit = input.type === 'income'
    const nextSource = sourceBalance + (credit ? amount : -amount)
    if (nextSource < 0) throw new Error('The account does not have enough balance for this transaction.')
    if (!Number.isSafeInteger(nextSource)) throw new Error('The resulting account balance is too large.')

    let destinationBalance = 0
    if (destinationRef && destinationSnapshot) {
      const destination = destinationSnapshot.data()
      if (!destination || destination.active === false) throw new Error('The destination account is inactive.')
      destinationBalance = readNonnegativeInteger(destination.balance_paise, 'destination balance')
      if (!Number.isSafeInteger(destinationBalance + amount)) {
        throw new Error('The resulting destination balance is too large.')
      }
    }

    transaction.update(accountRef, {
      balance_paise: nextSource,
      updated_by: actor.uid,
      updated_at: now,
    })
    if (destinationRef) {
      transaction.update(destinationRef, {
        balance_paise: destinationBalance + amount,
        updated_by: actor.uid,
        updated_at: now,
      })
    }
    transaction.set(transactionRef, {
      transaction_id: `FTX-${transactionRef.id.replace(/^ref_/, '').toUpperCase()}`,
      type: input.type,
      transaction_date: dateInputTimestamp(input.transaction_date),
      reference_no: input.reference_no.trim(),
      description: input.description.trim(),
      category_name: input.category_name.trim(),
      amount_paise: amount,
      account_id: input.account_id,
      transfer_to_account_id: input.transfer_to_account_id,
      linked_order_id: null,
      linked_expense_id: null,
      party_name: input.party_name?.trim() || null,
      receipt_paths: uploadedReceiptPath ? [uploadedReceiptPath] : [],
      payment_method: '',
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      audit: [{
        action: 'created',
        admin_user_id: actor.uid,
        created_at: now,
        ...(input.party_name?.trim() ? { party_name: input.party_name.trim() } : {}),
        ...(uploadedReceiptPath ? { receipt_path: uploadedReceiptPath } : {}),
      }],
    })
    })
  } catch (error) {
    if (uploadedReceiptPath) {
      try {
        await deleteObject(storageRef(storage, uploadedReceiptPath))
      } catch (cleanupError) {
        const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : 'unknown cleanup error'
        throw new Error(`Transaction could not be saved and the uploaded receipt could not be removed: ${cleanupMessage}`)
      }
    }
    throw error
  }
}

export async function createExpense(input: NewExpenseInput): Promise<void> {
  const actor = requireActor()
  assertPaise(input.amount_paise, 'Expense amount')
  assertPaise(input.paid_paise, 'Paid amount', true)
  if (input.paid_paise > input.amount_paise) throw new Error('Paid amount cannot exceed the expense total.')
  if (!input.description.trim()) throw new Error('Enter an expense description.')
  if (!input.category_name.trim()) throw new Error('Choose an expense category.')
  if (input.paid_paise > 0 && !input.account_id) throw new Error('Choose the account used for the payment.')
  if (input.paid_paise > 0 && !input.payment_reference.trim()) throw new Error('Enter a unique payment reference.')

  const invoiceReference = input.reference_no.trim().toLocaleLowerCase()
  const expenseRef = invoiceReference
    ? doc(db, EXPENSES, `ref_${encodeURIComponent(`${input.vendor_id ?? 'unlinked'}:${invoiceReference}`)}`)
    : doc(collection(db, EXPENSES))
  const accountRef = input.account_id ? doc(db, ACCOUNTS, input.account_id) : null
  const vendorRef = input.vendor_id ? doc(db, 'vendors', input.vendor_id) : null
  const transactionRef = input.paid_paise > 0
    ? doc(db, TRANSACTIONS, transactionReferenceId(input.payment_reference))
    : null
  const now = Timestamp.now()
  const outstanding = input.amount_paise - input.paid_paise
  const paymentStatus = input.paid_paise === 0 ? 'unpaid' : outstanding === 0 ? 'paid' : 'partially_paid'

  await runTransaction(db, async transaction => {
    const accountSnapshot = accountRef ? await transaction.get(accountRef) : null
    const vendorSnapshot = vendorRef ? await transaction.get(vendorRef) : null
    const existingExpense = await transaction.get(expenseRef)
    const duplicate = transactionRef ? await transaction.get(transactionRef) : null
    if (existingExpense.exists()) throw new Error('An expense with this vendor and invoice reference is already recorded.')
    if (duplicate?.exists()) throw new Error('That payment reference has already been used.')
    if (accountRef && !accountSnapshot?.exists()) throw new Error('The selected account no longer exists.')
    if (vendorRef && !vendorSnapshot?.exists()) throw new Error('The selected vendor no longer exists.')
    const account = accountSnapshot?.data()
    if (input.paid_paise > 0 && (!account || account.active === false)) {
      throw new Error('The selected account is unavailable or inactive.')
    }
    const balance = account ? readNonnegativeInteger(account.balance_paise, 'account balance') : 0
    if (input.paid_paise > balance) throw new Error('The account does not have enough balance for this payment.')

    transaction.set(expenseRef, {
      description: input.description.trim(),
      category_name: input.category_name.trim(),
      vendor_id: input.vendor_id,
      vendor_name: input.vendor_name.trim(),
      reference_no: input.reference_no.trim(),
      transaction_date: dateInputTimestamp(input.transaction_date),
      due_date: input.due_date ? dateInputTimestamp(input.due_date) : null,
      amount_paise: input.amount_paise,
      paid_paise: input.paid_paise,
      outstanding_paise: outstanding,
      payment_status: paymentStatus,
      is_vendor_payable: Boolean(input.vendor_id),
      payment_method: input.payment_method,
      receipt_paths: [],
      account_id: input.paid_paise > 0 ? input.account_id : null,
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      updated_by: actor.uid,
      updated_at: now,
      audit: [{ action: 'created', admin_user_id: actor.uid, created_at: now }],
    })
    if (input.paid_paise > 0 && accountRef && transactionRef) {
      transaction.update(accountRef, {
        balance_paise: balance - input.paid_paise,
        updated_by: actor.uid,
        updated_at: now,
      })
      transaction.set(transactionRef, {
        transaction_id: `FTX-${transactionRef.id.replace(/^ref_/, '').toUpperCase()}`,
        type: 'expense',
        transaction_date: dateInputTimestamp(input.transaction_date),
        reference_no: input.payment_reference.trim(),
        description: input.description.trim(),
        category_name: input.category_name.trim(),
        amount_paise: input.paid_paise,
        account_id: input.account_id,
        transfer_to_account_id: null,
        linked_order_id: null,
        linked_expense_id: expenseRef.id,
        payment_method: input.payment_method,
        created_by: actor.uid,
        created_by_name: actor.name,
        created_at: now,
        audit: [{ action: 'created', admin_user_id: actor.uid, created_at: now }],
      })
    }
  })
}

export async function recordExpensePayment(
  expense: FinancialExpense,
  input: RecordPaymentInput,
): Promise<void> {
  const actor = requireActor()
  assertPaise(input.amount_paise, 'Payment amount')
  if (!input.account_id) throw new Error('Choose a payment account.')
  if (!input.payment_method.trim()) throw new Error('Choose a payment method.')
  if (!input.reference_no.trim()) throw new Error('Enter a unique payment reference.')
  const expenseRef = doc(db, EXPENSES, expense.id)
  const accountRef = doc(db, ACCOUNTS, input.account_id)
  const transactionRef = doc(db, TRANSACTIONS, transactionReferenceId(input.reference_no))
  const now = Timestamp.now()

  await runTransaction(db, async transaction => {
    const [expenseSnapshot, accountSnapshot, duplicate] = await Promise.all([
      transaction.get(expenseRef),
      transaction.get(accountRef),
      transaction.get(transactionRef),
    ])
    if (!expenseSnapshot.exists() || !accountSnapshot.exists()) throw new Error('The expense or account no longer exists.')
    if (duplicate.exists()) throw new Error('That payment reference has already been used.')
    const expenseData = expenseSnapshot.data()
    const accountData = accountSnapshot.data()
    if (!expenseData || !accountData || accountData.active === false) throw new Error('The expense or account is unavailable.')
    const outstanding = readNonnegativeInteger(expenseData.outstanding_paise, 'expense outstanding amount')
    if (input.amount_paise > outstanding) throw new Error('Payment cannot exceed the outstanding expense amount.')
    const balance = readNonnegativeInteger(accountData.balance_paise, 'account balance')
    if (input.amount_paise > balance) throw new Error('The account does not have enough balance for this payment.')
    const total = readNonnegativeInteger(expenseData.amount_paise, 'expense amount')
    const paidBefore = readNonnegativeInteger(expenseData.paid_paise, 'expense paid amount')
    if (paidBefore + outstanding !== total) throw new Error('The expense has inconsistent paid and outstanding balances.')
    const paid = paidBefore + input.amount_paise
    const nextOutstanding = outstanding - input.amount_paise
    const paymentStatus = nextOutstanding === 0 ? 'paid' : 'partially_paid'

    transaction.update(accountRef, { balance_paise: balance - input.amount_paise, updated_by: actor.uid, updated_at: now })
    transaction.update(expenseRef, {
      paid_paise: paid,
      outstanding_paise: nextOutstanding,
      payment_status: paymentStatus,
      updated_by: actor.uid,
      updated_at: now,
      audit: arrayUnion({ action: 'payment_recorded', amount_paise: input.amount_paise, admin_user_id: actor.uid, created_at: now }),
    })
    transaction.set(transactionRef, {
      transaction_id: `FTX-${transactionRef.id.replace(/^ref_/, '').toUpperCase()}`,
      type: 'expense',
      transaction_date: now,
      reference_no: input.reference_no.trim(),
      description: String(expenseData.description ?? ''),
      category_name: String(expenseData.category_name ?? ''),
      amount_paise: input.amount_paise,
      account_id: input.account_id,
      transfer_to_account_id: null,
      linked_order_id: null,
      linked_expense_id: expense.id,
      payment_method: input.payment_method,
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      audit: [{ action: 'created', admin_user_id: actor.uid, created_at: now }],
    })
  })
}

export async function recordCustomerPayment(
  receivable: CustomerReceivable,
  input: RecordPaymentInput,
): Promise<void> {
  const actor = requireActor()
  assertPaise(input.amount_paise, 'Payment amount')
  if (!input.account_id) throw new Error('Choose a deposit account.')
  if (!input.payment_method.trim()) throw new Error('Choose a payment method.')
  if (!input.reference_no.trim()) throw new Error('Enter a unique payment reference.')
  const orderRef = doc(db, 'orders', receivable.id)
  const accountRef = doc(db, ACCOUNTS, input.account_id)
  const transactionRef = doc(db, TRANSACTIONS, transactionReferenceId(input.reference_no))
  const now = Timestamp.now()

  await runTransaction(db, async transaction => {
    const [orderSnapshot, accountSnapshot, duplicate] = await Promise.all([
      transaction.get(orderRef),
      transaction.get(accountRef),
      transaction.get(transactionRef),
    ])
    if (!orderSnapshot.exists() || !accountSnapshot.exists()) throw new Error('The order or account no longer exists.')
    if (duplicate.exists()) throw new Error('That payment reference has already been used.')
    const order = orderSnapshot.data()
    const account = accountSnapshot.data()
    if (!order || !account || account.active === false) throw new Error('The order or account is unavailable.')
    if (String(order.status ?? '').toLowerCase() === 'cancelled') throw new Error('Cancelled orders cannot receive payments.')
    const total = Math.round(Number(order.total ?? 0) * 100)
    const paidBefore = order.amount_paid == null && order.payment_status === 'paid'
      ? total
      : Math.max(0, Math.round(Number(order.amount_paid ?? 0) * 100))
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(paidBefore)) throw new Error('The order payment balance is invalid.')
    if (input.amount_paise > total - paidBefore) throw new Error('Payment cannot exceed the outstanding order amount.')
    const balance = readNonnegativeInteger(account.balance_paise, 'account balance')
    const paidAfter = paidBefore + input.amount_paise
    if (!Number.isSafeInteger(balance + input.amount_paise) || !Number.isSafeInteger(paidAfter)) {
      throw new Error('The resulting account or order balance is too large.')
    }
    const fullyPaid = paidAfter >= total

    transaction.update(accountRef, { balance_paise: balance + input.amount_paise, updated_by: actor.uid, updated_at: now })
    const orderUpdates: Record<string, unknown> = {
      amount_paid: paidAfter / 100,
      payment_status: fullyPaid ? 'paid' : 'partially_paid',
      updated_at: now,
    }
    if (fullyPaid && !order.paid_at) orderUpdates.paid_at = now
    transaction.update(orderRef, orderUpdates)
    transaction.set(transactionRef, {
      transaction_id: `FTX-${transactionRef.id.replace(/^ref_/, '').toUpperCase()}`,
      type: 'income',
      transaction_date: now,
      reference_no: input.reference_no.trim(),
      description: `Customer payment for order ${String(order.order_number ?? receivable.order_number)}`,
      category_name: 'Customer Payment',
      amount_paise: input.amount_paise,
      account_id: input.account_id,
      transfer_to_account_id: null,
      linked_order_id: receivable.id,
      linked_expense_id: null,
      linked_customer_id: (order.user_id as string | null) ?? null,
      payment_method: input.payment_method,
      created_by: actor.uid,
      created_by_name: actor.name,
      created_at: now,
      audit: [{ action: 'created', admin_user_id: actor.uid, created_at: now }],
    })
  })
}
