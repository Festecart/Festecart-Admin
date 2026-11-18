import type { Timestamp } from 'firebase/firestore'

export type FinancialAccountType = 'cash' | 'bank' | 'upi' | 'petty_cash'
export type FinancialTransactionType = 'income' | 'expense' | 'transfer' | 'opening_balance'

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
  receipt_paths: string[]
  payment_method: string
  created_by: string
  created_by_name: string
  created_at: Timestamp
}

export interface EditTransactionInput {
  transaction_date: string
  description: string
  category_name: string
}

export type ExpensePaymentStatus = 'unpaid' | 'partially_paid' | 'paid'

export interface FinancialExpense {
  id: string
  description: string
  category_name: string
  vendor_id: string | null
  vendor_name: string
  reference_no: string
  transaction_date: Timestamp
  due_date: Timestamp | null
  amount_paise: number
  paid_paise: number
  outstanding_paise: number
  payment_status: ExpensePaymentStatus
  is_vendor_payable: boolean
  receipt_paths: string[]
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
  description: string
  category_name: string
  vendor_id: string | null
  vendor_name: string
  reference_no: string
  transaction_date: string
  due_date: string
  amount_paise: number
  paid_paise: number
  account_id: string | null
  payment_reference: string
  payment_method: string
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
}
