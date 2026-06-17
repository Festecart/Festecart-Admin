import { useState, useEffect, useRef } from 'react'
import { useSiteConfig, useUpdateSiteConfig } from '@/hooks/useSiteConfig'
import { Plus, Trash2, Check, Save, Loader2, GripVertical } from 'lucide-react'

interface FooterContact { address: string; phone: string; email: string }
interface FooterSocial { facebook: string; instagram: string; twitter: string; whatsapp: string }
interface FooterLink { label: string; href: string; enabled: boolean }
interface FooterBottom { copyright_text: string; privacy_policy_url: string; terms_url: string }
interface FooterBrand { tagline: string }
interface FooterEarn { heading: string; links: FooterLink[] }
interface FooterColumn { heading: string; links: FooterLink[] }

// ── All pages with correct routes ─────────────────────────────
const PAGE_TYPES: { label: string; href: string; group: string }[] = [
  { label: 'Home Page',           href: '/',                    group: 'Main' },
  { label: 'Products',            href: '/products',            group: 'Main' },
  { label: 'Categories',          href: '/categories',          group: 'Main' },
  { label: 'Vendors',             href: '/vendors',             group: 'Main' },
  { label: 'About',               href: '/about',               group: 'Main' },
  { label: 'Contact',             href: '/contact',             group: 'Main' },
  { label: 'Login / Register',    href: '/auth',                group: 'Auth' },
  { label: 'User Login',          href: '/auth?tab=login',      group: 'Auth' },
  { label: 'User Register',       href: '/auth?tab=register',   group: 'Auth' },
  { label: 'Vendor Login',        href: '/vendor-login',        group: 'Auth' },
  { label: 'Vendor Register',     href: '/vendor/register',     group: 'Auth' },
  { label: 'My Dashboard',        href: '/user/dashboard',      group: 'User' },
  { label: 'My Orders',           href: '/user/orders',         group: 'User' },
  { label: 'My Profile',          href: '/user/profile',        group: 'User' },
  { label: 'Vendor Dashboard',    href: '/vendor/dashboard',    group: 'Vendor' },
  { label: 'Become a Vendor',     href: '/vendor/register',     group: 'Vendor' },
  { label: 'Cart',                href: '/cart',                group: 'Shopping' },
  { label: 'Checkout',            href: '/checkout',            group: 'Shopping' },
  { label: 'Order Success',       href: '/order-success',       group: 'Shopping' },
  { label: 'Privacy Policy',      href: '/privacy',             group: 'Legal' },
  { label: 'Terms of Service',    href: '/terms',               group: 'Legal' },
  { label: 'Custom URL',          href: '',                     group: 'Custom' },
]

function getType(href: string): string {
  const match = PAGE_TYPES.find(p => p.href === href && p.href !== '')
  return match ? match.label : 'Custom URL'
}

const PAGE_TYPE_GROUPS = PAGE_TYPES.reduce<Record<string, typeof PAGE_TYPES>>((acc, p) => {
  if (!acc[p.group]) acc[p.group] = []
  acc[p.group].push(p)
  return acc
}, {})

function SaveBtn({ onClick, saving, saved, error }: {
  onClick: () => void; saving: boolean; saved: boolean; error: string | null
}) {
  return (
    <div className="space-y-1">
      <button onClick={onClick} disabled={saving}
        className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg">
        {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
        {saved ? 'Saved' : 'Save'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

const Field = ({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
    <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
  </div>
)

// ── Reusable link list editor ─────────────────────────────────────
function LinkEditor({
  links,
  onChange,
}: {
  links: FooterLink[]
  onChange: (links: FooterLink[]) => void
}) {
  const addLink = () => onChange([...links, { label: 'New Link', href: '/', enabled: true }])
  const removeLink = (i: number) => onChange(links.filter((_, idx) => idx !== i))

  const handleTypeChange = (i: number, typeLabel: string) => {
    const preset = PAGE_TYPES.find(p => p.label === typeLabel)
    onChange(links.map((l, idx) => idx === i
      ? { ...l, href: (preset && preset.href !== '') ? preset.href : '' }
      : l
    ))
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
        <div className="col-span-3">Label</div>
        <div className="col-span-4">Type</div>
        <div className="col-span-3">URL</div>
        <div className="col-span-1">On</div>
        <div className="col-span-1" />
      </div>

      {links.map((link, i) => {
        const currentType = getType(link.href)
        const isCustom = currentType === 'Custom URL'
        return (
          <div key={i} className={`grid grid-cols-12 gap-2 items-center p-3 rounded-lg border ${link.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
            <div className="col-span-3">
              <input type="text" value={link.label}
                onChange={e => onChange(links.map((l, idx) => idx === i ? { ...l, label: e.target.value } : l))}
                placeholder="Link label"
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900" />
            </div>
            <div className="col-span-4">
              <select value={currentType} onChange={e => handleTypeChange(i, e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900">
                {Object.entries(PAGE_TYPE_GROUPS).map(([group, pages]) => (
                  <optgroup key={group} label={group}>
                    {pages.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="col-span-3">
              {isCustom ? (
                <input type="text" value={link.href}
                  onChange={e => onChange(links.map((l, idx) => idx === i ? { ...l, href: e.target.value } : l))}
                  placeholder="/custom-path"
                  className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900" />
              ) : (
                <span className="block px-2 py-1.5 text-xs font-mono text-gray-400 bg-gray-50 border border-gray-100 rounded-lg truncate">{link.href}</span>
              )}
            </div>
            <div className="col-span-1 flex justify-center">
              <button onClick={() => onChange(links.map((l, idx) => idx === i ? { ...l, enabled: !l.enabled } : l))}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${link.enabled ? 'bg-gray-900' : 'bg-gray-300'}`}>
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${link.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            <div className="col-span-1 flex justify-end">
              <button onClick={() => removeLink(i)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )
      })}

      {links.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-3">No links yet</p>
      )}

      <button onClick={addLink}
        className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
        <Plus size={13} /> Add Link
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function SiteFooter() {
  const update = useUpdateSiteConfig()

  const { data: contactRaw }  = useSiteConfig('footer_contact')
  const { data: socialRaw }   = useSiteConfig('footer_social')
  const { data: linksRaw }    = useSiteConfig('footer_links')
  const { data: bottomRaw }   = useSiteConfig('footer_bottom')
  const { data: brandRaw }    = useSiteConfig('footer_brand')
  const { data: earnRaw }     = useSiteConfig('footer_earn')
  const { data: columnsRaw }  = useSiteConfig('footer_columns')

  const [contact,  setContact]  = useState<FooterContact>({ address: '', phone: '', email: '' })
  const [social,   setSocial]   = useState<FooterSocial>({ facebook: '', instagram: '', twitter: '', whatsapp: '' })
  const [links,    setLinks]    = useState<FooterLink[]>([])
  const [bottom,   setBottom]   = useState<FooterBottom>({ copyright_text: '', privacy_policy_url: '/privacy', terms_url: '/terms' })
  const [brand,    setBrand]    = useState<FooterBrand>({ tagline: '' })
  const [earn,     setEarn]     = useState<FooterEarn>({ heading: 'Earn with Festecart', links: [] })
  const [columns,  setColumns]  = useState<FooterColumn[]>([])
  const [saved,    setSaved]    = useState<Record<string, boolean>>({})
  const [errors,   setErrors]   = useState<Record<string, string | null>>({})

  const inits = useRef<Record<string, boolean>>({})
  useEffect(() => { if (contactRaw && !inits.current.contact)  { setContact(contactRaw  as FooterContact);  inits.current.contact  = true } }, [contactRaw])
  useEffect(() => { if (socialRaw  && !inits.current.social)   { setSocial(socialRaw    as FooterSocial);   inits.current.social   = true } }, [socialRaw])
  useEffect(() => { if (linksRaw   && !inits.current.links)    { setLinks(linksRaw      as FooterLink[]);   inits.current.links    = true } }, [linksRaw])
  useEffect(() => { if (bottomRaw  && !inits.current.bottom)   { setBottom(bottomRaw    as FooterBottom);   inits.current.bottom   = true } }, [bottomRaw])
  useEffect(() => { if (brandRaw   && !inits.current.brand)    { setBrand(brandRaw      as FooterBrand);    inits.current.brand    = true } }, [brandRaw])
  useEffect(() => { if (earnRaw    && !inits.current.earn)     { setEarn(earnRaw        as FooterEarn);     inits.current.earn     = true } }, [earnRaw])
  useEffect(() => { if (columnsRaw && !inits.current.columns)  { setColumns(columnsRaw  as FooterColumn[]); inits.current.columns  = true } }, [columnsRaw])

  const save = async (key: string, value: unknown) => {
    setErrors(e => ({ ...e, [key]: null }))
    try {
      await update.mutateAsync({ key, value })
      inits.current[key.replace('footer_', '')] = false
      setSaved(s => ({ ...s, [key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } catch (e) {
      setErrors(prev => ({ ...prev, [key]: e instanceof Error ? e.message : 'Save failed' }))
    }
  }

  const addColumn = () => setColumns(cols => [...cols, { heading: 'New Column', links: [] }])
  const removeColumn = (i: number) => setColumns(cols => cols.filter((_, idx) => idx !== i))
  const updateColumnHeading = (i: number, heading: string) =>
    setColumns(cols => cols.map((c, idx) => idx === i ? { ...c, heading } : c))
  const updateColumnLinks = (i: number, links: FooterLink[]) =>
    setColumns(cols => cols.map((c, idx) => idx === i ? { ...c, links } : c))

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Footer Settings</h1>

      {/* Brand Tagline */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Brand Tagline</h2>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tagline (shown under logo)</label>
          <textarea value={brand.tagline} onChange={e => setBrand({ tagline: e.target.value })}
            rows={3} placeholder="Empowering artisans and small businesses…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none" />
        </div>
        <SaveBtn onClick={() => save('footer_brand', brand)} saving={update.isPending} saved={!!saved.footer_brand} error={errors.footer_brand ?? null} />
      </div>

      {/* Contact Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Contact Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Address" value={contact.address} onChange={v => setContact(c => ({ ...c, address: v }))} placeholder="123 Cultural Avenue, Mumbai…" />
          <Field label="Phone"   value={contact.phone}   onChange={v => setContact(c => ({ ...c, phone: v }))}   placeholder="+91 98765 43210" />
          <Field label="Email"   value={contact.email}   onChange={v => setContact(c => ({ ...c, email: v }))}   placeholder="hello@festecart.com" />
        </div>
        <SaveBtn onClick={() => save('footer_contact', contact)} saving={update.isPending} saved={!!saved.footer_contact} error={errors.footer_contact ?? null} />
      </div>

      {/* Social Links */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Social Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Facebook URL"  value={social.facebook}  onChange={v => setSocial(s => ({ ...s, facebook: v }))}  placeholder="https://facebook.com/festecart" />
          <Field label="Instagram URL" value={social.instagram} onChange={v => setSocial(s => ({ ...s, instagram: v }))} placeholder="https://instagram.com/festecart" />
          <Field label="Twitter / X"   value={social.twitter}   onChange={v => setSocial(s => ({ ...s, twitter: v }))}   placeholder="https://twitter.com/festecart" />
          <Field label="WhatsApp URL"  value={social.whatsapp}  onChange={v => setSocial(s => ({ ...s, whatsapp: v }))}  placeholder="https://wa.me/919876543210" />
        </div>
        <SaveBtn onClick={() => save('footer_social', social)} saving={update.isPending} saved={!!saved.footer_social} error={errors.footer_social ?? null} />
      </div>

      {/* Quick Links column */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Quick Links <span className="text-xs text-gray-400 font-normal ml-1">(footer column)</span></h2>
        <LinkEditor links={links} onChange={setLinks} />
        <SaveBtn onClick={() => save('footer_links', links)} saving={update.isPending} saved={!!saved.footer_links} error={errors.footer_links ?? null} />
      </div>

      {/* Earn with Festecart column */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">
          "Earn with Festecart" Column
          <span className="text-xs text-gray-400 font-normal ml-1">(footer column)</span>
        </h2>
        <Field label="Column Heading" value={earn.heading}
          onChange={v => setEarn(e => ({ ...e, heading: v }))}
          placeholder="Earn with Festecart" />
        <LinkEditor links={earn.links} onChange={ls => setEarn(e => ({ ...e, links: ls }))} />
        <SaveBtn onClick={() => save('footer_earn', earn)} saving={update.isPending} saved={!!saved.footer_earn} error={errors.footer_earn ?? null} />
      </div>

      {/* Custom Extra Columns */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">Extra Footer Columns</h2>
            <p className="text-xs text-gray-400 mt-0.5">Add unlimited custom columns to the footer (e.g. "Support", "Legal", etc.)</p>
          </div>
          <button onClick={addColumn}
            className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <Plus size={13} /> Add Column
          </button>
        </div>

        {columns.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
            No extra columns — click Add Column to create one
          </p>
        )}

        <div className="space-y-5">
          {columns.map((col, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <GripVertical size={14} className="text-gray-300" />
                  <input type="text" value={col.heading}
                    onChange={e => updateColumnHeading(i, e.target.value)}
                    placeholder="Column heading (e.g. Support)"
                    className="flex-1 px-3 py-2 text-sm font-semibold border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <button onClick={() => removeColumn(i)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
              <LinkEditor links={col.links} onChange={ls => updateColumnLinks(i, ls)} />
            </div>
          ))}
        </div>

        <SaveBtn onClick={() => save('footer_columns', columns)} saving={update.isPending} saved={!!saved.footer_columns} error={errors.footer_columns ?? null} />
      </div>

      {/* Copyright / Legal */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Copyright & Legal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Copyright Text" value={bottom.copyright_text}
            onChange={v => setBottom(b => ({ ...b, copyright_text: v }))}
            placeholder="© 2024 Festecart. All rights reserved." />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Privacy Policy Page</label>
            <select value={bottom.privacy_policy_url}
              onChange={e => setBottom(b => ({ ...b, privacy_policy_url: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="/privacy">/privacy</option>
              <option value="/privacy-policy">/privacy-policy</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Terms of Service Page</label>
            <select value={bottom.terms_url}
              onChange={e => setBottom(b => ({ ...b, terms_url: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="/terms">/terms</option>
              <option value="/terms-of-service">/terms-of-service</option>
            </select>
          </div>
        </div>
        <SaveBtn onClick={() => save('footer_bottom', bottom)} saving={update.isPending} saved={!!saved.footer_bottom} error={errors.footer_bottom ?? null} />
      </div>
    </div>
  )
}
