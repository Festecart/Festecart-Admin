import type { Timestamp } from 'firebase/firestore'

export type FinancialAccountType = 'cash' | 'bank' | 'upi' | 'petty_cash'
export type FinancialTransactionType = 'income' | 'expense' | 'transfer' | 'opening_balance'

export interface FestivalTag {
  id: string
  name: string
  is_custom?: boolean
  is_enabled?: boolean
}

export interface FinancialAccount {
  id: string
  name: string
  type: FinancialAccountType
  opening_balance_paise: number
  balance_paise: number
  active: boolean
  created_at: Timestamp
}

export interface FinancialTransaction {
  id: string
  transaction_id: string
  type: FinancialTransactionType
  transaction_date: Timestamp
  reference_no: string
  description: string
  category_name: string
  amount_paise: number
  account_id: string
  transfer_to_account_id: string | null
  linked_order_id: string | null
  linked_expense_id: string | null
  party_name: string | null
  payment_reference?: string
  receipt_paths: string[]
  payment_method: string
  source_of_income?: string | null
  idempotency_key?: string | null
  posting_status?: 'unposted'
  festival_tag: string | null
  festival_tag_id: string | null
  is_petty_cash_spending?: boolean
  is_unallocated_expense_payment?: boolean
  created_by: string
  created_by_name: string
  created_at: Timestamp
}

export interface NewIncomeInput {
  amount_paise: number
  transaction_date: string
  festival_tag: string | null
  festival_tag_id: string | null
  category_name: string
  description: string
  payment_method: string
  vendor_name: string
  payment_reference?: string
  reference_no: string
  source_of_income: string
}

export interface UnpostedFinancialIncome {
  id: string
  transaction_id: string
  amount_paise: number
  transaction_date: string
  festival_tag: string | null
  festival_tag_id: string | null
  category_name: string
  description: string
  payment_method: string
  vendor_name: string
  payment_reference: string
  reference_no: string
  source_of_income: string
  receipt_paths: string[]
  posting_status: 'unposted'
  editable: boolean
}

export interface EditTransactionInput {
  transaction_date: string
  description: string
  category_name: string
  amount_paise: number
  account_id: string
  transfer_to_account_id: string | null
  payment_method: string
  festival_tag: string | null
  festival_tag_id: string | null
  is_petty_cash_spending?: boolean
  reference_no?: string
  party_name?: string | null
}

export type ExpensePaymentStatus = 'unpaid' | 'partially_paid' | 'paid'

export interface FinancialExpense {
  id: string
  expense_id: string
  description: string
  category_name: string
  vendor_id: string | null
  vendor_name: string
  payment_reference: string
  reference_no: string
  transaction_date: Timestamp
  due_date: Timestamp | null
  amount_paise: number
  paid_paise: number
  outstanding_paise: number
  payment_status: ExpensePaymentStatus
  payment_method: string
  is_accountless_payment?: boolean
  is_full_amount_spending?: boolean
  is_vendor_payable: boolean
  receipt_paths: string[]
  festival_tag: string | null
  festival_tag_id: string | null
  created_by: string
  created_at: Timestamp
}

export interface CustomerReceivable {
  id: string
  order_number: string
  customer_name: string
  user_id: string | null
  status: string
  total_paise: number
  paid_paise: number
  outstanding_paise: number
}

export interface VendorOption {
  id: string
  name: string
}

export interface FinancialCategory {
  id: string
  name: string
  type: 'income' | 'expense'
  is_default?: boolean
  is_enabled?: boolean
  is_permanently_deleted?: boolean
  created_at?: Timestamp
  updated_at?: Timestamp
}

export interface AccountTotals {
  income_paise: number
  expense_paise: number
}

export interface AccountDateRange {
  from?: string
  to?: string
}

export interface NewExpenseInput {
  expense_id: string
  description: string
  category_name: string
  vendor_id: string | null
  vendor_name: string
  payment_reference: string
  reference_no: string
  transaction_date: string
  amount_paise: number
  payment_method: string
  festival_tag: string | null
  festival_tag_id: string | null
}

export interface RecordPaymentInput {
  amount_paise: number
  account_id: string
  reference_no: string
  payment_method: string
}

export interface NewAccountInput {
  name: string
  type: FinancialAccountType
  opening_balance_paise: number
}

export interface NewTransactionInput {
  type: Exclude<FinancialTransactionType, 'opening_balance'>
  transaction_date: string
  reference_no: string
  description: string
  category_name: string
  amount_paise: number
  account_id: string
  transfer_to_account_id: string | null
  party_name?: string
  festival_tag?: string | null
  festival_tag_id?: string | null
  is_petty_cash_spending?: boolean
  idempotency_key?: string
}

export interface EditExpenseInput {
  description: string
  category_name: string
  vendor_id: string | null
  vendor_name: string
  payment_reference: string
  reference_no: string
  transaction_date: string
  amount_paise: number
  payment_method: string
  festival_tag: string | null
  festival_tag_id: string | null
}

export interface CustomerPayment {
  transaction: FinancialTransaction
  customer_name: string
  order_number: string
  order_payment_status: string
}
