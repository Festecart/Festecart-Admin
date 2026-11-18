import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Eye, Pencil } from 'lucide-react'
import type { FinancialAccount, FinancialTransaction } from '@/types/accounts'
import { formatINR } from '@/lib/accounts'

const transactionLabels: Record<FinancialTransaction['type'], string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  opening_balance: 'Opening balance',
}

export function TransactionTable({
  rows,
  accounts,
  onView,
  onEdit,
  simple = false,
}: {
  rows: FinancialTransaction[]
  accounts: FinancialAccount[]
  onView?: (transaction: FinancialTransaction) => void
  onEdit?: (transaction: FinancialTransaction) => void
  simple?: boolean
}) {
  const accountName = (id: string) => accounts.find(account => account.id === id)?.name ?? 'Unknown account'

  if (!rows.length) {
    return <p className="py-12 text-center text-sm text-slate-500">No transactions recorded yet.</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            {simple ? <>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Description</th>
              <th className="px-4 py-3 text-right font-semibold">Money In</th>
              <th className="px-4 py-3 text-right font-semibold">Money Out</th>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 text-right font-semibold">Balance</th>
            </> : <>
              <th className="px-4 py-3 font-semibold">Transaction</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
            </>}
            {(onView || onEdit) && <th className="px-4 py-3 text-right font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(item => {
            const Icon = item.type === 'income' ? ArrowDownLeft : item.type === 'transfer' ? ArrowLeftRight : ArrowUpRight
            const tone = item.type === 'income' ? 'text-emerald-700 bg-emerald-50' : item.type === 'transfer' ? 'text-blue-700 bg-blue-50' : 'text-rose-700 bg-rose-50'
            const account = accounts.find(row => row.id === item.account_id)
            return (
              <tr key={item.id} className="hover:bg-slate-50/80">
                {simple ? <>
                  <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{item.transaction_date.toDate().toLocaleDateString('en-IN')}</td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-slate-900">{item.description}</p>
                    <p className={`mt-0.5 text-xs ${item.type === 'income' ? 'text-emerald-700' : item.type === 'expense' ? 'text-rose-700' : 'text-slate-500'}`}>
                      {item.type === 'transfer'
                        ? `Transfer · ${formatINR(item.amount_paise)}`
                        : item.type === 'opening_balance'
                          ? 'Starting balance'
                          : `${item.category_name || 'Other'}${item.party_name ? ` · ${item.party_name}` : ''}`}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-emerald-700">
                    {item.type === 'income' ? formatINR(item.amount_paise) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-rose-700">
                    {item.type === 'expense' ? formatINR(item.amount_paise) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">
                    {accountName(item.account_id)}
                    {item.transfer_to_account_id && <span className="block text-xs text-slate-400">to {accountName(item.transfer_to_account_id)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-slate-700">{formatINR(account?.balance_paise ?? 0)}</td>
                </> : <>
                <td className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}><Icon size={16} /></span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{item.description}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{transactionLabels[item.type]} · {item.category_name || 'Uncategorized'}{item.party_name ? ` · ${item.party_name}` : ''} · Ref {item.reference_no || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">{item.transaction_date.toDate().toLocaleDateString('en-IN')}</td>
                <td className="px-4 py-3.5 text-slate-600">
                  {accountName(item.account_id)}
                  {item.transfer_to_account_id && <span className="block text-xs text-slate-400">to {accountName(item.transfer_to_account_id)}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-slate-900">{formatINR(item.amount_paise)}</td>
                </>}
                {(onView || onEdit) && (
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      {onView && <button type="button" onClick={() => onView(item)} aria-label={`View ${item.transaction_id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Eye size={15} /></button>}
                      {onEdit && item.type !== 'opening_balance' && !item.linked_order_id && !item.linked_expense_id && (
                        <button type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.transaction_id}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil size={15} /></button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
