import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { InfiniteData, QueryFunctionContext } from '@tanstack/react-query'
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore'
import {
  fetchAccountTotals,
  fetchAccounts,
  fetchFinancialCategories,
  fetchExpenses,
  fetchTransactionPage,
  fetchVendorDueTotal,
  fetchVendors,
} from '@/lib/accounts'
import type { FinancialTransactionPage } from '@/lib/accounts'
import type { AccountDateRange } from '@/types/accounts'

type TransactionCursor = QueryDocumentSnapshot<DocumentData> | null
type TransactionQueryKey = ['accounts', 'transactions']

export function useAccounts(range: AccountDateRange = {}) {
  const firstTransactionCursor: TransactionCursor = null
  const accounts = useQuery({
    queryKey: ['accounts', 'accounts'],
    queryFn: fetchAccounts,
    refetchInterval: 30_000,
  })
  const totals = useQuery({
    queryKey: ['accounts', 'totals', range.from ?? '', range.to ?? ''],
    queryFn: () => fetchAccountTotals(range),
    refetchInterval: 30_000,
  })
  const transactions = useInfiniteQuery<
    FinancialTransactionPage,
    Error,
    InfiniteData<FinancialTransactionPage>,
    TransactionQueryKey,
    TransactionCursor
  >({
    queryKey: ['accounts', 'transactions'],
    queryFn: ({ pageParam }: QueryFunctionContext<TransactionQueryKey, TransactionCursor>) => fetchTransactionPage(pageParam),
    initialPageParam: firstTransactionCursor,
    getNextPageParam: page => page.hasMore ? page.cursor : undefined,
    refetchInterval: 30_000,
  })
  const expenses = useQuery({
    queryKey: ['accounts', 'expenses'],
    queryFn: fetchExpenses,
    refetchInterval: 30_000,
  })
  const vendors = useQuery({
    queryKey: ['accounts', 'vendors'],
    queryFn: fetchVendors,
  })
  const categories = useQuery({
    queryKey: ['accounts', 'categories'],
    queryFn: fetchFinancialCategories,
  })
  const vendorDue = useQuery({
    queryKey: ['accounts', 'vendor-due'],
    queryFn: fetchVendorDueTotal,
    refetchInterval: 30_000,
  })
  return { accounts, totals, transactions, expenses, vendors, categories, vendorDue }
}
