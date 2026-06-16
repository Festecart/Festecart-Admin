import { useState, useEffect, useRef } from 'react'
import { useSiteConfig, useUpdateSiteConfig } from '@/hooks/useSiteConfig'
import { Plus, Trash2, Check, Save, Loader2 } from 'lucide-react'

interface FooterContact { address: string; phone: string; email: string }
interface FooterSocial { facebook: string; instagram: string; twitter: string; whatsapp: string }
interface FooterLink { label: string; href: string; enabled: boolean }
interface FooterBottom { copyright_text: string; privacy_policy_url: string; terms_url: string }
interface FooterBrand { tagline: string }

// ── Same page type presets as navbar ─────────────────────────────
const PAGE_TYPES: { label: string; href: string }[] = [
  { label: 'Home Page',        href: '/' },
  { label: 'Products',         href: '/products' },
  { label: 'Categories',       href: '/categories' },
  { label: 'Vendors',          href: '/vendors' },
  { label: 'About',            href: '/about' },
  { label: 'Contact',          href: '/contact' },
  { label: 'Become a Vendor',  href: '/vendor/register' },
  { label: 'Privacy Policy',   href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Custom URL',       href: '' },
]

function getType(href: string): string {
  const match = PAGE_TYPES.find(p => p.href === href && p.href !== '')
  return match ? match.label : 'Custom URL'
}

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

export default function SiteFooter() {
  const update = useUpdateSiteConfig()

  const { data: contactRaw } = useSiteConfig('footer_contact')
  const { data: socialRaw }  = useSiteConfig('footer_social')
  const { data: linksRaw }   = useSiteConfig('footer_links')
  const { data: bottomRaw }  = useSiteConfig('footer_bottom')
  const { data: brandRaw }   = useSiteConfig('footer_brand')

  const [contact, setContact] = useState<FooterContact>({ address: '', phone: '', email: '' })
  const [social,  setSocial]  = useState<FooterSocial>({ facebook: '', instagram: '', twitter: '', whatsapp: '' })
  const [links,   setLinks]   = useState<FooterLink[]>([])
  const [bottom,  setBottom]  = useState<FooterBottom>({ copyright_text: '', privacy_policy_url: '', terms_url: '' })
  const [brand,   setBrand]   = useState<FooterBrand>({ tagline: '' })
  const [saved,   setSaved]   = useState<Record<string, boolean>>({})
  const [errors,  setErrors]  = useState<Record<string, string | null>>({})

  const inits = useRef<Record<string, boolean>>({})
  useEffect(() => { if (contactRaw && !inits.current.contact) { setContact(contactRaw as FooterContact); inits.current.contact = true } }, [contactRaw])
  useEffect(() => { if (socialRaw  && !inits.current.social)  { setSocial(socialRaw   as FooterSocial);  inits.current.social  = true } }, [socialRaw])
  useEffect(() => { if (linksRaw   && !inits.current.links)   { setLinks(linksRaw     as FooterLink[]);  inits.current.links   = true } }, [linksRaw])
  useEffect(() => { if (bottomRaw  && !inits.current.bottom)  { setBottom(bottomRaw   as FooterBottom);  inits.current.bottom  = true } }, [bottomRaw])
  useEffect(() => { if (brandRaw   && !inits.current.brand)   { setBrand(brandRaw     as FooterBrand);   inits.current.brand   = true } }, [brandRaw])

  const save = async (key: string, value: unknown) => {
    setErrors(e => ({ ...e, [key]: null }))
    try {
      await update.mutateAsync({ key, value })
      const fieldMap: Record<string, string> = {
        footer_contact: 'contact', footer_social: 'social',
        footer_links: 'links', footer_bottom: 'bottom', footer_brand: 'brand',
      }
      if (fieldMap[key]) inits.current[fieldMap[key]] = false
      setSaved(s => ({ ...s, [key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } catch (e) {
      setErrors(prev => ({ ...prev, [key]: e instanceof Error ? e.message : 'Save failed' }))
    }
  }

  const addLink = () => setLinks(ls => [...ls, { label: 'New Link', href: '/', enabled: true }])
  const removeLink = (i: number) => setLinks(ls => ls.filter((_, idx) => idx !== i))

  const handleTypeChange = (i: number, typLabel: string) => {
    const preset = PAGE_TYPES.find(p => p.label === typLabel)
    if (preset && preset.href !== '') {
      setLinks(ls => ls.map((l, idx) => idx === i ? { ...l, href: preset.href } : l))
    } else {
      setLinks(ls => ls.map((l, idx) => idx === i ? { ...l, href: '' } : l))
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Footer Settings</h1>

      {/* Brand Tagline */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Brand Tagline</h2>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tagline (shown under logo)</label>
          <textarea
            value={brand.tagline}
            onChange={e => setBrand({ tagline: e.target.value })}
            rows={3}
            placeholder="Empowering artisans and small businesses…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
          />
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

      {/* Quick Links — with type dropdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Quick Links</h2>
          <button onClick={addLink}
            className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <Plus size={13} /> Add Link
          </button>
        </div>

        {/* Column labels */}
        <div className="grid grid-cols-12 gap-2 px-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <div className="col-span-3">Label</div>
          <div className="col-span-4">Type</div>
          <div className="col-span-3">URL</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1" />
        </div>

        <div className="space-y-2">
          {links.map((link, i) => {
            const currentType = getType(link.href)
            const isCustom = currentType === 'Custom URL'
            return (
              <div key={i} className={`grid grid-cols-12 gap-2 items-center p-3 rounded-lg border ${link.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50'}`}>
                {/* Label */}
                <div className="col-span-3">
                  <input
                    type="text"
                    value={link.label}
                    onChange={e => setLinks(ls => ls.map((l, idx) => idx === i ? { ...l, label: e.target.value } : l))}
                    placeholder="Link label"
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900"
                  />
                </div>

                {/* Type dropdown */}
                <div className="col-span-4">
                  <select
                    value={currentType}
                    onChange={e => handleTypeChange(i, e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-gray-900"
                  >
                    {PAGE_TYPES.map(p => (
                      <option key={p.label} value={p.label}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {/* URL — readonly for presets, editable for custom */}
                <div className="col-span-3">
                  {isCustom ? (
                    <input
                      type="text"
                      value={link.href}
                      onChange={e => setLinks(ls => ls.map((l, idx) => idx === i ? { ...l, href: e.target.value } : l))}
                      placeholder="/custom-path"
                      className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900"
                    />
                  ) : (
                    <span className="block px-2 py-1.5 text-xs font-mono text-gray-500 bg-gray-50 border border-gray-100 rounded-lg truncate">
                      {link.href}
                    </span>
                  )}
                </div>

                {/* Toggle */}
                <div className="col-span-1 flex justify-center">
                  <button
                    onClick={() => setLinks(ls => ls.map((l, idx) => idx === i ? { ...l, enabled: !l.enabled } : l))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${link.enabled ? 'bg-gray-900' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${link.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Delete */}
                <div className="col-span-1 flex justify-end">
                  <button onClick={() => removeLink(i)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
          {links.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">No links yet — click Add Link</p>
          )}
        </div>

        <SaveBtn onClick={() => save('footer_links', links)} saving={update.isPending} saved={!!saved.footer_links} error={errors.footer_links ?? null} />
      </div>

      {/* Copyright / Legal — with type dropdowns for URLs */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Copyright & Legal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Copyright Text" value={bottom.copyright_text}
            onChange={v => setBottom(b => ({ ...b, copyright_text: v }))}
            placeholder="© 2024 Festecart. All rights reserved." />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Privacy Policy Page</label>
            <select
              value={bottom.privacy_policy_url}
              onChange={e => setBottom(b => ({ ...b, privacy_policy_url: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="/privacy">Privacy Policy (/privacy)</option>
              <option value="/privacy-policy">Privacy Policy (/privacy-policy)</option>
              <option value="">Custom…</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Terms of Service Page</label>
            <select
              value={bottom.terms_url}
              onChange={e => setBottom(b => ({ ...b, terms_url: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900"
            >
              <option value="/terms">Terms of Service (/terms)</option>
              <option value="/terms-of-service">Terms of Service (/terms-of-service)</option>
              <option value="">Custom…</option>
            </select>
          </div>
        </div>
        <SaveBtn onClick={() => save('footer_bottom', bottom)} saving={update.isPending} saved={!!saved.footer_bottom} error={errors.footer_bottom ?? null} />
      </div>
    </div>
  )
}
