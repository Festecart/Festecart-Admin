import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { X, Plus, Loader2, ChevronDown } from 'lucide-react'

// ── States per country ────────────────────────────────────────────
const STATES_BY_COUNTRY: Record<string, string[]> = {
  'India': [
    'Andaman & Nicobar Islands','Andhra Pradesh','Arunachal Pradesh','Assam','Bihar',
    'Chandigarh','Chhattisgarh','Dadra & Nagar Haveli','Daman & Diu','Delhi',
    'Goa','Gujarat','Haryana','Himachal Pradesh','Jammu & Kashmir','Jharkhand',
    'Karnataka','Kerala','Ladakh','Lakshadweep','Madhya Pradesh','Maharashtra',
    'Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Puducherry','Punjab',
    'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh',
    'Uttarakhand','West Bengal',
  ],
  'United States': [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
    'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
    'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
    'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
    'Wisconsin','Wyoming','Washington D.C.',
  ],
  'United Kingdom': [
    'England','Scotland','Wales','Northern Ireland',
    'London','South East','South West','East of England',
    'West Midlands','East Midlands','Yorkshire and the Humber',
    'North West','North East',
  ],
  'Australia': [
    'New South Wales','Victoria','Queensland','Western Australia',
    'South Australia','Tasmania','Australian Capital Territory',
    'Northern Territory',
  ],
  'Canada': [
    'Alberta','British Columbia','Manitoba','New Brunswick',
    'Newfoundland and Labrador','Northwest Territories','Nova Scotia',
    'Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon',
  ],
}

const COUNTRIES = [
  'India', 'United States', 'United Kingdom', 'Australia', 'Canada', 'Rest of the World',
]

type PlaceType = 'state' | 'city' | 'pincode'
type PincodeMode = 'manual' | 'bulk'
type ProductType = '' | 'category' | 'product_group' | 'specific'

interface ZonePlace {
  id: string
  country: string
  placeType: PlaceType
  values: string[]
}

// ── Places Modal ──────────────────────────────────────────────────
function PlacesModal({ place, onClose, onSave }: {
  place: ZonePlace
  onClose: () => void
  onSave: (p: ZonePlace) => void
}) {
  const [placeType, setPlaceType] = useState<PlaceType>(place.placeType)
  const [selectedStates, setSelectedStates] = useState<string[]>(
    place.placeType === 'state' ? place.values : []
  )
  const [stateSearch, setStateSearch] = useState('')
  const [cityInput, setCityInput] = useState(
    place.placeType === 'city' ? place.values.join(', ') : ''
  )
  const [pincodeMode, setPincodeMode] = useState<PincodeMode>('manual')
  const [manualPincodes, setManualPincodes] = useState<string[]>(
    place.placeType === 'pincode' && place.values.length ? place.values : ['']
  )

  const stateList = STATES_BY_COUNTRY[place.country] ?? []
  const hasStates = stateList.length > 0

  const filteredStates = stateList.filter(s =>
    s.toLowerCase().includes(stateSearch.toLowerCase())
  )

  const toggleState = (s: string) =>
    setSelectedStates(v => v.includes(s) ? v.filter(x => x !== s) : [...v, s])

  const handleSubmit = () => {
    if (placeType === 'state') {
      onSave({ ...place, placeType, values: selectedStates })
    } else if (placeType === 'city') {
      onSave({ ...place, placeType, values: cityInput.split(',').map(s => s.trim()).filter(Boolean) })
    } else {
      onSave({ ...place, placeType, values: manualPincodes.filter(s => s.trim() !== '') })
    }
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-12 bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-base">Places in {place.country}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {/* Type radio — only show State if country has states */}
          <div className="flex gap-8">
            {(hasStates ? ['state', 'city', 'pincode'] : ['city', 'pincode']).map(t => (
              <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`placetype-${place.id}`}
                  checked={placeType === t}
                  onChange={() => setPlaceType(t as PlaceType)}
                  className="accent-gray-900 w-4 h-4"
                />
                {t === 'pincode' ? 'Zipcode/Pincode' : t.charAt(0).toUpperCase() + t.slice(1)}
              </label>
            ))}
          </div>

          {/* State picker */}
          {placeType === 'state' && hasStates && (
            <div className="space-y-2">
              <input
                type="text"
                value={stateSearch}
                onChange={e => setStateSearch(e.target.value)}
                placeholder={`Search ${place.country} state…`}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                autoFocus
              />
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                {filteredStates.length > 0 ? filteredStates.map(s => (
                  <div
                    key={s}
                    onClick={() => toggleState(s)}
                    className={`px-4 py-2.5 text-sm cursor-pointer border-b border-gray-100 last:border-0 transition-colors
                      ${selectedStates.includes(s)
                        ? 'bg-gray-900 text-white'
                        : 'hover:bg-gray-50 text-gray-800'}`}
                  >
                    {s}
                  </div>
                )) : (
                  <p className="px-4 py-3 text-sm text-gray-400">No states found</p>
                )}
              </div>
              {selectedStates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedStates.map(v => (
                    <span key={v} className="flex items-center gap-1 bg-gray-100 text-xs px-2.5 py-1 rounded-full text-gray-700">
                      {v}
                      <button onClick={() => toggleState(v)} className="text-gray-400 hover:text-gray-700 ml-0.5">
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* City input */}
          {placeType === 'city' && (
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">Enter city names (comma separated)</label>
              <input
                type="text"
                value={cityInput}
                onChange={e => setCityInput(e.target.value)}
                placeholder="e.g. New York, Los Angeles, Chicago"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                autoFocus
              />
            </div>
          )}

          {/* Pincode/Zipcode input */}
          {placeType === 'pincode' && (
            <div className="space-y-4">
              <div className="flex gap-8">
                {(['manual', 'bulk'] as PincodeMode[]).map(m => (
                  <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name={`pmode-${place.id}`}
                      checked={pincodeMode === m}
                      onChange={() => setPincodeMode(m)}
                      className="accent-gray-900 w-4 h-4"
                    />
                    {m === 'manual' ? 'Manual' : 'Bulk Upload'}
                  </label>
                ))}
              </div>

              {pincodeMode === 'manual' ? (
                <div className="space-y-3">
                  {manualPincodes.map((pin, idx) => (
                    <div key={idx} className="flex gap-3 items-end">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Pincode</label>
                        <input
                          type="text"
                          value={pin}
                          onChange={e => setManualPincodes(p => p.map((x, i) => i === idx ? e.target.value : x))}
                          className="w-44 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
                        />
                      </div>
                      <button
                        onClick={() => setManualPincodes(p => p.filter((_, i) => i !== idx))}
                        className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 mb-0.5"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  <hr className="border-gray-100" />
                  <div className="flex justify-between">
                    <button onClick={() => setManualPincodes(p => [...p, ''])}
                      className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700">
                      Add More
                    </button>
                    <button onClick={handleSubmit}
                      className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700">
                      Submit
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg p-10 cursor-pointer hover:bg-gray-50 text-sm text-gray-500 bg-gray-50/50">
                    <input type="file" accept=".csv" className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => {
                          const text = ev.target?.result as string
                          const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
                          // Support both: plain pincodes OR Country,Pincode CSV
                          const parsed: string[] = []
                          lines.forEach((line, idx) => {
                            if (idx === 0 && line.toLowerCase().includes('pincode')) return // skip header
                            const cols = line.split(',').map(c => c.trim())
                            // Country,Pincode format
                            const pin = cols.length >= 2 ? cols[1] : cols[0]
                            if (pin && pin.length > 0) parsed.push(pin)
                          })
                          setManualPincodes(parsed.length ? parsed : [''])
                          setPincodeMode('manual')
                        }
                        reader.readAsText(file)
                      }} />
                    Click here to upload the CSV file
                  </label>
                  <a
                    href={`data:text/csv;charset=utf-8,Country,Pincode\nIndia,560001\nIndia,560002\nIndia,560003`}
                    download="sample_pincodes.csv"
                    className="block text-center text-xs text-gray-500 hover:underline"
                  >
                    Download sample CSV
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {placeType !== 'pincode' && (
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Save</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Product Type dropdown ─────────────────────────────────────────
function ProductTypeDropdown({ value, onChange }: { value: ProductType; onChange: (v: ProductType) => void }) {
  return (
    <div className="relative w-64">
      <select
        value={value}
        onChange={e => onChange(e.target.value as ProductType)}
        className="w-full appearance-none px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 pr-8 cursor-pointer"
      >
        <option value="">— Select —</option>
        <option value="category">Category</option>
        <option value="product_group">Product Group</option>
        <option value="specific">Specific Products</option>
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}

// ── Product search ────────────────────────────────────────────────
function ProductSearch({ label, placeholder, queryFn, selected, onAdd, onRemove }: {
  label: string
  placeholder: string
  queryFn: (q: string) => Promise<{ id: string; name: string }[]>
  selected: { id: string; name: string }[]
  onAdd: (item: { id: string; name: string }) => void
  onRemove: (id: string) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)

  useEffect(() => {
    if (!q.trim()) { setResults([]); setSearchErr(null); return }
    const t = setTimeout(async () => {
      setLoading(true); setSearchErr(null)
      try {
        const data = await queryFn(q)
        setResults(data)
        if (data.length === 0) setSearchErr(null)
      } catch (e) {
        setSearchErr((e as { message?: string })?.message ?? 'Search failed')
        setResults([])
      }
      setLoading(false)
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input type="text" value={q} onChange={e => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        {loading && <Loader2 size={13} className="absolute right-3 top-3 animate-spin text-gray-400" />}
        {searchErr && <p className="mt-1 text-xs text-red-500">{searchErr}</p>}
        {results.length > 0 && (
          <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
            {results.map(r => (
              <button key={r.id} onClick={() => { onAdd(r); setQ(''); setResults([]) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {selected.map(s => (
            <span key={s.id} className="flex items-center gap-1 bg-gray-100 text-xs px-2.5 py-1 rounded-full text-gray-700">
              {s.name}
              <button onClick={() => onRemove(s.id)} className="text-gray-400 hover:text-gray-700 ml-0.5"><X size={10} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── SQL Setup Banner ──────────────────────────────────────────────
function SetupBanner() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  const sql = `-- Run this in Supabase SQL Editor
create table if not exists public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  places jsonb default '[]',
  product_type text,
  selected_products jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.shipping_methods (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid references public.shipping_zones(id) on delete cascade,
  name text not null,
  delivery_min int default 1,
  delivery_max int default 2,
  time_unit text default 'Business Days',
  condition_type text,
  price_min numeric,
  price_max numeric,
  weight_min numeric,
  weight_max numeric,
  free_shipping boolean default false,
  charge numeric default 0,
  charge_type text default 'flat',
  allow_free_offer_code boolean default false,
  created_at timestamptz default now()
);`

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-800">⚠ Database setup required</p>
        <button onClick={() => setDismissed(true)} className="text-amber-500 hover:text-amber-700"><X size={14} /></button>
      </div>
      <p className="text-xs text-amber-700">The <code className="bg-amber-100 px-1 rounded">shipping_zones</code> and <code className="bg-amber-100 px-1 rounded">shipping_methods</code> tables don't exist yet. Run the following SQL in your <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline font-medium">Supabase SQL Editor</a>:</p>
      <pre className="text-xs bg-gray-900 text-green-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{sql}</pre>
    </div>
  )
}

// ── Main Form ─────────────────────────────────────────────────────
export default function ShippingZoneForm() {
  const navigate = useNavigate()
  const { zoneId } = useParams<{ zoneId: string }>()
  const isEdit = !!zoneId
  const qc = useQueryClient()

  const [tablesMissing, setTablesMissing] = useState(false)
  const [zoneName, setZoneName] = useState('')
  const [countrySearch, setCountrySearch] = useState('')
  const [showCountryDrop, setShowCountryDrop] = useState(false)
  const [places, setPlaces] = useState<ZonePlace[]>([])
  const [editingPlace, setEditingPlace] = useState<ZonePlace | null>(null)
  const [productType, setProductType] = useState<ProductType>('')
  const [selectedProducts, setSelectedProducts] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const countryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setShowCountryDrop(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useQuery({
    queryKey: ['shipping-zone-edit', zoneId],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase.from('shipping_zones').select('*').eq('id', zoneId).single()
      if (error?.message?.includes('does not exist') || error?.message?.includes('schema cache')) {
        setTablesMissing(true); return null
      }
      if (data) {
        setZoneName(data.name ?? '')
        setPlaces(data.places ?? [])
        setProductType(data.product_type ?? '')
        setSelectedProducts(data.selected_products ?? [])
      }
      return data
    },
  })

  const addCountry = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (places.find(p => p.country.toLowerCase() === trimmed.toLowerCase())) {
      setCountrySearch(''); setShowCountryDrop(false); return
    }
    const newPlace: ZonePlace = { id: crypto.randomUUID(), country: trimmed, placeType: 'state', values: [] }
    setPlaces(p => [...p, newPlace])
    setEditingPlace(newPlace)
    setCountrySearch('')
    setShowCountryDrop(false)
  }

  const updatePlace = (updated: ZonePlace) => setPlaces(p => p.map(pl => pl.id === updated.id ? updated : pl))
  const removePlace = (id: string) => setPlaces(p => p.filter(pl => pl.id !== id))

  const placeSummary = (p: ZonePlace): string => {
    if (!p.values?.length) return `All over "${p.country}"`
    if (p.values.length <= 2) return p.values.join(', ')
    return `${p.values.slice(0, 2).join(', ')} +${p.values.length - 2} more`
  }

  const filteredCountries = COUNTRIES.filter(c =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  )

  const searchCategories = async (q: string) => {
    const { data } = await supabase.from('categories').select('id, name').ilike('name', `%${q}%`).limit(8)
    return (data ?? []) as { id: string; name: string }[]
  }
  const searchProducts = async (q: string) => {
    const { data } = await supabase.from('products').select('id, name').eq('status', 'published').ilike('name', `%${q}%`).limit(8)
    return (data ?? []) as { id: string; name: string }[]
  }

  const handleSave = async () => {
    if (!zoneName.trim()) { setError('Zone name is required'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        name: zoneName.trim(),
        location: places.map(p => p.country).join(', ') || null,
        places,
        product_type: productType || null,
        selected_products: selectedProducts.length ? selectedProducts : null,
      }
      if (isEdit) {
        const { error: e } = await supabase.from('shipping_zones').update(payload).eq('id', zoneId)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('shipping_zones').insert(payload)
        if (e?.message?.includes('does not exist') || e?.message?.includes('schema cache')) {
          setTablesMissing(true); throw new Error('Table not found — see setup instructions above')
        }
        if (e) throw e
      }
      qc.invalidateQueries({ queryKey: ['shipping-zones'] })
      navigate('/shipping-zones')
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">
              <Link to="/" className="hover:underline">Dashboard</Link>{' / '}
              <Link to="/shipping-zones" className="hover:underline">shippingZone</Link>{' / '}
              {isEdit ? 'Edit' : 'Add'} Shipping Zone
            </p>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit' : 'Add'} Shipping Zone</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/shipping-zones')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">
              {saving && <Loader2 size={13} className="animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {tablesMissing && <SetupBanner />}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</p>}

        {/* Zone Name */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Zone Name</label>
          <input type="text" value={zoneName} onChange={e => setZoneName(e.target.value)}
            placeholder="Zone Name"
            className="w-full max-w-lg px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>

        {/* Zones */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Zones</h2>
          <div ref={countryRef} className="relative max-w-xs">
            <input type="text" value={countrySearch}
              onChange={e => { setCountrySearch(e.target.value); setShowCountryDrop(true) }}
              onFocus={() => setShowCountryDrop(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' && countrySearch.trim()) addCountry(countrySearch)
                if (e.key === 'Escape') setShowCountryDrop(false)
              }}
              placeholder="Type and choose the country"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            {showCountryDrop && (
              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                {(countrySearch ? filteredCountries : COUNTRIES).map(c => (
                  <button key={c} onMouseDown={e => e.preventDefault()} onClick={() => addCountry(c)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    {c}
                  </button>
                ))}
                {countrySearch && !COUNTRIES.find(c => c.toLowerCase() === countrySearch.toLowerCase()) && (
                  <button onMouseDown={e => e.preventDefault()} onClick={() => addCountry(countrySearch)}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100">
                    <Plus size={12} /> Add "{countrySearch}"
                  </button>
                )}
              </div>
            )}
          </div>

          {places.length > 0 && (
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Country</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Places</th>
                  <th className="w-8 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {places.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.country}</td>
                    <td className="px-4 py-3 text-gray-600 text-sm">
                      <span>{placeSummary(p)}</span>
                      <button onClick={() => setEditingPlace({ ...p })}
                        className="ml-3 text-blue-600 hover:underline text-xs font-medium">
                        Specific Places
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removePlace(p.id)} className="text-red-400 hover:text-red-600 p-1">
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Products */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Products available in this zone</h2>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Type</label>
            <ProductTypeDropdown value={productType} onChange={v => { setProductType(v); setSelectedProducts([]) }} />
          </div>
          {productType === 'category' && (
            <ProductSearch label="Select Category" placeholder="Type and search"
              queryFn={searchCategories} selected={selectedProducts}
              onAdd={item => setSelectedProducts(p => p.find(x => x.id === item.id) ? p : [...p, item])}
              onRemove={id => setSelectedProducts(p => p.filter(x => x.id !== id))} />
          )}
          {productType === 'product_group' && (
            <ProductSearch label="Select Product Group" placeholder="Type and search"
              queryFn={async q => {
                // Try product_groups table, fall back to empty if it doesn't exist
                const { data, error } = await supabase
                  .from('product_groups')
                  .select('id, name')
                  .ilike('name', `%${q}%`)
                  .limit(8)
                if (error) throw new Error('product_groups table not found — create it or use Category/Specific Products instead')
                return (data ?? []) as { id: string; name: string }[]
              }}
              selected={selectedProducts}
              onAdd={item => setSelectedProducts(p => p.find(x => x.id === item.id) ? p : [...p, item])}
              onRemove={id => setSelectedProducts(p => p.filter(x => x.id !== id))} />
          )}
          {productType === 'specific' && (
            <ProductSearch label="Select Products" placeholder="Type and search"
              queryFn={searchProducts} selected={selectedProducts}
              onAdd={item => setSelectedProducts(p => p.find(x => x.id === item.id) ? p : [...p, item])}
              onRemove={id => setSelectedProducts(p => p.filter(x => x.id !== id))} />
          )}
        </div>
      </div>

      {editingPlace && (
        <PlacesModal
          place={editingPlace}
          onClose={() => setEditingPlace(null)}
          onSave={updated => { updatePlace(updated); setEditingPlace(null) }}
        />
      )}
    </div>
  )
}
