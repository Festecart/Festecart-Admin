import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDocs, updateDoc, deleteDoc,
  query, orderBy, Timestamp,
} from '@/lib/firebase'
import { MessageSquare, Search, ChevronLeft, Trash2 } from 'lucide-react'

interface Enquiry {
  id: string; name: string | null; email: string | null; phone: string | null
  message: string | null; subject: string | null; is_read: boolean; created_at: string
}

function useEnquiries() {
  return useQuery({
    queryKey: ['contact-enquiries'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'contact_enquiries'), orderBy('created_at', 'desc')))
      return snap.docs.map(d => {
        const data = d.data()
        const ts = data.created_at
        return {
          id: d.id,
          name:       data.name    ?? null,
          email:      data.email   ?? null,
          phone:      data.phone   ?? null,
          message:    data.message ?? null,
          subject:    data.subject ?? null,
          is_read:    data.is_read ?? false,
          created_at: ts?.toDate ? ts.toDate().toISOString() : (ts ?? ''),
        } as Enquiry
      })
    },
    staleTime: 1000 * 60,
  })
}

function formatDateTime(str: string) {
  if (!str) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).format(new Date(str))
}

function ViewEnquiry({ enquiry, onBack }: { enquiry: Enquiry; onBack: () => void }) {
  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <p className="text-xs text-gray-400">
        <Link to="/orders" className="hover:text-gray-600">Dashboard</Link>{' / '}
        <button onClick={onBack} className="hover:text-gray-600">View Enquiry</button>
      </p>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">View Enquiry</h1>
        <button onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          <ChevronLeft size={14} /> Go Back
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-3 gap-6">
          <div><p className="text-xs text-gray-500 mb-1">Name</p><p className="text-sm font-medium text-gray-900">{enquiry.name || '—'}</p></div>
          <div><p className="text-xs text-gray-500 mb-1">Email</p><p className="text-sm text-gray-700">{enquiry.email || '—'}</p></div>
          <div><p className="text-xs text-gray-500 mb-1">Phone</p><p className="text-sm text-gray-700">{enquiry.phone || '—'}</p></div>
        </div>
      </div>
      {enquiry.subject && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs text-gray-500 mb-2">Subject</p>
          <p className="text-sm text-gray-800 font-medium">{enquiry.subject}</p>
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-xs text-gray-500 mb-2">Message</p>
        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{enquiry.message || '—'}</p>
      </div>
    </div>
  )
}

export default function ContactEnquiries() {
  const qc = useQueryClient()
  const { data: enquiries, isLoading, error } = useEnquiries()
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<Enquiry | null>(null)

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await updateDoc(doc(db, 'contact_enquiries', id), { is_read: true, updated_at: Timestamp.now() })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-enquiries'] }),
  })

  const deleteEnquiry = useMutation({
    mutationFn: async (id: string) => { await deleteDoc(doc(db, 'contact_enquiries', id)) },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-enquiries'] }),
  })

  const handleView = (e: Enquiry) => {
    setSelected(e)
    if (!e.is_read) markRead.mutate(e.id)
  }

  if (selected) return <ViewEnquiry enquiry={selected} onBack={() => setSelected(null)} />

  const filtered = (enquiries ?? []).filter(e => {
    const q = search.toLowerCase()
    return !q || (e.name ?? '').toLowerCase().includes(q) ||
      (e.email ?? '').toLowerCase().includes(q) || (e.subject ?? '').toLowerCase().includes(q)
  })

  const unreadCount = (enquiries ?? []).filter(e => !e.is_read).length

  return (
    <div className="p-6 space-y-5">
      <p className="text-xs text-gray-400">
        <Link to="/orders" className="hover:text-gray-600">Orders</Link>{' / '}
        <span className="text-gray-600">Contact Enquiries</span>
      </p>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contact Enquiries</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-red-600 mt-0.5">{unreadCount} unread enquir{unreadCount === 1 ? 'y' : 'ies'}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="relative max-w-sm">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name, email, subject…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : error ? (
          <div className="p-12 text-center">
            <MessageSquare size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Could not load enquiries</p>
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
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${!e.is_read ? 'bg-blue-50/40' : ''}`}
                    onClick={() => handleView(e)}>
                    <td className="px-5 py-3 font-medium text-gray-900 flex items-center gap-2">
                      {!e.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                      {e.name || '—'}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{e.email || '—'}</td>
                    <td className="px-5 py-3 text-gray-500">{e.phone || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{e.subject || '—'}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                    <td className="px-5 py-3 flex items-center gap-2" onClick={ev => ev.stopPropagation()}>
                      <button onClick={() => handleView(e)} className="text-red-500 text-xs font-medium whitespace-nowrap">View →</button>
                      <button onClick={() => deleteEnquiry.mutate(e.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </td>
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
