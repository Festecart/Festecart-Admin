import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare, Search, ChevronLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Enquiry {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  message: string | null
  subject: string | null
  created_at: string
}

function useEnquiries() {
  return useQuery({
    queryKey: ['contact-enquiries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_enquiries')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Enquiry[]
    },
    staleTime: 1000 * 60,
  })
}

function formatDateTime(str: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(str))
}

// ── Detail view ───────────────────────────────────────────────
function ViewEnquiry({ enquiry, onBack }: { enquiry: Enquiry; onBack: () => void }) {
  return (
    <div className="p-6 space-y-5 max-w-4xl">
      {/* Breadcrumb */}
      <p className="text-xs text-gray-400">
        <Link to="/orders" className="hover:text-gray-600">Dashboard</Link>
        {' / '}
        <button onClick={onBack} className="hover:text-gray-600">View Enquiry</button>
      </p>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">View Enquiry</h1>
        <button onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          <ChevronLeft size={14} /> Go Back
        </button>
      </div>

      {/* Name / Email / Phone row */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-gray-500 mb-1">Name</p>
            <p className="text-sm font-medium text-gray-900">{enquiry.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Email</p>
            <p className="text-sm text-gray-700">{enquiry.email || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Phone</p>
            <p className="text-sm text-gray-700">{enquiry.phone || '—'}</p>
          </div>
        </div>
      </div>

      {/* Message */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-xs text-gray-500 mb-2">Message</p>
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
          {enquiry.message || '—'}
        </p>
      </div>
    </div>
  )
}

// ── List view ─────────────────────────────────────────────────
export default function ContactEnquiries() {
  const { data: enquiries, isLoading, error } = useEnquiries()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Enquiry | null>(null)

  const filtered = (enquiries ?? []).filter(e => {
    const q = search.toLowerCase()
    return !q ||
      (e.name ?? '').toLowerCase().includes(q) ||
      (e.email ?? '').toLowerCase().includes(q) ||
      (e.subject ?? '').toLowerCase().includes(q)
  })

  if (selected) {
    return <ViewEnquiry enquiry={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="p-6 space-y-5">
      {/* Breadcrumb */}
      <p className="text-xs text-gray-400">
        <Link to="/orders" className="hover:text-gray-600">Orders</Link>
        {' / '}
        <span className="text-gray-600">Contact Enquiries</span>
      </p>

      <h1 className="text-2xl font-bold text-gray-900">Contact Enquiries</h1>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name, email, subject…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : error ? (
          <div className="p-12 text-center">
            <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No enquiries data</p>
            <p className="text-xs text-gray-400 mt-1">The contact_enquiries table may not exist yet</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No enquiries yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(e => (
                  <tr key={e.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => setSelected(e)}>
                    <td className="px-5 py-3 font-medium text-gray-900">{e.name || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{e.email || '—'}</td>
                    <td className="px-5 py-3 text-gray-500">{e.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{e.subject || '—'}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                    <td className="px-5 py-3 text-red-500 text-xs font-medium whitespace-nowrap">View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
