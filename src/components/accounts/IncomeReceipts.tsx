import { type ChangeEvent } from 'react'
import { FileText, Upload } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TransactionReceiptLink } from '@/components/accounts/TransactionReceiptLink'
import { uploadFinancialTransactionReceipt } from '@/lib/accounts'

export function IncomeReceipts({
  transactionId,
  receiptPaths,
}: {
  transactionId: string
  receiptPaths: string[]
}) {
  const queryClient = useQueryClient()
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFinancialTransactionReceipt(transactionId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
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
        <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={uploadMutation.isPending} onChange={chooseFile} className="sr-only" />
      </label>
      {receiptPaths.map(path => (
        <div key={path} className="flex items-center gap-1.5 text-xs">
          <FileText size={13} className="shrink-0 text-slate-400" />
          <TransactionReceiptLink path={path} />
        </div>
      ))}
      {uploadMutation.error instanceof Error && (
        <p role="alert" className="max-w-[200px] text-xs text-rose-700">{uploadMutation.error.message}</p>
      )}
    </div>
  )
}
