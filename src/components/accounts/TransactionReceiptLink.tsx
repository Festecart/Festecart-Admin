import { useState } from 'react'
import { FileText } from 'lucide-react'
import { getTransactionReceiptUrl } from '@/lib/accounts'

export function TransactionReceiptLink({ path }: { path: string }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function openReceipt() {
    setError('')
    setLoading(true)
    try {
      setUrl(await getTransactionReceiptUrl(path))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Receipt could not be opened.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-slate-500"><FileText size={15} /> Receipt</span>
      {url
        ? <a href={url} target="_blank" rel="noreferrer" className="font-medium text-indigo-700 underline">Open receipt</a>
        : <button type="button" disabled={loading} onClick={() => void openReceipt()} className="font-medium text-indigo-700 disabled:opacity-50">
          {loading ? 'Preparing…' : 'View receipt'}
        </button>}
      {error && <span role="alert" className="basis-full text-xs text-rose-700">{error}</span>}
    </div>
  )
}
