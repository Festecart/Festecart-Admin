import { useState, type ChangeEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Upload } from 'lucide-react'
import { getExpenseReceiptUrl, uploadExpenseReceipt } from '@/lib/accounts'
import type { FinancialExpense } from '@/types/accounts'

export function ExpenseReceipts({ expense }: { expense: FinancialExpense }) {
  const queryClient = useQueryClient()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadExpenseReceipt(expense.id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts', 'expenses'] }),
  })
  const urlMutation = useMutation({
    mutationFn: (path: string) => getExpenseReceiptUrl(path),
    onSuccess: (url, path) => setUrls(current => ({ ...current, [path]: url })),
  })

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) uploadMutation.mutate(file)
  }

  return (
    <div className="min-w-[155px] space-y-1.5">
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
        <Upload size={13} /> {uploadMutation.isPending ? 'Uploading…' : 'Attach receipt'}
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploadMutation.isPending} onChange={chooseFile} className="sr-only" />
      </label>
      {expense.receipt_paths.map(path => (
        <div key={path} className="flex items-center gap-1.5 text-xs">
          <FileText size={13} className="shrink-0 text-slate-400" />
          {urls[path] ? <a href={urls[path]} target="_blank" rel="noreferrer" className="text-indigo-700 underline">Open receipt</a>
            : <button type="button" disabled={urlMutation.isPending} onClick={() => urlMutation.mutate(path)} className="text-indigo-700 hover:underline disabled:opacity-50">
              {urlMutation.isPending && urlMutation.variables === path ? 'Preparing…' : 'View receipt'}
            </button>}
        </div>
      ))}
      {uploadMutation.error instanceof Error && <p role="alert" className="max-w-[200px] text-xs text-rose-700">{uploadMutation.error.message}</p>}
      {urlMutation.error instanceof Error && <p role="alert" className="max-w-[200px] text-xs text-rose-700">{urlMutation.error.message}</p>}
    </div>
  )
}
