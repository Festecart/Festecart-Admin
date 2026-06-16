import { useState, useEffect, useRef } from 'react'
import { useSiteConfig, useUpdateSiteConfig } from '@/hooks/useSiteConfig'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Check, Save } from 'lucide-react'

interface NavLink {
  name: string
  href: string
  order: number
  enabled: boolean
}

interface AnnouncementBar {
  enabled: boolean
  left_text: string
  right_text: string
}

// ── All pages with correct routes ─────────────────────────────
const PAGE_TYPES: { label: string; href: string; group: string }[] = [
  // Main pages
  { label: 'Home Page',           href: '/',                    group: 'Main' },
  { label: 'Products',            href: '/products',            group: 'Main' },
  { label: 'Categories',          href: '/categories',          group: 'Main' },
  { label: 'Vendors',             href: '/vendors',             group: 'Main' },
  { label: 'About',               href: '/about',               group: 'Main' },
  { label: 'Contact',             href: '/contact',             group: 'Main' },
  // Auth
  { label: 'Login / Register',    href: '/auth',                group: 'Auth' },
  { label: 'User Login',          href: '/auth?tab=login',      group: 'Auth' },
  { label: 'User Register',       href: '/auth?tab=register',   group: 'Auth' },
  { label: 'Vendor Login',        href: '/vendor-login',        group: 'Auth' },
  { label: 'Vendor Register',     href: '/vendor/register',     group: 'Auth' },
  // User
  { label: 'My Dashboard',        href: '/user/dashboard',      group: 'User' },
  { label: 'My Orders',           href: '/user/orders',         group: 'User' },
  { label: 'My Profile',          href: '/user/profile',        group: 'User' },
  // Vendor
  { label: 'Vendor Dashboard',    href: '/vendor/dashboard',    group: 'Vendor' },
  { label: 'Become a Vendor',     href: '/vendor/register',     group: 'Vendor' },
  // Shopping
  { label: 'Cart',                href: '/cart',                group: 'Shopping' },
  { label: 'Checkout',            href: '/checkout',            group: 'Shopping' },
  { label: 'Order Success',       href: '/order-success',       group: 'Shopping' },
  // Legal
  { label: 'Privacy Policy',      href: '/privacy',             group: 'Legal' },
  { label: 'Terms of Service',    href: '/terms',               group: 'Legal' },
  // Custom
  { label: 'Custom URL',          href: '',                     group: 'Custom' },
]

function getType(href: string): string {
  const match = PAGE_TYPES.find(p => p.href === href && p.href !== '')
  return match ? match.label : 'Custom URL'
}

// Group PAGE_TYPES for <optgroup> rendering
const PAGE_TYPE_GROUPS = PAGE_TYPES.reduce<Record<string, typeof PAGE_TYPES>>((acc, p) => {
  if (!acc[p.group]) acc[p.group] = []
  acc[p.group].push(p)
  return acc
}, {})

export default function SiteNavbar() {
  const { data: announcementRaw, isLoading: loadingAnn } = useSiteConfig('announcement_bar')
  const { data: navRaw, isLoading: loadingNav } = useSiteConfig('nav_links')
  const update = useUpdateSiteConfig()

  const [ann, setAnn] = useState<AnnouncementBar>({ enabled: true, left_text: '', right_text: '' })
  const [links, setLinks] = useState<NavLink[]>([])
  const [annSaved, setAnnSaved] = useState(false)
  const [navSaved, setNavSaved] = useState(false)
  const [annError, setAnnError] = useState<string | null>(null)
  const [navError, setNavError] = useState<string | null>(null)

  // Only initialise from DB once — prevent background refetch from wiping edits
  const annInit = useRef(false)
  const navInit = useRef(false)
  useEffect(() => {
    if (announcementRaw && !annInit.current) {
      setAnn(announcementRaw as AnnouncementBar)
      annInit.current = true
    }
  }, [announcementRaw])
  useEffect(() => {
    if (navRaw && !navInit.current) {
      setLinks((navRaw as NavLink[]).slice().sort((a, b) => a.order - b.order))
      navInit.current = true
    }
  }, [navRaw])

  const saveAnn = async () => {
    setAnnError(null)
    console.log('[SiteNavbar] Saving announcement_bar:', ann)
    try {
      await update.mutateAsync({ key: 'announcement_bar', value: ann })
      console.log('[SiteNavbar] announcement_bar saved successfully')
      setAnnSaved(true); setTimeout(() => setAnnSaved(false), 2000)
    } catch (e) {
      console.error('[SiteNavbar] announcement_bar save error:', e)
      setAnnError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const saveNav = async () => {
    setNavError(null)
    const reordered = links.map((l, i) => ({ ...l, order: i + 1 }))
    console.log('[SiteNavbar] Saving nav_links:', reordered)
    try {
      await update.mutateAsync({ key: 'nav_links', value: reordered })
      console.log('[SiteNavbar] nav_links saved successfully')
      setLinks(reordered)
      navInit.current = false
      setNavSaved(true); setTimeout(() => setNavSaved(false), 2000)
    } catch (e) {
      console.error('[SiteNavbar] nav_links save error:', e)
      setNavError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const moveLink = (idx: number, dir: -1 | 1) => {
    const next = [...links]
    const swap = idx + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    setLinks(next)
  }

  const toggleLink = (idx: number) =>
    setLinks(ls => ls.map((l, i) => i === idx ? { ...l, enabled: !l.enabled } : l))

  const updateLinkField = (idx: number, field: 'name' | 'href', val: string) =>
    setLinks(ls => ls.map((l, i) => i === idx ? { ...l, [field]: val } : l))

  const handleTypeChange = (idx: number, label: string) => {
    const preset = PAGE_TYPES.find(p => p.label === label)
    if (preset && preset.href !== '') {
      // preset page — set href automatically, use label as name if name is default
      setLinks(ls => ls.map((l, i) => i === idx ? { ...l, href: preset.href } : l))
    }
    // If Custom URL, just clear href so user types it
    if (label === 'Custom URL') {
      setLinks(ls => ls.map((l, i) => i === idx ? { ...l, href: '' } : l))
    }
  }

  const addLink = () =>
    setLinks(ls => [...ls, { name: 'New Link', href: '/', order: ls.length + 1, enabled: true }])

  const removeLink = (idx: number) =>
    setLinks(ls => ls.filter((_, i) => i !== idx))

  if (loadingAnn || loadingNav) {
    return <div className="p-8 flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" size={24} /></div>
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Navbar & Announcement</h1>

      {/* ── Announcement Bar ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Announcement Bar</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{ann.enabled ? 'Visible on store' : 'Hidden'}</span>
            <button
              onClick={() => setAnn(a => ({ ...a, enabled: !a.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ann.enabled ? 'bg-gray-900' : 'bg-gray-300'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ann.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Left Text</label>
            <input type="text" value={ann.left_text} onChange={e => setAnn(a => ({ ...a, left_text: e.target.value }))}
              placeholder="live desi. be desi"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Right Text</label>
            <input type="text" value={ann.right_text} onChange={e => setAnn(a => ({ ...a, right_text: e.target.value }))}
              placeholder="Now delivered only in Bengaluru"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
        </div>
        {annError && <p className="text-xs text-red-600">{annError}</p>}
        <button onClick={saveAnn} disabled={update.isPending}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {annSaved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save Announcement</>}
        </button>
      </div>

      {/* ── Nav Links ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Navigation Links</h2>
          <button onClick={addLink}
            className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <Plus size={13} /> Add Link
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 gap-2 px-3 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <div className="col-span-1" />
          <div className="col-span-2">Name</div>
          <div className="col-span-3">Type</div>
          <div className="col-span-3">Value (URL)</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1" />
        </div>

        <div className="space-y-2">
          {links.map((link, idx) => {
            const currentType = getType(link.href)
            const isCustom = currentType === 'Custom URL'

            return (
              <div key={idx} className={`grid grid-cols-12 gap-2 items-center p-3 rounded-lg border ${link.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>

                {/* Up/Down */}
                <div className="col-span-1 flex flex-col gap-0.5">
                  <button onClick={() => moveLink(idx, -1)} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20"><ChevronUp size={13} /></button>
                  <button onClick={() => moveLink(idx, 1)} disabled={idx === links.length - 1} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-20"><ChevronDown size={13} /></button>
                </div>

                {/* Name */}
                <div className="col-span-2">
                  <input
                    type="text"
                    value={link.name}
                    onChange={e => updateLinkField(idx, 'name', e.target.value)}
                    placeholder="Link name"
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </div>

                  {/* Type dropdown */}
                <div className="col-span-3">
                  <select
                    value={currentType}
                    onChange={e => handleTypeChange(idx, e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 bg-white"
                  >
                    {Object.entries(PAGE_TYPE_GROUPS).map(([group, pages]) => (
                      <optgroup key={group} label={group}>
                        {pages.map(p => (
                          <option key={p.label} value={p.label}>{p.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                {/* Value — auto-filled for presets, editable for Custom URL */}
                <div className="col-span-3">
                  {isCustom ? (
                    <input
                      type="text"
                      value={link.href}
                      onChange={e => updateLinkField(idx, 'href', e.target.value)}
                      placeholder="https://… or /path"
                      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg font-mono text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  ) : (
                    <span className="px-2 py-1.5 text-xs font-mono text-gray-500 bg-gray-50 border border-gray-100 rounded-lg block truncate">
                      {link.href}
                    </span>
                  )}
                </div>

                {/* Status toggle */}
                <div className="col-span-2 flex items-center gap-2">
                  <button
                    onClick={() => toggleLink(idx)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${link.enabled ? 'bg-gray-900' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${link.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                  <select
                    value={link.enabled ? 'Active' : 'Inactive'}
                    onChange={e => setLinks(ls => ls.map((l, i) => i === idx ? { ...l, enabled: e.target.value === 'Active' } : l))}
                    className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white focus:outline-none"
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                  </select>
                </div>

                {/* Delete */}
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => removeLink(idx)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {navError && <p className="text-xs text-red-600">{navError}</p>}
        <button onClick={saveNav} disabled={update.isPending}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
          {navSaved ? <><Check size={13} /> Saved</> : <><Save size={13} /> Save Nav Links</>}
        </button>
      </div>
    </div>
  )
}
