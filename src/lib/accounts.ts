import {
  arrayUnion,
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
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
import { festivalTagId, LEGACY_FINANCIAL_TAGS } from '@/lib/festivalProducts'
import { app, auth, db, storage } from '@/lib/firebase'
import type {
  AccountTotals,
  AccountDateRange,
  CustomerPayment,
  EditTransactionInput,
  EditExpenseInput,
  FinancialAccount,
  FinancialAccountType,
  FinancialCategory,
  FinancialExpense,
  FinancialTransaction,
  FinancialTransactionType,
  FestivalTag,
  CustomerReceivable,
  NewIncomeInput,
  UnpostedFinancialIncome,
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
const ACCOUNTS_FUNCTION_REGION = 'us-central1'
const PAYMENT_METHOD_USAGE_LEASE_MS = 5 * 60 * 1000
export const PETTY_CASH_TRANSACTION_ACCOUNT_ID = '__petty_cash_spending__'
export const UNALLOCATED_EXPENSE_PAYMENT_ACCOUNT_ID = '__unallocated_expense_payment__'
export const DEFAULT_FINANCIAL_CATEGORIES = [
  'Purchases', 'Packaging', 'Transportation', 'Marketing', 'Salaries',
  'Delivery', 'Utilities', 'Miscellaneous', 'Tea',
]
export const DEFAULT_INCOME_CATEGORIES = ['Sales Receipt', 'Other Income']
export const DEFAULT_FINANCIAL_PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer']
const PAYMENT_METHODS_CONFIG = 'financial_expense_payment_methods'

export interface FinancialPaymentMethod {
  id: string
  name: string
  is_default: boolean
  is_enabled: boolean
  updated_at?: Timestamp
  historical_names?: string[]
  legacy_name?: string
}

export interface FinancialVendor extends VendorOption {
  is_default: boolean
  is_enabled: boolean
  created_at?: Timestamp
  updated_at?: Timestamp
}

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

function normalizeFestivalTag(value: unknown, label: string): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > 80) {
    throw new Error(`${label} must be a festival name of 1–80 characters.`)
  }
  return value.trim()
}

function normalizeFestivalTagId(value: unknown, tagName: string | null, label: string): string | null {
  if (value == null || value === '') return tagName ? festivalTagId(tagName) : null
  if (typeof value !== 'string' || value.trim().length > 80) {
    throw new Error(`${label} must be a tag ID of up to 80 characters.`)
  }
  return value.trim()
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
  if (!id.trim()) throw new Error('A transaction has an invalid Firestore document ID.')
  if (!['income', 'expense', 'transfer', 'opening_balance'].includes(String(data.type))) {
    throw new Error(`Transaction ${id} has an unsupported type.`)
  }
  if (!(data.transaction_date instanceof Timestamp) || !(data.created_at instanceof Timestamp)) {
    throw new Error(`Transaction ${id} has an invalid date.`)
  }
  const festivalTag = normalizeFestivalTag(data.festival_tag, `Transaction ${id} festival tag`)
  const transactionId = typeof data.transaction_id === 'string' && data.transaction_id.trim()
    ? data.transaction_id.trim()
    : id
  return {
    id,
    transaction_id: transactionId,
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
    payment_reference: typeof data.payment_reference === 'string' ? data.payment_reference : '',
    receipt_paths: Array.isArray(data.receipt_paths) ? data.receipt_paths.filter((path): path is string => typeof path === 'string') : [],
    payment_method: String(data.payment_method ?? ''),
    source_of_income: typeof data.source_of_income === 'string' ? data.source_of_income : null,
    idempotency_key: typeof data.idempotency_key === 'string' ? data.idempotency_key : null,
    festival_tag: festivalTag,
    festival_tag_id: normalizeFestivalTagId(data.festival_tag_id, festivalTag, `Transaction ${id} festival tag`),
    is_petty_cash_spending: data.is_petty_cash_spending === true,
    is_unallocated_expense_payment: data.is_unallocated_expense_payment === true,
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
  const festivalTag = normalizeFestivalTag(data.festival_tag, `Expense ${id} festival tag`)
  return {
    id,
    expense_id: typeof data.expense_id === 'string' && data.expense_id.trim()
      ? data.expense_id.trim()
      : '',
    description: String(data.description ?? ''),
    category_name: String(data.category_name ?? ''),
    vendor_id: (data.vendor_id as string | null) ?? null,
    vendor_name: String(data.vendor_name ?? ''),
    payment_reference: String(data.payment_reference ?? ''),
    reference_no: String(data.reference_no ?? ''),
    transaction_date: data.transaction_date,
    due_date: (data.due_date as Timestamp | null) ?? null,
    amount_paise: amountPaise,
    paid_paise: paidPaise,
    outstanding_paise: outstandingPaise,
    payment_status: data.payment_status,
    payment_method: String(data.payment_method ?? ''),
    is_accountless_payment: data.is_accountless_payment === true,
    is_full_amount_spending: data.is_full_amount_spending === true,
    is_vendor_payable: data.is_vendor_payable === true,
    receipt_paths: (data.receipt_paths as string[] | undefined) ?? [],
    festival_tag: festivalTag,
    festival_tag_id: normalizeFestivalTagId(data.festival_tag_id, festivalTag, `Expense ${id} festival tag`),
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
  const editRecord = httpsCallable<{ transaction_id: string; input: EditTransactionInput }, { success: boolean }>(
    getFunctions(app, 'us-central1'),
    'editFinancialTransaction',
  )
  await editRecord({ transaction_id: transactionRow.id, input })
}

export async function deleteFinancialTransaction(transaction: FinancialTransaction, pettyCashSpending = false): Promise<void> {
  if (!transaction || typeof transaction.id !== 'string' || !transaction.id.trim() ||
      transaction.id.includes('/') || transaction.id.length > 200) {
    throw new Error('The selected transaction could not be identified. Refresh and try again.')
  }
  const functionName = 'deleteFinancialTransaction'
  const collectionPath = 'financial_transactions'
  const deleteRecord = httpsCallable<{ transaction_id: string; petty_cash_spending: boolean }, { success: boolean }>(
    getFunctions(app, ACCOUNTS_FUNCTION_REGION),
    functionName,
  )
  try {
    await deleteRecord({ transaction_id: transaction.id, petty_cash_spending: pettyCashSpending })
  } catch (error) {
    logDeleteCallableError(error, {
      functionName,
      transactionDocumentId: transaction.id,
      transactionType: transaction.type,
      collectionPath,
    })
    throw error
  }
}

export async function editFinancialExpense(expense: FinancialExpense, input: EditExpenseInput): Promise<void> {
  const editRecord = httpsCallable<{ expense_id: string; input: EditExpenseInput }, { success: boolean }>(
    getFunctions(app, 'us-central1'),
    'editFinancialExpense',
  )
  await editRecord({ expense_id: expense.id, input })
}

export async function deleteFinancialExpense(expense: FinancialExpense): Promise<void> {
  if (!expense || typeof expense.id !== 'string' || !expense.id.trim() ||
      expense.id.includes('/') || expense.id.length > 200) {
    throw new Error('The selected expense could not be identified. Refresh and try again.')
  }
  const functionName = 'deleteFinancialExpense'
  const collectionPath = 'financial_expenses'
  const deleteRecord = httpsCallable<{ expense_id: string }, { success: boolean }>(
    getFunctions(app, ACCOUNTS_FUNCTION_REGION),
    functionName,
  )
  try {
    await deleteRecord({ expense_id: expense.id })
  } catch (error) {
    logDeleteCallableError(error, {
      functionName,
      transactionDocumentId: expense.id,
      transactionType: 'expense',
      collectionPath,
    })
    throw error
  }
}

function logDeleteCallableError(
  error: unknown,
  context: {
    functionName: string
    transactionDocumentId: string
    transactionType: string
    collectionPath: string
  },
): void {
  let errorCode = 'unknown'
  let errorMessage = 'Unknown Firebase error'
  if (error && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'string') errorCode = error.code
    if ('message' in error && typeof error.message === 'string') errorMessage = error.message
  } else if (typeof error === 'string') {
    errorMessage = error
  }
  console.error('Firebase transaction deletion failed.', {
    ...context,
    firestoreDocumentPath: `${context.collectionPath}/${context.transactionDocumentId}`,
    firebaseProjectId: app.options.projectId || 'unknown',
    functionRegion: ACCOUNTS_FUNCTION_REGION,
    errorCode,
    errorMessage,
  })
}

export async function fetchTransactionPage(
  cursor: QueryDocumentSnapshot<DocumentData> | null,
): Promise<FinancialTransactionPage> {
  const baseQuery = query(collection(db, TRANSACTIONS), orderBy('transaction_date', 'desc'))
  const items: FinancialTransaction[] = []
  let nextCursor = cursor
  let hasMore = true
  while (items.length < PAGE_SIZE && hasMore) {
    const remaining = PAGE_SIZE - items.length
    const pageQuery = nextCursor
      ? query(baseQuery, startAfter(nextCursor), limit(remaining))
      : query(baseQuery, limit(remaining))
    const snapshot = await getDocs(pageQuery)
    const postedDocuments = snapshot.docs.filter(item =>
      item.data().is_deleted !== true && item.data().posting_status !== 'unposted')
    items.push(...postedDocuments.map(item => readTransaction(item.id, item.data())))
    nextCursor = snapshot.docs[snapshot.docs.length - 1] ?? nextCursor
    hasMore = snapshot.docs.length === remaining
  }
  return {
    items,
    cursor: nextCursor,
    hasMore,
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
  return documents
    .filter(item => item.data().is_deleted !== true && item.data().posting_status !== 'unposted')
    .map(item => readTransaction(item.id, item.data()))
}

function logExpenseReadError(source: string, error: unknown): void {
  const details = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown }
    : {}
  console.error('[accounts] Firestore expense read failed', {
    sourceCollection: source,
    projectId: app.options.projectId || 'unknown',
    databaseId: 'festecart',
    errorCode: typeof details.code === 'string' || typeof details.code === 'number' ? details.code : 'unknown',
    errorMessage: typeof details.message === 'string'
      ? details.message
      : error === undefined ? 'Unknown error' : String(error),
    error,
  })
}

async function loadExpenses(baseQuery: Query<DocumentData>, source: string): Promise<FinancialExpense[]> {
  try {
    const documents = await fetchAllPages(baseQuery)
    return documents
      .filter(item => item.data().is_deleted !== true)
      .map(item => readExpense(item.id, item.data()))
  } catch (error) {
    logExpenseReadError(source, error)
    throw error
  }
}

export async function fetchReportExpenses(range: AccountDateRange): Promise<FinancialExpense[]> {
  const baseQuery = query(collection(db, EXPENSES), ...rangeConstraints(range), orderBy('transaction_date', 'desc'))
  return loadExpenses(baseQuery, 'financial_expenses (reports)')
}

export async function fetchExpenses(): Promise<FinancialExpense[]> {
  return loadExpenses(query(collection(db, EXPENSES), orderBy('transaction_date', 'desc')), EXPENSES)
}

export async function fetchFestivalTags(): Promise<FestivalTag[]> {
  const configSnapshot = await getDoc(doc(db, 'site_config', 'financial_festivals'))
  const config = configSnapshot.exists() ? configSnapshot.data() : {}
  const configuredNames = Array.isArray(config.names)
    ? config.names.filter((name: unknown): name is string => typeof name === 'string')
    : []
  const savedTagNames = readFestivalTagNames(config.tag_names)
  const customTagNames = readFestivalTagNames(config.custom_tags)
  const tagStatuses = readFestivalTagStatuses(config.tag_status)
  const savedSelections = readFestivalProductSelections(
    config.product_selections,
    new Set([...Object.keys(savedTagNames), ...Object.keys(customTagNames)]),
  )
  const tagsById = new Map<string, string>()
  for (const name of [...LEGACY_FINANCIAL_TAGS, ...configuredNames]) {
    const trimmedName = name.trim()
    const id = festivalTagId(trimmedName)
    if (trimmedName && id && !tagsById.has(id)) tagsById.set(id, trimmedName)
  }
  for (const [id, name] of Object.entries(savedTagNames)) tagsById.set(id, name)
  for (const [id, name] of Object.entries(customTagNames)) tagsById.set(id, name)
  for (const id of Object.keys(savedSelections)) {
    if (!tagsById.has(id)) tagsById.set(id, id.replace(/-/g, ' '))
  }
  const builtInTagIds = new Set(LEGACY_FINANCIAL_TAGS.map(festivalTagId))
  const customTagIds = new Set([
    ...Object.keys(customTagNames),
    ...Object.keys(savedTagNames),
    ...Object.keys(savedSelections),
    ...configuredNames.map(festivalTagId).filter(id => !builtInTagIds.has(id)),
  ])
  return [...tagsById.entries()].map(([id, name]) => ({
    id,
    name,
    is_custom: customTagIds.has(id),
    is_enabled: tagStatuses[id] !== false,
  }))
}

function readFestivalTagNames(value: unknown): Record<string, string> {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved festival tag names have an invalid format.')
  }
  const names: Record<string, string> = {}
  for (const [id, name] of Object.entries(value)) {
    if (!id.trim() || typeof name !== 'string' || !name.trim()) {
      throw new Error('A saved festival tag name is invalid.')
    }
    names[id] = name.trim()
  }
  return names
}

function readFestivalTagStatuses(value: unknown): Record<string, boolean> {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved festival tag statuses have an invalid format.')
  }
  const statuses: Record<string, boolean> = {}
  for (const [id, enabled] of Object.entries(value)) {
    if (!id.trim() || typeof enabled !== 'boolean') {
      throw new Error('A saved festival tag status is invalid.')
    }
    statuses[id] = enabled
  }
  return statuses
}

function isManagedFestivalTag(
  tagId: string,
  config: DocumentData,
  tagNames: Record<string, string>,
  customTagNames: Record<string, string>,
): boolean {
  if (tagNames[tagId] || customTagNames[tagId]) return true
  const builtInIds = new Set(LEGACY_FINANCIAL_TAGS.map(festivalTagId))
  const configuredNames = Array.isArray(config.names)
    ? config.names.filter((value: unknown): value is string => typeof value === 'string')
    : []
  if (configuredNames.some(name => festivalTagId(name) === tagId && !builtInIds.has(tagId))) return true
  const selections = readFestivalProductSelections(
    config.product_selections,
    new Set([...Object.keys(tagNames), ...Object.keys(customTagNames)]),
  )
  return Object.prototype.hasOwnProperty.call(selections, tagId)
}

function readFestivalProductSelections(value: unknown, stableTagIds: ReadonlySet<string> = new Set()): Record<string, string[]> {
  if (value == null) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Festival product selections have an invalid format.')
  }
  const selections: Record<string, string[]> = {}
  for (const [festival, productIds] of Object.entries(value)) {
    if (!Array.isArray(productIds) || productIds.some(id => typeof id !== 'string')) {
      throw new Error(`Saved product selections for ${festival} are invalid.`)
    }
    const id = stableTagIds.has(festival) ? festival : festivalTagId(festival)
    selections[id] = [...new Set([...(selections[id] ?? []), ...productIds])]
  }
  return selections
}

export async function fetchFestivalProductSelections(): Promise<Record<string, string[]>> {
  const configSnapshot = await getDoc(doc(db, 'site_config', 'financial_festivals'))
  if (!configSnapshot.exists()) return {}
  const config = configSnapshot.data()
  const tagIds = new Set([
    ...Object.keys(readFestivalTagNames(config.tag_names)),
    ...Object.keys(readFestivalTagNames(config.custom_tags)),
  ])
  return readFestivalProductSelections(config.product_selections, tagIds)
}

function normalizedFestivalTagName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export async function createFestivalTag(nameInput: string, productIds: string[] = []): Promise<FestivalTag> {
  requireActor()
  const name = nameInput.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Enter a tag name.')
  if (name.length > 80) throw new Error('Tag names must be 80 characters or fewer.')
  if (!Array.isArray(productIds) || productIds.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error('The selected product IDs are invalid.')
  }

  const configRef = doc(db, 'site_config', 'financial_festivals')
  const generatedTagId = doc(collection(db, 'site_config')).id
  await runTransaction(db, async transaction => {
    const configSnapshot = await transaction.get(configRef)
    const currentData = configSnapshot.exists() ? configSnapshot.data() : {}
    const tagNames = readFestivalTagNames(currentData.tag_names)
    const customTagNames = readFestivalTagNames(currentData.custom_tags)
    const tagStatuses = readFestivalTagStatuses(currentData.tag_status)
    const configuredNames = Array.isArray(currentData.names)
      ? currentData.names.filter((value: unknown): value is string => typeof value === 'string')
      : []
    const savedSelections = readFestivalProductSelections(
      currentData.product_selections,
      new Set([...Object.keys(tagNames), ...Object.keys(customTagNames)]),
    )
    const legacySelectionNames = Object.keys(savedSelections).map(id => tagNames[id] ?? customTagNames[id] ?? id.replace(/-/g, ' '))
    const existingNames = [
      ...LEGACY_FINANCIAL_TAGS,
      ...configuredNames,
      ...Object.values(tagNames),
      ...Object.values(customTagNames),
      ...legacySelectionNames,
    ]
    if (existingNames.some(existing => normalizedFestivalTagName(existing) === normalizedFestivalTagName(name))) {
      throw new Error('A tag with this name already exists.')
    }
    if (productIds.length > 0) {
      savedSelections[generatedTagId] = [...new Set(productIds.map(id => id.trim()))]
    }

    transaction.set(configRef, {
      ...currentData,
      tag_names: { ...tagNames, [generatedTagId]: name },
      custom_tags: { ...customTagNames, [generatedTagId]: name },
      tag_status: { ...tagStatuses, [generatedTagId]: true },
      product_selections: savedSelections,
      updated_at: Timestamp.now(),
    }, { merge: true })
  })
  return { id: generatedTagId, name, is_custom: true, is_enabled: true }
}

export async function renameFestivalTag(tagIdInput: string, nameInput: string, productIds?: string[]): Promise<void> {
  requireActor()
  const tagId = normalizeFestivalTagId(tagIdInput, null, 'Festival tag')
  const name = nameInput.trim().replace(/\s+/g, ' ')
  if (!tagId) throw new Error('Select a tag to edit.')
  if (!name) throw new Error('Enter a tag name.')
  if (name.length > 80) throw new Error('Tag names must be 80 characters or fewer.')
  if (productIds !== undefined && (!Array.isArray(productIds) || productIds.some(id => typeof id !== 'string' || !id.trim()))) {
    throw new Error('The selected product IDs are invalid.')
  }

  const configRef = doc(db, 'site_config', 'financial_festivals')
  await runTransaction(db, async transaction => {
    const configSnapshot = await transaction.get(configRef)
    const currentData = configSnapshot.exists() ? configSnapshot.data() : {}
    const tagNames = readFestivalTagNames(currentData.tag_names)
    const customTagNames = readFestivalTagNames(currentData.custom_tags)
    if (!isManagedFestivalTag(tagId, currentData, tagNames, customTagNames)) throw new Error('This tag no longer exists.')
    const configuredNames = Array.isArray(currentData.names)
      ? currentData.names.filter((value: unknown): value is string => typeof value === 'string')
      : []
    const selections = readFestivalProductSelections(
      currentData.product_selections,
      new Set([...Object.keys(tagNames), ...Object.keys(customTagNames)]),
    )
    const namesToCheck = [
      ...LEGACY_FINANCIAL_TAGS.map(value => ({ id: festivalTagId(value), name: value })),
      ...configuredNames.map(value => ({ id: festivalTagId(value), name: value })),
      ...Object.entries(tagNames).map(([id, value]) => ({ id, name: value })),
      ...Object.entries(customTagNames).map(([id, value]) => ({ id, name: value })),
      ...Object.keys(selections).map(id => ({
        id,
        name: tagNames[id] ?? customTagNames[id] ?? id.replace(/-/g, ' '),
      })),
    ]
    if (namesToCheck.some(item => item.id !== tagId && normalizedFestivalTagName(item.name) === normalizedFestivalTagName(name))) {
      throw new Error('A tag with this name already exists.')
    }
    if (productIds !== undefined) {
      const tagStatuses = readFestivalTagStatuses(currentData.tag_status)
      const nextProductIds = [...new Set(productIds.map(id => id.trim()))]
      const existingProductIds = [...new Set(selections[tagId] ?? [])]
      const sortedNextIds = [...nextProductIds].sort()
      const sortedExistingIds = [...existingProductIds].sort()
      if (tagStatuses[tagId] === false &&
        (sortedNextIds.length !== sortedExistingIds.length || sortedNextIds.some((id, index) => id !== sortedExistingIds[index]))) {
        throw new Error('Enable this tag before changing its product associations.')
      }
      selections[tagId] = nextProductIds
    }

    transaction.set(configRef, {
      ...currentData,
      tag_names: { ...tagNames, [tagId]: name },
      custom_tags: { ...customTagNames, [tagId]: name },
      ...(productIds !== undefined ? { product_selections: selections } : {}),
      updated_at: Timestamp.now(),
    }, { merge: true })
  })
}

export async function setFestivalTagEnabled(tagIdInput: string, isEnabled: boolean): Promise<void> {
  requireActor()
  const tagId = normalizeFestivalTagId(tagIdInput, null, 'Festival tag')
  if (!tagId || typeof isEnabled !== 'boolean') throw new Error('Select a tag and status.')

  const configRef = doc(db, 'site_config', 'financial_festivals')
  await runTransaction(db, async transaction => {
    const configSnapshot = await transaction.get(configRef)
    const currentData = configSnapshot.exists() ? configSnapshot.data() : {}
    const tagNames = readFestivalTagNames(currentData.tag_names)
    const customTagNames = readFestivalTagNames(currentData.custom_tags)
    if (!isManagedFestivalTag(tagId, currentData, tagNames, customTagNames)) throw new Error('This tag no longer exists.')
    const tagStatuses = readFestivalTagStatuses(currentData.tag_status)
    transaction.set(configRef, {
      ...currentData,
      tag_status: { ...tagStatuses, [tagId]: isEnabled },
      updated_at: Timestamp.now(),
    }, { merge: true })
  })
}

export async function deleteFestivalTag(tagIdInput: string): Promise<void> {
  return deleteFestivalTags([tagIdInput])
}

export async function deleteFestivalTags(tagIdInputs: string[]): Promise<void> {
  requireActor()
  if (!Array.isArray(tagIdInputs) || tagIdInputs.length === 0) throw new Error('Select at least one tag to delete.')
  const normalizedTagIds = tagIdInputs.map(tagId => normalizeFestivalTagId(tagId, null, 'Festival tag'))
  if (normalizedTagIds.some(tagId => tagId === null)) throw new Error('Select valid tags to delete.')
  const tagIds = [...new Set(normalizedTagIds.filter((tagId): tagId is string => tagId !== null))]

  const configRef = doc(db, 'site_config', 'financial_festivals')
  await runTransaction(db, async transaction => {
    const configSnapshot = await transaction.get(configRef)
    if (!configSnapshot.exists()) throw new Error('This tag no longer exists.')
    const currentData = configSnapshot.data()
    const tagNames = readFestivalTagNames(currentData.tag_names)
    const customTagNames = readFestivalTagNames(currentData.custom_tags)
    const tagNamesToDelete = new Map<string, string>()
    for (const tagId of tagIds) {
      if (!isManagedFestivalTag(tagId, currentData, tagNames, customTagNames)) {
        throw new Error('One or more selected tags no longer exist.')
      }
      tagNamesToDelete.set(tagId, tagNames[tagId] ?? customTagNames[tagId] ?? tagId.replace(/-/g, ' '))
    }
    const deletedTagNameIds = new Set([...tagNamesToDelete.values()].map(festivalTagId))
    const tagStatuses = readFestivalTagStatuses(currentData.tag_status)
    readFestivalProductSelections(
      currentData.product_selections,
      new Set([...Object.keys(tagNames), ...Object.keys(customTagNames)]),
    )
    const selections = currentData.product_selections && typeof currentData.product_selections === 'object' &&
      !Array.isArray(currentData.product_selections)
      ? { ...currentData.product_selections }
      : {}
    for (const key of Object.keys(selections)) {
      if (tagNamesToDelete.has(key) || deletedTagNameIds.has(festivalTagId(key))) {
        delete selections[key]
      }
    }
    for (const tagId of tagIds) {
      delete tagNames[tagId]
      delete customTagNames[tagId]
      delete tagStatuses[tagId]
    }
    const deletedTagIds = new Set(tagIds)
    const configuredNames = Array.isArray(currentData.names)
      ? currentData.names.filter((value: unknown): value is string =>
        typeof value === 'string' && !deletedTagIds.has(festivalTagId(value)) && !deletedTagNameIds.has(festivalTagId(value)),
      )
      : currentData.names
    transaction.update(
      configRef,
      {
        tag_names: tagNames,
        custom_tags: customTagNames,
        tag_status: tagStatuses,
        product_selections: selections,
        ...(Array.isArray(currentData.names) ? { names: configuredNames } : {}),
        updated_at: Timestamp.now(),
      },
    )
  })
}

export async function saveFestivalProductSelection(tagIdInput: string, tagNameInput: string, productIds: string[]): Promise<void> {
  const tagId = normalizeFestivalTagId(tagIdInput, null, 'Festival tag')
  const tagName = normalizeFestivalTag(tagNameInput, 'Festival tag')
  if (!tagId || !tagName) throw new Error('Choose a festival category.')
  if (!Array.isArray(productIds) || productIds.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error('The selected product IDs are invalid.')
  }
  const configRef = doc(db, 'site_config', 'financial_festivals')
  await runTransaction(db, async transaction => {
    const configSnapshot = await transaction.get(configRef)
    const currentData = configSnapshot.exists() ? configSnapshot.data() : {}
    const tagNames = readFestivalTagNames(currentData.tag_names)
    const customTagNames = readFestivalTagNames(currentData.custom_tags)
    const tagStatuses = readFestivalTagStatuses(currentData.tag_status)
    if (!isManagedFestivalTag(tagId, currentData, tagNames, customTagNames) || tagStatuses[tagId] === false) {
      throw new Error('Choose an enabled created tag.')
    }
    const selections = readFestivalProductSelections(
      currentData.product_selections,
      new Set([...Object.keys(tagNames), ...Object.keys(customTagNames)]),
    )
    transaction.set(configRef, {
      ...currentData,
      tag_names: { ...tagNames, [tagId]: tagName },
      product_selections: {
        ...selections,
        [tagId]: [...new Set(productIds.map(id => id.trim()))],
      },
      updated_at: Timestamp.now(),
    }, { merge: true })
  })
}

export async function fetchCustomerPayments(): Promise<CustomerPayment[]> {
  const payments = (await fetchReportTransactions({})).filter(item => item.linked_order_id)
  const orderIds = [...new Set(payments.map(payment => payment.linked_order_id).filter((id): id is string => id !== null))]
  const orders = new Map<string, DocumentData>()
  for (let index = 0; index < orderIds.length; index += 30) {
    const chunk = orderIds.slice(index, index + 30)
    const snapshot = await getDocs(query(collection(db, 'orders'), where(documentId(), 'in', chunk)))
    for (const order of snapshot.docs) orders.set(order.id, order.data())
  }
  return payments.map(transaction => {
    const orderId = transaction.linked_order_id ?? ''
    const order = orders.get(orderId)
    const total = Number(order?.total ?? 0)
    const paid = order?.amount_paid == null && order?.payment_status === 'paid'
      ? total
      : Number(order?.amount_paid ?? 0)
    const status = order?.payment_status === 'paid' || (total > 0 && paid >= total)
      ? 'paid'
      : paid > 0 ? 'partially_paid' : 'pending'
    return {
      transaction,
      customer_name: order ? orderCustomerName(order) : transaction.party_name || 'Customer',
      order_number: String(order?.order_number ?? orderId),
      order_payment_status: status,
    }
  })
}

export async function fetchOrderPaymentDetails(orderId: string): Promise<Array<{ payment_method: string; reference_no: string }>> {
  const snapshot = await getDocs(
    query(collection(db, TRANSACTIONS), where('linked_order_id', '==', orderId)),
  )
  return snapshot.docs
    .filter(item => item.data().type === 'income' && item.data().posting_status !== 'unposted' && item.data().is_deleted !== true)
    .map(item => ({
      payment_method: String(item.data().payment_method ?? ''),
      reference_no: String(item.data().reference_no ?? '').trim(),
    }))
}

export async function fetchVendors(): Promise<VendorOption[]> {
  return (await fetchFinancialVendors())
    .filter(vendor => vendor.is_enabled)
    .map(({ id, name }) => ({ id, name }))
}

export async function fetchFinancialVendors(): Promise<FinancialVendor[]> {
  const snapshot = await getDocs(collection(db, 'vendors'))
  const vendors = snapshot.docs
    .filter(item => item.data().financial_vendor_permanently_deleted !== true)
    .map(item => {
      const data = item.data()
      const isDefault = data.is_financial_vendor !== true
      return {
        id: item.id,
        name: financialVendorDisplayName(data, item.id),
        is_default: isDefault,
        is_enabled: isDefault
          ? data.financial_vendor_enabled !== false
          : data.is_enabled !== false,
        created_at: data.created_at instanceof Timestamp ? data.created_at : undefined,
        updated_at: isDefault
          ? data.financial_vendor_updated_at instanceof Timestamp ? data.financial_vendor_updated_at : undefined
          : data.updated_at instanceof Timestamp ? data.updated_at : undefined,
      }
    })
    .sort((left, right) => left.name.localeCompare(right.name))
  const unique = new Map<string, FinancialVendor>()
  for (const vendor of vendors) {
    const key = normalizeFinancialVendorName(vendor.name)
    const existing = unique.get(key)
    if (!existing || (vendor.is_enabled && !existing.is_enabled) ||
      (vendor.is_enabled === existing.is_enabled && existing.is_default === false && vendor.is_default)) {
      unique.set(key, vendor)
    }
  }
  return [...unique.values()]
}

export async function fetchFinancialCategories(): Promise<FinancialCategory[]> {
  const [snapshot, settingsSnapshot] = await Promise.all([
    getDocs(query(collection(db, CATEGORIES), orderBy('name', 'asc'))),
    getDoc(doc(db, 'site_config', PAYMENT_METHODS_CONFIG)),
  ])
  const history = readCategoryHistory(settingsSnapshot.exists() ? settingsSnapshot.data() : undefined)
  const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : undefined
  const managedDefaults = readManagedDefaultCategories(settings)
  const deletedDefaultIds = readDeletedDefaultCategoryIds(settings)
  const defaults = [
    ...DEFAULT_FINANCIAL_CATEGORIES.map(name => ({ name, type: 'expense' as const })),
    ...DEFAULT_INCOME_CATEGORIES.map(name => ({ name, type: 'income' as const })),
  ].map(item => {
    const id = defaultFinancialCategoryId(item.type, item.name)
    const managed = managedDefaults[id]
    const isPermanentlyDeleted = deletedDefaultIds.has(id)
    return {
      id,
      name: managed?.name ?? item.name,
      type: item.type,
      is_default: true,
      is_enabled: !isPermanentlyDeleted && managed?.is_enabled !== false,
      is_permanently_deleted: isPermanentlyDeleted,
      updated_at: managed?.updated_at,
    }
  })
  const custom: FinancialCategory[] = snapshot.docs.map(item => ({
    id: item.id,
    name: String(item.data().name ?? ''),
    type: item.data().type === 'income' ? 'income' : 'expense',
    is_default: false,
    is_enabled: item.data().is_enabled !== false,
    created_at: item.data().created_at instanceof Timestamp ? item.data().created_at : undefined,
    updated_at: item.data().updated_at instanceof Timestamp
      ? item.data().updated_at
      : history[item.id]?.updated_at ??
        (item.data().created_at instanceof Timestamp ? item.data().created_at : undefined),
  }))
  const unique = new Map<string, FinancialCategory>()
  const permanentlyDeletedDefaults = defaults.filter(category => category.is_permanently_deleted)
  for (const category of [...defaults, ...custom].filter(category => !category.is_permanently_deleted)) {
    const key = normalizeFinancialCategoryName(category.name)
    const existing = unique.get(key)
    if (!existing || (category.is_enabled !== false && existing.is_enabled === false) ||
      (category.is_enabled === existing.is_enabled && existing.is_default === false && category.is_default)) {
      unique.set(key, category)
    }
  }
  return [...unique.values(), ...permanentlyDeletedDefaults].sort((left, right) => left.name.localeCompare(right.name))
}

function normalizePaymentMethod(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeFinancialCategoryName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function defaultFinancialCategoryId(type: 'income' | 'expense', name: string): string {
  return `default_${type}_${encodeURIComponent(name.toLocaleLowerCase())}`
}

function readManagedDefaultCategories(
  data: DocumentData | undefined,
): Record<string, { name: string; is_enabled: boolean; updated_at?: Timestamp; historical_names: string[] }> {
  const raw = data?.managed_default_categories
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const validIds = new Set([
    ...DEFAULT_FINANCIAL_CATEGORIES.map(name => defaultFinancialCategoryId('expense', name)),
    ...DEFAULT_INCOME_CATEGORIES.map(name => defaultFinancialCategoryId('income', name)),
  ])
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
    if (!validIds.has(id) || !value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim().replace(/\s+/g, ' ') : ''
    if (!name) return []
    return [[id, {
      name,
      is_enabled: item.is_enabled !== false,
      ...(item.updated_at instanceof Timestamp ? { updated_at: item.updated_at } : {}),
      historical_names: Array.isArray(item.historical_names)
        ? item.historical_names.filter((entry: unknown): entry is string => typeof entry === 'string')
        : [],
    }]]
  }))
}

function readDeletedDefaultCategoryIds(data: DocumentData | undefined): Set<string> {
  const validIds = new Set([
    ...DEFAULT_FINANCIAL_CATEGORIES.map(name => defaultFinancialCategoryId('expense', name)),
    ...DEFAULT_INCOME_CATEGORIES.map(name => defaultFinancialCategoryId('income', name)),
  ])
  return new Set(
    (Array.isArray(data?.deleted_default_categories) ? data.deleted_default_categories : [])
      .filter((id: unknown): id is string => typeof id === 'string' && validIds.has(id)),
  )
}

function defaultFinancialCategoryNames(data: DocumentData | undefined): Set<string> {
  const managedDefaults = readManagedDefaultCategories(data)
  const names = [
    ...DEFAULT_FINANCIAL_CATEGORIES.map(name => ({
      name,
      managed: managedDefaults[defaultFinancialCategoryId('expense', name)],
    })),
    ...DEFAULT_INCOME_CATEGORIES.map(name => ({
      name,
      managed: managedDefaults[defaultFinancialCategoryId('income', name)],
    })),
  ]
  return new Set(names.flatMap(({ name, managed }) => [
    name,
    ...(managed ? [managed.name, ...managed.historical_names] : []),
  ]).map(normalizeFinancialCategoryName))
}

function normalizeFinancialVendorName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function financialVendorDisplayName(data: DocumentData, id: string): string {
  return String(data.financial_vendor_name ?? data.business_name ?? data.name ?? id)
}

export function getFinancialCategoryOptions(categories: FinancialCategory[]): string[] {
  const hasLoadedDefaultCategories = categories.some(category => category.is_default)
  const names = [
    ...(hasLoadedDefaultCategories
      ? categories.filter(category => category.is_default && category.is_enabled !== false).map(category => category.name)
      : [...DEFAULT_FINANCIAL_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]),
    ...categories
      .filter(category => !category.is_default && category.is_enabled !== false)
      .map(category => category.name),
  ]
  const uniqueNames = new Map<string, string>()
  for (const name of names) {
    const normalized = normalizeFinancialCategoryName(name)
    if (normalized && !uniqueNames.has(normalized)) uniqueNames.set(normalized, name.trim())
  }
  return [...uniqueNames.values()]
}

function readCategoryHistory(data: DocumentData | undefined): Record<string, { names: string[]; updated_at?: Timestamp }> {
  const raw = data?.category_history
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).flatMap(([id, value]) => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    return [[id, {
      names: Array.isArray(item.names) ? item.names.filter((name: unknown): name is string => typeof name === 'string') : [],
      ...(item.updated_at instanceof Timestamp ? { updated_at: item.updated_at } : {}),
    }]]
  }))
}

function paymentMethodId(name: string): string {
  return `legacy_${encodeURIComponent(normalizePaymentMethod(name).toLocaleLowerCase())}`
}

function readManagedPaymentMethods(value: unknown): Array<FinancialPaymentMethod & { legacy_name?: string }> {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return []
    const data = item as Record<string, unknown>
    const id = typeof data.id === 'string' ? data.id : ''
    const name = typeof data.name === 'string' ? normalizePaymentMethod(data.name) : ''
    if (!id || !name) return []
    return [{
      id,
      name,
      is_default: false,
      is_enabled: data.is_enabled !== false,
      updated_at: data.updated_at instanceof Timestamp ? data.updated_at : undefined,
      historical_names: Array.isArray(data.historical_names)
        ? data.historical_names.filter((entry: unknown): entry is string => typeof entry === 'string').map(normalizePaymentMethod)
        : [],
      ...(typeof data.legacy_name === 'string' ? { legacy_name: normalizePaymentMethod(data.legacy_name) } : {}),
    }]
  })
}

function defaultPaymentMethodId(name: string): string {
  return `default_${name.toLocaleLowerCase().replace(/\s+/g, '_')}`
}

function readManagedDefaultPaymentMethods(value: unknown): FinancialPaymentMethod[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return []
    const data = item as Record<string, unknown>
    const id = typeof data.id === 'string' ? data.id : ''
    const name = typeof data.name === 'string' ? normalizePaymentMethod(data.name) : ''
    if (!id || !name || !DEFAULT_FINANCIAL_PAYMENT_METHODS.some(method => defaultPaymentMethodId(method) === id)) return []
    return [{
      id,
      name,
      is_default: true,
      is_enabled: data.is_enabled !== false,
      updated_at: data.updated_at instanceof Timestamp ? data.updated_at : undefined,
      historical_names: Array.isArray(data.historical_names)
        ? data.historical_names.filter((entry: unknown): entry is string => typeof entry === 'string').map(normalizePaymentMethod)
        : [],
    }]
  })
}

function readDeletedDefaultPaymentMethodIds(value: unknown): Set<string> {
  const validIds = new Set(DEFAULT_FINANCIAL_PAYMENT_METHODS.map(defaultPaymentMethodId))
  return new Set(
    (Array.isArray(value) ? value : [])
      .filter((id: unknown): id is string => typeof id === 'string' && validIds.has(id)),
  )
}

function defaultPaymentMethodNames(data: DocumentData | undefined): Set<string> {
  const managedDefaults = readManagedDefaultPaymentMethods(data?.managed_default_methods)
  return new Set([
    ...DEFAULT_FINANCIAL_PAYMENT_METHODS,
    ...managedDefaults.flatMap(method => [method.name, ...(method.historical_names ?? [])]),
  ].map(name => normalizePaymentMethod(name).toLocaleLowerCase()))
}

function readPaymentMethodUsage(value: unknown): Record<string, { method_id: string; expires_at: Timestamp }> {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([id, entry]) => {
    if (!entry || typeof entry !== 'object') return []
    const usage = entry as Record<string, unknown>
    return typeof usage.method_id === 'string' && usage.expires_at instanceof Timestamp
      ? [[id, { method_id: usage.method_id, expires_at: usage.expires_at }]]
      : []
  }))
}

function paymentMethodsFromConfig(data: DocumentData | undefined): FinancialPaymentMethod[] {
  const managed = readManagedPaymentMethods(data?.managed_methods)
  const managedDefaults = readManagedDefaultPaymentMethods(data?.managed_default_methods)
  const deletedDefaultIds = readDeletedDefaultPaymentMethodIds(data?.deleted_default_methods)
  const suppressedLegacyNames = new Set(
    [
      ...managed.flatMap(item => [item.legacy_name, ...(item.historical_names ?? [])]),
      ...managedDefaults.flatMap(item => [item.name, ...(item.historical_names ?? [])]),
    ].map(name => name?.toLocaleLowerCase()).filter((name): name is string => Boolean(name)),
  )
  const names = Array.isArray(data?.custom_methods)
    ? data.custom_methods.filter((name: unknown): name is string => typeof name === 'string')
    : []
  const legacy = names.flatMap(nameInput => {
    const name = normalizePaymentMethod(nameInput)
    const normalized = name.toLocaleLowerCase()
    if (!name || suppressedLegacyNames.has(normalized) ||
      DEFAULT_FINANCIAL_PAYMENT_METHODS.some(method => method.toLocaleLowerCase() === normalized)) return []
    return [{
      id: paymentMethodId(name),
      name,
      is_default: false,
      is_enabled: true,
      updated_at: data?.updated_at instanceof Timestamp ? data.updated_at : undefined,
    }]
  })
  const defaults = DEFAULT_FINANCIAL_PAYMENT_METHODS.map(name => {
    const id = defaultPaymentMethodId(name)
    if (deletedDefaultIds.has(id)) return null
    return managedDefaults.find(method => method.id === id) ?? {
      id,
      name,
      is_default: true,
      is_enabled: true,
    }
  })
  const unique = new Map<string, FinancialPaymentMethod>()
  for (const method of [...defaults.filter((item): item is FinancialPaymentMethod => item !== null), ...managed, ...legacy]) {
    const key = method.name.toLocaleLowerCase()
    const existing = unique.get(key)
    if (!existing || (method.is_enabled && !existing.is_enabled) ||
      (existing.id.startsWith('legacy_') && !method.id.startsWith('legacy_'))) {
      unique.set(key, method)
    }
  }
  return [...unique.values()]
}

export async function fetchFinancialPaymentMethodSettings(): Promise<FinancialPaymentMethod[]> {
  const snapshot = await getDoc(doc(db, 'site_config', PAYMENT_METHODS_CONFIG))
  return paymentMethodsFromConfig(snapshot.exists() ? snapshot.data() : undefined)
}

export async function fetchFinancialPaymentMethods(): Promise<string[]> {
  const methods = await fetchFinancialPaymentMethodSettings()
  return methods.filter(method => method.is_enabled).map(method => method.name)
}

export async function setFinancialPaymentMethodPendingUse(
  sessionId: string,
  methodName: string | null,
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) {
    throw new Error('The payment method save session is invalid.')
  }
  const configRef = doc(db, 'site_config', PAYMENT_METHODS_CONFIG)
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(configRef)
    if (!snapshot.exists()) {
      if (methodName) throw new Error('This payment method is no longer available. Choose another method.')
      return
    }

    const data = snapshot.data()
    const now = Timestamp.now()
    const usage = Object.fromEntries(Object.entries(readPaymentMethodUsage(data.pending_payment_method_usage))
      .filter(([, entry]) => entry.expires_at.toMillis() > now.toMillis()))
    if (methodName) {
      const normalizedName = normalizePaymentMethod(methodName).toLocaleLowerCase()
      const method = paymentMethodsFromConfig(data).find(item =>
        !item.is_default && item.is_enabled && item.name.toLocaleLowerCase() === normalizedName)
      if (!method) throw new Error(`“${methodName}” is no longer available. Choose another payment method.`)
      usage[sessionId] = {
        method_id: method.id,
        expires_at: Timestamp.fromMillis(now.toMillis() + PAYMENT_METHOD_USAGE_LEASE_MS),
      }
    } else {
      delete usage[sessionId]
    }
    transaction.update(configRef, { pending_payment_method_usage: usage })
  })
}

export async function saveFinancialPaymentMethod(input: {
  id?: string
  name: string
  is_enabled?: boolean
}): Promise<FinancialPaymentMethod> {
  const actor = requireActor()
  const name = normalizePaymentMethod(input.name)
  if (!name || name.length > 80) throw new Error('Payment method names must contain 1–80 characters.')
  const normalized = name.toLocaleLowerCase()
  if (typeof input.is_enabled !== 'undefined' && typeof input.is_enabled !== 'boolean') {
    throw new Error('Select whether the payment method is active.')
  }
  const configRef = doc(db, 'site_config', PAYMENT_METHODS_CONFIG)
  const generatedId = doc(collection(db, 'site_config')).id
  let saved: FinancialPaymentMethod | null = null
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(configRef)
    const data = snapshot.exists() ? snapshot.data() : {}
    const configured = paymentMethodsFromConfig(data)
    const current = input.id
      ? configured.find(method => method.id === input.id)
      : configured.find(method => !method.is_default && !method.is_enabled && method.name.toLocaleLowerCase() === normalized)
    if (input.id && !current) throw new Error('This payment method no longer exists.')
    if (!current?.is_default && defaultPaymentMethodNames(data).has(normalized)) {
      throw new Error('That name is reserved for a default payment method.')
    }
    if (configured.some(method => method.id !== current?.id &&
      (method.is_default || method.is_enabled) &&
      method.name.toLocaleLowerCase() === normalized)) {
      throw new Error('A payment method with that name already exists.')
    }
    const updatedAt = Timestamp.now()
    const historicalNames = new Set([
      ...(current?.historical_names ?? []),
      ...(current && current.name !== name ? [current.name] : []),
    ].map(normalizePaymentMethod).filter(Boolean))

    if (current?.is_default) {
      const method: FinancialPaymentMethod = {
        ...current,
        name,
        is_enabled: input.is_enabled ?? current.is_enabled,
        updated_at: updatedAt,
        historical_names: [...historicalNames],
      }
      const managedDefaults = readManagedDefaultPaymentMethods(data.managed_default_methods)
      const nextDefaults = managedDefaults.some(item => item.id === method.id)
        ? managedDefaults.map(item => item.id === method.id ? method : item)
        : [...managedDefaults, method]
      transaction.set(configRef, {
        managed_default_methods: nextDefaults.map(item => ({
          id: item.id,
          name: item.name,
          is_enabled: item.is_enabled,
          ...(item.updated_at ? { updated_at: item.updated_at } : {}),
          historical_names: item.historical_names ?? [],
        })),
        updated_by: actor.uid,
        updated_at: updatedAt,
        accounts_settings_updated_at: updatedAt,
      }, { merge: true })
      saved = method
      return
    }

    const managed = readManagedPaymentMethods(data.managed_methods)
    const id = input.id ?? current?.id ?? generatedId
    const existingManaged = managed.find(method => method.id === id)
    const legacyName = existingManaged?.legacy_name ??
      (current?.id.startsWith('legacy_') ? current.name : undefined)
    const customHistoricalNames = new Set([
      ...(existingManaged?.historical_names ?? []),
      ...(existingManaged?.legacy_name ? [existingManaged.legacy_name] : []),
      ...(current && current.name !== name ? [current.name] : []),
    ].map(normalizePaymentMethod).filter(Boolean))
    const method: FinancialPaymentMethod & { legacy_name?: string } = {
      id,
      name,
      is_default: false,
      is_enabled: input.is_enabled ?? (input.id ? current?.is_enabled ?? true : true),
      updated_at: updatedAt,
      historical_names: [...customHistoricalNames],
      ...(legacyName ? { legacy_name: legacyName } : {}),
    }
    const nextManaged = existingManaged
      ? managed.map(item => item.id === existingManaged.id ? method : item)
      : [...managed, method]
    const nextMethods = [...configured.filter(item => item.id !== current?.id), method]
    transaction.set(configRef, {
      custom_methods: nextMethods
        .filter(item => !item.is_default && item.is_enabled)
        .map(item => item.name),
      managed_methods: nextManaged.map(item => ({
        id: item.id,
        name: item.name,
        is_enabled: item.is_enabled,
        ...((item.id === method.id || item.updated_at)
          ? { updated_at: item.id === method.id ? updatedAt : item.updated_at }
          : {}),
        historical_names: item.historical_names ?? [],
        ...(item.legacy_name ? { legacy_name: item.legacy_name } : {}),
      })),
      updated_by: actor.uid,
      updated_at: updatedAt,
      accounts_settings_updated_at: updatedAt,
    }, { merge: true })
    saved = method
  })
  if (!saved) throw new Error('The payment method could not be saved.')
  return saved
}

export async function createFinancialPaymentMethod(nameInput: string): Promise<string> {
  const method = await saveFinancialPaymentMethod({ name: nameInput })
  return method.name
}

export async function deleteFinancialPaymentMethod(methodId: string): Promise<void> {
  const actor = requireActor()
  const configRef = doc(db, 'site_config', PAYMENT_METHODS_CONFIG)
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(configRef)
    const data = snapshot.exists() ? snapshot.data() : {}
    const configured = paymentMethodsFromConfig(data)
    const method = configured.find(item => item.id === methodId)
    if (!method) throw new Error('This payment method no longer exists.')

    const now = Timestamp.now()
    if (method.is_default) {
      const deletedDefaultIds = readDeletedDefaultPaymentMethodIds(data.deleted_default_methods)
      if (deletedDefaultIds.has(method.id)) throw new Error('This payment method has already been permanently deleted.')
      transaction.set(configRef, {
        deleted_default_methods: [...new Set([...deletedDefaultIds, method.id])],
        updated_by: actor.uid,
        updated_at: now,
        accounts_settings_updated_at: now,
      }, { merge: true })
      return
    }

    const pendingUsage = Object.fromEntries(Object.entries(readPaymentMethodUsage(data.pending_payment_method_usage))
      .filter(([, entry]) => entry.expires_at.toMillis() > now.toMillis()))
    if (Object.values(pendingUsage).some(entry => entry.method_id === method.id)) {
      throw new Error(`“${method.name}” is being used in an unfinished transaction. Finish or cancel that save before removing it.`)
    }

    const managed = readManagedPaymentMethods(data.managed_methods)
      .filter(item => item.id !== method.id)
    const remaining = configured.filter(item => item.id !== method.id)
    transaction.set(configRef, {
      custom_methods: remaining
        .filter(item => !item.is_default && item.is_enabled)
        .map(item => item.name),
      managed_methods: managed.map(item => ({
        id: item.id,
        name: item.name,
        is_enabled: item.is_enabled,
        ...(item.updated_at ? { updated_at: item.updated_at } : {}),
        historical_names: item.historical_names ?? [],
        ...(item.legacy_name ? { legacy_name: item.legacy_name } : {}),
      })),
      pending_payment_method_usage: pendingUsage,
      updated_by: actor.uid,
      updated_at: now,
      accounts_settings_updated_at: now,
    }, { merge: true })
  })
}

export async function fetchFinancialSettingsLastUpdated(): Promise<Timestamp | null> {
  const [configSnapshot, categorySnapshot] = await Promise.all([
    getDoc(doc(db, 'site_config', PAYMENT_METHODS_CONFIG)),
    getDocs(collection(db, CATEGORIES)),
  ])
  const timestamps: Timestamp[] = []
  if (configSnapshot.exists()) {
    const config = configSnapshot.data()
    if (config.accounts_settings_updated_at instanceof Timestamp) timestamps.push(config.accounts_settings_updated_at)
    if (config.updated_at instanceof Timestamp) timestamps.push(config.updated_at)
  }
  for (const category of categorySnapshot.docs) {
    const data = category.data()
    if (data.updated_at instanceof Timestamp) timestamps.push(data.updated_at)
    else if (data.created_at instanceof Timestamp) timestamps.push(data.created_at)
  }
  return timestamps.reduce<Timestamp | null>(
    (latest, timestamp) => !latest || timestamp.toMillis() > latest.toMillis() ? timestamp : latest,
    null,
  )
}

export async function saveFinancialVendor(input: { id?: string; name: string }): Promise<void> {
  const actor = requireActor()
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 120) throw new Error('Vendor names must contain 1–120 characters.')
  const normalizedName = normalizeFinancialVendorName(name)
  const vendorsCollection = collection(db, 'vendors')
  const vendorsSnapshot = await getDocs(vendorsCollection)
  if (vendorsSnapshot.docs.some(item => {
    const data = item.data()
    const isDefault = data.is_financial_vendor !== true
    const isInactive = data.is_financial_vendor === true
      ? data.is_enabled === false
      : data.financial_vendor_enabled === false
    return item.id !== input.id && (isDefault || !isInactive) &&
      normalizeFinancialVendorName(financialVendorDisplayName(data, item.id)) === normalizedName
  })) {
    throw new Error('A vendor with that name already exists.')
  }

  const vendorRef = input.id
    ? doc(db, 'vendors', input.id)
    : doc(vendorsCollection, `financial_${encodeURIComponent(normalizedName)}`)
  const settingsRef = doc(db, 'site_config', PAYMENT_METHODS_CONFIG)
  const now = Timestamp.now()
  await runTransaction(db, async transaction => {
    const vendorSnapshot = await transaction.get(vendorRef)
    if (input.id && !vendorSnapshot.exists()) {
      throw new Error('This vendor no longer exists.')
    }
    if (!input.id && vendorSnapshot.exists() && vendorSnapshot.data().is_financial_vendor !== true) {
      throw new Error('A vendor with that name already exists.')
    }

    if (vendorSnapshot.exists()) {
      const currentData = vendorSnapshot.data()
      if (currentData.financial_vendor_permanently_deleted === true) {
        throw new Error('This vendor has been permanently removed from Accounts.')
      }
      if (currentData.is_financial_vendor === true) {
        transaction.update(vendorRef, {
          business_name: name,
          name,
          is_enabled: true,
          updated_by: actor.uid,
          updated_at: now,
        })
      } else {
        transaction.update(vendorRef, {
          financial_vendor_name: name,
          financial_vendor_enabled: true,
          financial_vendor_updated_by: actor.uid,
          financial_vendor_updated_at: now,
        })
      }
    } else {
      transaction.set(vendorRef, {
        business_name: name,
        name,
        is_financial_vendor: true,
        is_enabled: true,
        status: 'accounts_custom',
        created_by: actor.uid,
        created_by_name: actor.name,
        created_at: now,
        updated_by: actor.uid,
        updated_at: now,
      })
    }
    transaction.set(settingsRef, {
      updated_by: actor.uid,
      updated_at: now,
      accounts_settings_updated_at: now,
    }, { merge: true })
  })
}

export async function deleteFinancialVendor(vendorId: string): Promise<void> {
  const actor = requireActor()
  const vendorRef = doc(db, 'vendors', vendorId)
  const settingsRef = doc(db, 'site_config', PAYMENT_METHODS_CONFIG)
  const now = Timestamp.now()
  await runTransaction(db, async transaction => {
    const vendorSnapshot = await transaction.get(vendorRef)
    if (!vendorSnapshot.exists()) throw new Error('This vendor no longer exists.')
    const data = vendorSnapshot.data()
    const isCustom = data.is_financial_vendor === true
    const isEnabled = isCustom ? data.is_enabled !== false : data.financial_vendor_enabled !== false
    if (data.financial_vendor_permanently_deleted === true || (isCustom && !isEnabled)) {
      throw new Error('This vendor has already been removed.')
    }
    transaction.update(vendorRef, isCustom
      ? {
          is_enabled: false,
          updated_by: actor.uid,
          updated_at: now,
        }
      : {
          financial_vendor_enabled: false,
          financial_vendor_permanently_deleted: true,
          financial_vendor_updated_by: actor.uid,
          financial_vendor_updated_at: now,
        })
    transaction.set(settingsRef, {
      updated_by: actor.uid,
      updated_at: now,
      accounts_settings_updated_at: now,
    }, { merge: true })
  })
}

export async function createUnpostedFinancialIncome(
  input: NewIncomeInput,
  idempotencyKey: string,
): Promise<void> {
  const functionName = 'createUnpostedFinancialIncome'
  const createIncome = httpsCallable<
    { input: NewIncomeInput; idempotency_key: string },
    { success: boolean; transaction_id: string }
  >(getFunctions(app, ACCOUNTS_FUNCTION_REGION), functionName)
  try {
    await createIncome({ input, idempotency_key: idempotencyKey })
  } catch (error) {
    const details = error && typeof error === 'object'
      ? error as { code?: unknown; message?: unknown; details?: unknown }
      : {}
    console.error('[accounts] Income save callable failed', {
      functionName,
      region: ACCOUNTS_FUNCTION_REGION,
      projectId: app.options.projectId || 'unknown',
      errorCode: typeof details.code === 'string' ? details.code : 'unknown',
      errorMessage: typeof details.message === 'string'
        ? details.message
        : error === undefined ? 'Unknown error' : String(error),
      errorDetails: details.details,
      error,
    })
    throw error
  }
}

export async function editUnpostedFinancialIncome(
  transactionId: string,
  input: NewIncomeInput,
): Promise<void> {
  const editIncome = httpsCallable<
    { transaction_id: string; input: NewIncomeInput },
    { success: boolean; transaction_id: string }
  >(getFunctions(app, ACCOUNTS_FUNCTION_REGION), 'editUnpostedFinancialIncome')
  await editIncome({ transaction_id: transactionId, input })
}

export async function deleteUnpostedFinancialIncome(transactionId: string): Promise<void> {
  const deleteIncome = httpsCallable<
    { transaction_id: string },
    { success: boolean; transaction_id: string }
  >(getFunctions(app, ACCOUNTS_FUNCTION_REGION), 'deleteUnpostedFinancialIncome')
  await deleteIncome({ transaction_id: transactionId })
}

export async function fetchUnpostedFinancialIncomes(): Promise<UnpostedFinancialIncome[]> {
  try {
    const snapshot = await getDocs(query(
      collection(db, TRANSACTIONS),
      where('posting_status', '==', 'unposted'),
    ))
    return snapshot.docs
      .filter(item => item.data().type === 'income' && item.data().is_deleted !== true)
      .map<UnpostedFinancialIncome>(item => {
        const data = item.data()
        if (!(data.transaction_date instanceof Timestamp) ||
          !Number.isSafeInteger(data.amount_paise) || data.amount_paise <= 0) {
          throw new Error(`Unposted income ${item.id} has invalid financial details.`)
        }
        return {
          id: item.id,
          transaction_id: typeof data.transaction_id === 'string' ? data.transaction_id : item.id,
          transaction_date: data.transaction_date.toDate().toISOString().slice(0, 10),
          amount_paise: data.amount_paise,
          festival_tag: typeof data.festival_tag === 'string' ? data.festival_tag : null,
          festival_tag_id: typeof data.festival_tag_id === 'string' ? data.festival_tag_id : null,
          category_name: typeof data.category_name === 'string' ? data.category_name : '',
          description: typeof data.description === 'string' ? data.description : '',
          payment_method: typeof data.payment_method === 'string' ? data.payment_method : '',
          vendor_name: typeof data.party_name === 'string' ? data.party_name : '',
          payment_reference: typeof data.payment_reference === 'string' ? data.payment_reference : '',
          reference_no: typeof data.reference_no === 'string' ? data.reference_no : '',
          source_of_income: typeof data.source_of_income === 'string' ? data.source_of_income : '',
          receipt_paths: Array.isArray(data.receipt_paths)
            ? data.receipt_paths.filter((path): path is string => typeof path === 'string')
            : [],
          posting_status: 'unposted',
          editable: (data.account_id == null || data.account_id === '') &&
            data.linked_order_id == null &&
            data.linked_expense_id == null,
        }
      })
      .sort((left, right) => right.transaction_date.localeCompare(left.transaction_date) || right.id.localeCompare(left.id))
  } catch (error) {
    const details = error && typeof error === 'object'
      ? error as { code?: unknown; message?: unknown }
      : {}
    console.error('[accounts] Firestore unposted income read failed', {
      sourceCollection: TRANSACTIONS,
      projectId: app.options.projectId || 'unknown',
      databaseId: 'festecart',
      errorCode: typeof details.code === 'string' || typeof details.code === 'number' ? details.code : 'unknown',
      errorMessage: typeof details.message === 'string'
        ? details.message
        : error === undefined ? 'Unknown error' : String(error),
      error,
    })
    throw error
  }
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

export async function uploadFinancialTransactionReceipt(transactionId: string, file: File): Promise<void> {
  const actor = requireActor()
  await refreshAccountsAdminClaims()
  if (!transactionId || transactionId.includes('/') || transactionId.length > 200) {
    throw new Error('The income record could not be identified.')
  }
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) throw new Error('Attach a PDF, JPEG, PNG, or WebP receipt.')
  if (file.size <= 0 || file.size >= 10 * 1024 * 1024) throw new Error('Receipt files must be smaller than 10 MB.')
  const extension = file.type === 'application/pdf' ? 'pdf' : file.type.split('/')[1]
  const path = `financial-receipts/${actor.uid}/${transactionId}/${crypto.randomUUID()}.${extension}`
  const fileRef = storageRef(storage, path)
  await uploadBytes(fileRef, file, { contentType: file.type })

  try {
    const attachReceipt = httpsCallable<
      { transaction_id: string; storage_path: string },
      { success: boolean }
    >(getFunctions(app, ACCOUNTS_FUNCTION_REGION), 'attachFinancialTransactionReceipt')
    await attachReceipt({ transaction_id: transactionId, storage_path: path })
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

export async function createFinancialCategory(nameInput: string, type: 'income' | 'expense' = 'expense'): Promise<void> {
  const actor = requireActor()
  const name = nameInput.trim().replace(/\s+/g, ' ')
  if (!name || name.length > 80) throw new Error('Category names must contain 1–80 characters.')
  const availableCategories = await fetchFinancialCategories()
  if (availableCategories.some(item => item.is_enabled !== false &&
    normalizeFinancialCategoryName(item.name) === normalizeFinancialCategoryName(name))) {
    throw new Error('That category is already available.')
  }
  const categories = await getDocs(collection(db, CATEGORIES))
  const matches = categories.docs.filter(item =>
    normalizeFinancialCategoryName(String(item.data().name ?? '')) === normalizeFinancialCategoryName(name))
  const activeMatch = matches.find(item => item.data().is_enabled !== false)
  if (activeMatch) {
    throw new Error('A category with that name already exists.')
  }
  const categoryRef = doc(db, CATEGORIES, matches[0]?.id ?? `shared_${encodeURIComponent(name.toLocaleLowerCase())}`)
  const settingsRef = doc(db, 'site_config', PAYMENT_METHODS_CONFIG)
  const now = Timestamp.now()
  await runTransaction(db, async transaction => {
    const [snapshot, settingsSnapshot] = await Promise.all([
      transaction.get(categoryRef),
      transaction.get(settingsRef),
    ])
    if (snapshot.exists() && snapshot.data().is_enabled !== false) {
      throw new Error('A category with that name already exists.')
    }
    const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
    if (defaultFinancialCategoryNames(settings).has(normalizeFinancialCategoryName(name))) {
      throw new Error('That name is reserved for a default category.')
    }
    if (snapshot.exists()) {
      transaction.update(categoryRef, { name, is_enabled: true })
    } else {
      transaction.set(categoryRef, {
        name,
        type,
        is_enabled: true,
        created_by: actor.uid,
        created_by_name: actor.name,
        created_at: now,
      })
    }
    const history = readCategoryHistory(settings)
    const previousNames = history[categoryRef.id]?.names ?? []
    history[categoryRef.id] = { names: [...new Set([...previousNames, name])], updated_at: now }
    transaction.set(settingsRef, {
      category_history: history,
      updated_by: actor.uid,
      updated_at: now,
      accounts_settings_updated_at: now,
    }, { merge: true })
  })
}

export async function updateFinancialCategory(
  categoryId: string,
  input: { name: string; is_enabled: boolean },
): Promise<void> {
  const actor = requireActor()
  const name = input.name.trim().replace(/\s+/g, ' ')
  if (!categoryId || !name || name.length > 80 || typeof input.is_enabled !== 'boolean') {
    throw new Error('Enter a category name and status.')
  }
  const categories = await fetchFinancialCategories()
  const currentCategory = categories.find(item => item.id === categoryId)
  if (!currentCategory) throw new Error('This category no longer exists.')
  if (currentCategory.is_permanently_deleted) throw new Error('This category has been permanently deleted.')
  if (!currentCategory.is_default) {
    const settingsSnapshot = await getDoc(doc(db, 'site_config', PAYMENT_METHODS_CONFIG))
    const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : undefined
    if (defaultFinancialCategoryNames(settings).has(normalizeFinancialCategoryName(name))) {
      throw new Error('That name is reserved for a default category.')
    }
  }
  if (categories.some(item =>
    item.id !== categoryId && (item.is_default || item.is_enabled !== false) &&
    normalizeFinancialCategoryName(item.name) === normalizeFinancialCategoryName(name))) {
    throw new Error('A category with that name already exists.')
  }

  const settingsRef = doc(db, 'site_config', PAYMENT_METHODS_CONFIG)
  const now = Timestamp.now()
  if (currentCategory.is_default) {
    await runTransaction(db, async transaction => {
      const settingsSnapshot = await transaction.get(settingsRef)
      const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
      const overrides = readManagedDefaultCategories(settings)
      const existing = overrides[categoryId]
      const history = readCategoryHistory(settings)
      const previousNames = new Set([
        ...(existing?.historical_names ?? []),
        currentCategory.name,
        name,
      ].filter(Boolean))
      overrides[categoryId] = {
        name,
        is_enabled: input.is_enabled,
        updated_at: now,
        historical_names: [...previousNames],
      }
      const previousHistory = history[categoryId]?.names ?? []
      history[categoryId] = {
        names: [...new Set([...previousHistory, currentCategory.name, name].filter(Boolean))],
        updated_at: now,
      }
      transaction.set(settingsRef, {
        managed_default_categories: overrides,
        category_history: history,
        updated_by: actor.uid,
        updated_at: now,
        accounts_settings_updated_at: now,
      }, { merge: true })
    })
    return
  }

  const categoryRef = doc(db, CATEGORIES, categoryId)
  await runTransaction(db, async transaction => {
    const [current, settingsSnapshot] = await Promise.all([
      transaction.get(categoryRef),
      transaction.get(settingsRef),
    ])
    if (!current.exists()) throw new Error('This category no longer exists.')
    const currentData = current.data()
    const type = currentData.type === 'income' ? 'income' : currentData.type === 'expense' ? 'expense' : null
    if (!type) throw new Error('This category has an unsupported type.')
    const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
    const history = readCategoryHistory(settings)
    const previousNames = history[categoryId]?.names ?? []
    history[categoryId] = {
      names: [...new Set([...previousNames, String(current.data().name ?? ''), name].filter(Boolean))],
      updated_at: now,
    }
    transaction.update(categoryRef, { name, is_enabled: input.is_enabled })
    transaction.set(settingsRef, {
      category_history: history,
      updated_by: actor.uid,
      updated_at: now,
      accounts_settings_updated_at: now,
    }, { merge: true })
  })
}

export async function deleteFinancialCategory(categoryId: string): Promise<void> {
  const actor = requireActor()
  const category = (await fetchFinancialCategories()).find(item => item.id === categoryId)
  if (!category) throw new Error('This category no longer exists.')
  if (category.is_permanently_deleted) throw new Error('This category has already been permanently deleted.')
  if (category.is_default) {
    const settingsRef = doc(db, 'site_config', PAYMENT_METHODS_CONFIG)
    const now = Timestamp.now()
    await runTransaction(db, async transaction => {
      const settingsSnapshot = await transaction.get(settingsRef)
      const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {}
      const deletedDefaultIds = readDeletedDefaultCategoryIds(settings)
      if (deletedDefaultIds.has(categoryId)) throw new Error('This category has already been permanently deleted.')
      transaction.set(settingsRef, {
        deleted_default_categories: [...new Set([...deletedDefaultIds, categoryId])],
        updated_by: actor.uid,
        updated_at: now,
        accounts_settings_updated_at: now,
      }, { merge: true })
    })
    return
  }
  if (category.is_enabled === false) throw new Error('This category has already been removed.')
  await updateFinancialCategory(categoryId, { name: category.name, is_enabled: false })
}

export async function fetchVendorDueTotal(): Promise<number> {
  return (await fetchExpenses())
    .filter(expense => expense.is_vendor_payable)
    .reduce((total, expense) => total + expense.outstanding_paise, 0)
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
  const [transactions, unpostedIncomes] = await Promise.all([
    fetchReportTransactions(range),
    fetchUnpostedFinancialIncomes(),
  ])
  const incomesInRange = unpostedIncomes.filter(item =>
    (!range.from || item.transaction_date >= range.from) &&
    (!range.to || item.transaction_date <= range.to))
  return {
    income_paise: transactions.filter(item => item.type === 'income').reduce((total, item) => total + item.amount_paise, 0) +
      incomesInRange.reduce((total, item) => total + item.amount_paise, 0),
    expense_paise: transactions.filter(item => item.type === 'expense').reduce((total, item) => total + item.amount_paise, 0),
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
  const isPettyCashSpending = input.is_petty_cash_spending === true
  assertPaise(amount, 'Amount')
  if (isPettyCashSpending && input.type !== 'expense') throw new Error('Petty cash records must be expenses.')
  if (!isPettyCashSpending && !input.account_id) throw new Error('Choose an account.')
  if (!input.category_name.trim()) throw new Error('Choose a category.')
  if (input.type === 'transfer' && (!input.transfer_to_account_id || input.account_id === input.transfer_to_account_id)) {
    throw new Error('Choose two different accounts for a transfer.')
  }
  if (input.type !== 'transfer' && input.transfer_to_account_id) {
    throw new Error('A destination account is only valid for a transfer.')
  }
  const festivalTag = normalizeFestivalTag(input.festival_tag, 'Festival tag')
  const festivalTagIdValue = normalizeFestivalTagId(input.festival_tag_id, festivalTag, 'Festival tag')
  if (festivalTagIdValue && !festivalTag) throw new Error('A tag name is required when a tag ID is selected.')

  const referenceId = isPettyCashSpending
    ? input.idempotency_key ?? input.reference_no
    : input.reference_no
  const transactionRef = doc(db, TRANSACTIONS, transactionReferenceId(referenceId))
  const accountRef = isPettyCashSpending ? null : doc(db, ACCOUNTS, input.account_id)
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
      accountRef ? transaction.get(accountRef) : Promise.resolve(null),
      destinationRef ? transaction.get(destinationRef) : Promise.resolve(null),
    ])
    if (existing.exists()) throw new Error('That reference has already been used.')
    if (accountRef && !accountSnapshot?.exists()) throw new Error('The selected account no longer exists.')
    if (destinationRef && (!destinationSnapshot || !destinationSnapshot.exists())) {
      throw new Error('The destination account no longer exists.')
    }

    const source = accountSnapshot?.data()
    if (!isPettyCashSpending && (!source || source.active === false)) throw new Error('The selected account is inactive.')
    if (!input.description.trim() && !isPettyCashSpending && source?.type !== 'petty_cash') {
      throw new Error('Enter a description.')
    }
    if (!isPettyCashSpending && accountRef && source) {
      const sourceBalance = readNonnegativeInteger(source.balance_paise, 'account balance')
      const credit = input.type === 'income'
      const nextSource = sourceBalance + (credit ? amount : -amount)
      if (nextSource < 0) throw new Error('The account does not have enough balance for this transaction.')
      if (!Number.isSafeInteger(nextSource)) throw new Error('The resulting account balance is too large.')
      transaction.update(accountRef, {
        balance_paise: nextSource,
        updated_by: actor.uid,
        updated_at: now,
      })
    }

    let destinationBalance = 0
    if (destinationRef && destinationSnapshot) {
      const destination = destinationSnapshot.data()
      if (!destination || destination.active === false) throw new Error('The destination account is inactive.')
      destinationBalance = readNonnegativeInteger(destination.balance_paise, 'destination balance')
      if (!Number.isSafeInteger(destinationBalance + amount)) {
        throw new Error('The resulting destination balance is too large.')
      }
    }

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
      account_id: isPettyCashSpending ? PETTY_CASH_TRANSACTION_ACCOUNT_ID : input.account_id,
      transfer_to_account_id: isPettyCashSpending ? null : input.transfer_to_account_id,
      linked_order_id: null,
      linked_expense_id: null,
      party_name: input.party_name?.trim() || null,
      receipt_paths: uploadedReceiptPath ? [uploadedReceiptPath] : [],
      payment_method: '',
      festival_tag: festivalTag,
      festival_tag_id: festivalTagIdValue,
      ...(isPettyCashSpending ? { is_petty_cash_spending: true } : {}),
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
  requireActor()
  assertPaise(input.amount_paise, 'Expense amount')
  const expenseId = input.expense_id.trim()
  if (expenseId && !/^[A-Za-z0-9-]{1,64}$/.test(expenseId)) {
    throw new Error('Enter an Expense ID using only letters, numbers, and hyphens.')
  }
  const enteredFestivalTag = normalizeFestivalTag(input.festival_tag, 'Festival tag')
  const festivalTagIdValue = normalizeFestivalTagId(input.festival_tag_id, enteredFestivalTag, 'Festival tag')
  const createRecord = httpsCallable<{ input: NewExpenseInput }, { success: boolean }>(
    getFunctions(app, 'us-central1'),
    'createFinancialExpense',
  )
  try {
    await createRecord({
      input: {
        ...input,
        expense_id: expenseId,
        payment_method: input.payment_method.trim(),
        festival_tag: enteredFestivalTag,
        festival_tag_id: festivalTagIdValue,
      },
    })
  } catch (error) {
    const failure = logExpenseCallableError('createFinancialExpense', error)
    if (failure.errorCode === 'functions/unauthenticated') {
      throw new Error('Sign in with an admin account before saving an expense.')
    }
    if (failure.errorCode === 'functions/permission-denied') {
      throw new Error('Your account does not have permission to save expenses.')
    }
    if ([
      'functions/invalid-argument',
      'functions/failed-precondition',
      'functions/not-found',
      'functions/resource-exhausted',
    ].includes(failure.errorCode)) {
      throw new Error(failure.errorMessage)
    }
    const detail = failure.errorMessage && failure.errorMessage !== 'INTERNAL'
      ? `: ${failure.errorMessage}`
      : ''
    throw new Error(`Expense could not be saved (${failure.errorCode})${detail}. Your entries are still in the form; correct the issue or try again.`)
  }
}

function logExpenseCallableError(
  functionName: string,
  error: unknown,
): { errorCode: string; errorMessage: string } {
  const details = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown }
    : {}
  const errorCode = typeof details.code === 'string' || typeof details.code === 'number'
    ? String(details.code)
    : 'unknown'
  const errorMessage = typeof details.message === 'string'
    ? details.message
    : error === undefined ? 'Unknown error' : String(error)
  console.error(`[accounts] ${functionName} failed`, {
    functionName,
    operation: functionName,
    collectionPath: EXPENSES,
    projectId: app.options.projectId || 'unknown',
    functionRegion: ACCOUNTS_FUNCTION_REGION,
    databaseId: 'festecart',
    isAuthenticated: Boolean(auth.currentUser),
    errorCode,
    errorMessage,
    error,
  })
  return { errorCode, errorMessage }
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
    const festivalTag = normalizeFestivalTag(expenseData.festival_tag, 'Expense festival tag')
    const festivalTagIdValue = normalizeFestivalTagId(expenseData.festival_tag_id, festivalTag, 'Expense festival tag')

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
      festival_tag: festivalTag,
      festival_tag_id: festivalTagIdValue,
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
