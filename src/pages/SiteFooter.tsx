import { useState, useEffect } from 'react'
import { useSiteConfig, useUpdateSiteConfig } from '@/hooks/useSiteConfig'
import { Plus, Trash2, Check, Save, Loader2 } from 'lucide-react'

interface FooterContact { address: string; phone: string; email: string }
interface FooterSocial { facebook: string; instagram: string; twitter: string; whatsapp: string }
interface FooterLink { label: string; href: string; enabled: boolean }
interface FooterBottom { copyright_text: string; privacy_policy_url: string; terms_url: string }
interface FooterBrand { tagline: string }

function SaveBtn({ onClick, saving, saved, error }: { onClick: () => void; saving: boolean; saved: boolean; error: string | null }) {
  return (
    <div className="space-y-1">
      <button
        onClick={onClick}
        disabled={saving}
        className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : <Save size={13} />}
        {saved ? 'Saved' : 'Save'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default function SiteFooter() {
  const update = useUpdateSiteConfig()

  const { data: contactRaw } = useSiteConfig('footer_contact')
  const { data: socialRaw } = useSiteConfig('footer_social')
  const { data: linksRaw } = useSiteConfig('footer_links')
  const { data: bottomRaw } = useSiteConfig('footer_bottom')
  const { data: brandRaw } = useSiteConfig('footer_brand')

  const [contact, setContact] = useState<FooterContact>({ address: '', phone: '', email: '' })
  const [social, setSocial] = useState<FooterSocial>({ facebook: '', instagram: '', twitter: '', whatsapp: '' })
  const [links, setLinks] = useState<FooterLink[]>([])
  const [bottom, setBottom] = useState<FooterBottom>({ copyright_text: '', privacy_policy_url: '', terms_url: '' })
  const [brand, setBrand] = useState<FooterBrand>({ tagline: '' })

  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  useEffect(() => { if (contactRaw) setContact(contactRaw as FooterContact) }, [contactRaw])
  useEffect(() => { if (socialRaw) setSocial(socialRaw as FooterSocial) }, [socialRaw])
  useEffect(() => { if (linksRaw) setLinks(linksRaw as FooterLink[]) }, [linksRaw])
  useEffect(() => { if (bottomRaw) setBottom(bottomRaw as FooterBottom) }, [bottomRaw])
  useEffect(() => { if (brandRaw) setBrand(brandRaw as FooterBrand) }, [brandRaw])

  const save = async (key: string, value: unknown) => {
    setErrors(e => ({ ...e, [key]: null }))
    try {
      await update.mutateAsync({ key, value })
      setSaved(s => ({ ...s, [key]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 2000)
    } catch (e) {
      setErrors(prev => ({ ...prev, [key]: e instanceof Error ? e.message : 'Save failed' }))
    }
  }

  const addLink = () => setLinks(ls => [...ls, { label: 'New Link', href: '/', enabled: true }])
  const removeLink = (i: number) => setLinks(ls => ls.filter((_, idx) => idx !== i))
  const updateLink = (i: number, field: keyof FooterLink, val: string | boolean) =>
    setLinks(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: val } : l))

  const Field = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Footer Settings</h1>

      {/* Brand Tagline */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Brand Tagline</h2>
        <Field label="Tagline (under logo)" value={brand.tagline} onChange={v => setBrand({ tagline: v })} placeholder="Empowering artisans…" />
        <SaveBtn onClick={() => save('footer_brand', brand)} saving={update.isPending} saved={!!saved.footer_brand} error={errors.footer_brand ?? null} />
      </div>

      {/* Contact Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Contact Info</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Address" value={contact.address} onChange={v => setContact(c => ({ ...c, address: v }))} placeholder="123 Cultural Avenue…" />
          <Field label="Phone" value={contact.phone} onChange={v => setContact(c => ({ ...c, phone: v }))} placeholder="+91 98765 43210" />
          <Field label="Email" value={contact.email} onChange={v => setContact(c => ({ ...c, email: v }))} placeholder="hello@festecart.com" />
        </div>
        <SaveBtn onClick={() => save('footer_contact', contact)} saving={update.isPending} saved={!!saved.footer_contact} error={errors.footer_contact ?? null} />
      </div>

      {/* Social Links */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Social Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Facebook URL" value={social.facebook} onChange={v => setSocial(s => ({ ...s, facebook: v }))} placeholder="https://facebook.com/…" />
          <Field label="Instagram URL" value={social.instagram} onChange={v => setSocial(s => ({ ...s, instagram: v }))} placeholder="https://instagram.com/…" />
          <Field label="Twitter / X URL" value={social.twitter} onChange={v => setSocial(s => ({ ...s, twitter: v }))} placeholder="https://twitter.com/…" />
          <Field label="WhatsApp URL" value={social.whatsapp} onChange={v => setSocial(s => ({ ...s, whatsapp: v }))} placeholder="https://wa.me/91…" />
        </div>
        <SaveBtn onClick={() => save('footer_social', social)} saving={update.isPending} saved={!!saved.footer_social} error={errors.footer_social ?? null} />
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Quick Links</h2>
          <button onClick={addLink} className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            <Plus size={13} /> Add Link
          </button>
        </div>
        <div className="space-y-2">
          {links.map((link, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200">
              <input
                type="text"
                value={link.label}
                onChange={e => updateLink(i, 'label', e.target.value)}
                placeholder="Label"
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg w-36 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <input
                type="text"
                value={link.href}
                onChange={e => updateLink(i, 'href', e.target.value)}
                placeholder="/path"
                className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg flex-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
              <button
                onClick={() => updateLink(i, 'enabled', !link.enabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${link.enabled ? 'bg-gray-900' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${link.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
              <span className="text-xs text-gray-400 w-12">{link.enabled ? 'On' : 'Off'}</span>
              <button onClick={() => removeLink(i)} className="p-1 text-gray-400 hover:text-red-600 rounded">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <SaveBtn onClick={() => save('footer_links', links)} saving={update.isPending} saved={!!saved.footer_links} error={errors.footer_links ?? null} />
      </div>

      {/* Copyright / Legal */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Copyright & Legal</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Copyright Text" value={bottom.copyright_text} onChange={v => setBottom(b => ({ ...b, copyright_text: v }))} placeholder="© 2024 Festecart. All rights reserved." />
          <Field label="Privacy Policy URL" value={bottom.privacy_policy_url} onChange={v => setBottom(b => ({ ...b, privacy_policy_url: v }))} placeholder="/privacy" />
          <Field label="Terms URL" value={bottom.terms_url} onChange={v => setBottom(b => ({ ...b, terms_url: v }))} placeholder="/terms" />
        </div>
        <SaveBtn onClick={() => save('footer_bottom', bottom)} saving={update.isPending} saved={!!saved.footer_bottom} error={errors.footer_bottom ?? null} />
      </div>
    </div>
  )
}
