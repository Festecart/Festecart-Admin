import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, Timestamp,
} from '@/lib/firebase'
import { X, Plus, Loader2 } from 'lucide-react'
import CategoryTreeSelect from '@/components/CategoryTreeSelect'

// ── States per country ───────────────────────────────────────────
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
  'United States': ['Alabama','Alaska','Arizona','Arkansas','California','Colorado',
    'Connecticut','Delaware','Florida','Georgia','Hawaii','Idaho','Illinois',
    'Indiana','Iowa','Kansas','Kentucky','Louisiana','Maine','Maryland',
    'Massachusetts','Michigan','Minnesota','Mississippi','Missouri','Montana',
    'Nebraska','Nevada','New Hampshire','New Jersey','New Mexico','New York',
    'North Carolina','North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania',
    'Rhode Island','South Carolina','South Dakota','Tennessee','Texas','Utah',
    'Vermont','Virginia','Washington','West Virginia','Wisconsin','Wyoming',
  ],
}

const COUNTRIES = ['India','United States','United Kingdom','Australia','Canada','Rest of the World']

type PlaceType = 'state' | 'city' | 'pincode'

interface ZonePlace { id: string; country: string; placeType: PlaceType; values: string[] }

interface ProductItem { id: string; name: string; price: number; images: string[] }

// ── Places Modal ─────────────────────────────────────────────────
function PlacesModal({ place, onClose, onSave }: {
  place: ZonePlace; onClose: () => void; onSave: (p: ZonePlace) => void
}) {
  const [placeType,      setPlaceType]      = useState<PlaceType>(place.placeType)
  const [selectedStates, setSelectedStates] = useState<string[]>(place.placeType === 'state' ? place.values : [])
  const [stateSearch,    setStateSearch]    = useState('')
  const [cityInput,      setCityInput]      = useState(place.placeType === 'city' ? place.values.join(', ') : '')
  const [manualPincodes, setManualPincodes] = useState<string[]>(
    place.placeType === 'pincode' && place.values.length ? place.values : ['']
  )
  // Bulk upload state (all three modes)
  const [inputMode,     setInputMode]     = useState<'manual' | 'bulk'>('manual')
  const [bulkText,      setBulkText]      = useState('')
  const [bulkError,     setBulkError]     = useState<string | null>(null)
  const [bulkPreview,   setBulkPreview]   = useState<{ value: string; country: string; status: 'valid' | 'invalid' }[] | null>(null)
  const [bulkAction,    setBulkAction]    = useState<'add' | 'delete'>('add')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseBulkCSV = (text: string, mode: PlaceType): string[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) return []
    const firstLine = lines[0].toLowerCase()
    const hasHeader = firstLine.includes('pincode') || firstLine.includes('country') ||
                      firstLine.includes('state') || firstLine.includes('city')
    const dataLines = hasHeader ? lines.slice(1) : lines
    const result: string[] = []
    for (const line of dataLines) {
      const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''))
      if (mode === 'city') {
        const val = parts.length >= 3 ? parts[2] : parts[parts.length - 1]
        if (val) result.push(val)
      } else if (mode === 'pincode') {
        const val = parts.length >= 2 ? parts[parts.length - 1] : parts[0]
        if (val) result.push(val)
      } else {
        const val = parts[parts.length - 1]
        if (val) result.push(val)
      }
    }
    return [...new Set(result)]
  }

  const handleBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setBulkText(ev.target?.result as string ?? '')
    reader.readAsText(file)
    e.target.value = ''
  }

  const previewBulk = () => {
    setBulkError(null)
    const values = parseBulkCSV(bulkText, placeType)
    if (!values.length) { setBulkError('No valid entries found in the file'); return }
    const preview = values.map(v => {
      let status: 'valid' | 'invalid' = 'valid'
      if (placeType === 'pincode' && !/^\d{5,10}$/.test(v)) status = 'invalid'
      if (placeType === 'state' && stateList.length > 0 && !stateList.includes(v)) status = 'invalid'
      return { value: v, country: place.country, status }
    })
    setBulkPreview(preview)
  }

  const confirmBulk = () => {
    if (!bulkPreview) return
    const valid = bulkPreview.filter(p => p.status === 'valid').map(p => p.value)
    if (bulkAction === 'add') {
      if (placeType === 'state') setSelectedStates(prev => [...new Set([...prev, ...valid])])
      else if (placeType === 'city') {
        const existing = cityInput.trim()
        setCityInput(existing ? `${existing}, ${valid.join(', ')}` : valid.join(', '))
      } else setManualPincodes(prev => [...new Set([...prev.filter(p => p.trim()), ...valid])])
    } else {
      // delete
      if (placeType === 'state') setSelectedStates(prev => prev.filter(s => !valid.includes(s)))
      else if (placeType === 'city') {
        const existing = cityInput.split(',').map(s => s.trim()).filter(Boolean)
        setCityInput(existing.filter(c => !valid.includes(c)).join(', '))
      } else setManualPincodes(prev => prev.filter(p => !valid.includes(p)))
    }
    setBulkPreview(null)
    setBulkText('')
    setBulkError(null)
  }

  const stateList     = STATES_BY_COUNTRY[place.country] ?? []
  const hasStates     = stateList.length > 0
  const filteredStates = stateList.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase()))
  const toggleState   = (s: string) =>
    setSelectedStates(v => v.includes(s) ? v.filter(x => x !== s) : [...v, s])

  const handleSubmit = () => {
    if (placeType === 'state')   onSave({ ...place, placeType, values: selectedStates })
    else if (placeType === 'city') onSave({ ...place, placeType, values: cityInput.split(',').map(s => s.trim()).filter(Boolean) })
    else                         onSave({ ...place, placeType, values: manualPincodes.filter(s => s.trim() !== '') })
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-12 bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-base">Places in {place.country}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 space-y-5">
          {/* Type radio */}
          <div className="flex gap-8">
            {(hasStates ? ['state','city','pincode'] : ['city','pincode']).map(t => (
              <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={placeType === t} onChange={() => { setPlaceType(t as PlaceType); setInputMode('manual'); setBulkError(null) }} className="accent-gray-900 w-4 h-4" />
                {t === 'pincode' ? 'Zipcode/Pincode' : t.charAt(0).toUpperCase() + t.slice(1)}
              </label>
            ))}
          </div>

          {/* Manual / Bulk toggle */}
          <div className="flex gap-6">
            {(['manual','bulk'] as const).map(m => (
              <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={inputMode === m} onChange={() => { setInputMode(m); setBulkError(null) }} className="accent-gray-900 w-4 h-4" />
                {m === 'manual' ? 'Manual' : 'Bulk Upload'}
              </label>
            ))}
          </div>

          {/* Bulk upload UI */}
          {inputMode === 'bulk' && !bulkPreview && (
            <div className="space-y-3">
              {/* Add / Delete toggle */}
              <div className="flex gap-3">
                {(['add','delete'] as const).map(a => (
                  <button key={a} onClick={() => setBulkAction(a)}
                    className={`px-4 py-1.5 text-sm rounded-lg border font-medium transition-colors ${bulkAction === a ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    Bulk {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-500 hover:bg-gray-50 transition-colors">
                <p className="text-sm text-gray-500">Click here to upload the CSV file</p>
                <p className="text-xs text-gray-400 mt-1">Header row auto-detected and skipped</p>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleBulkFile} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Or paste values directly</label>
                <textarea value={bulkText} onChange={e => setBulkText(e.target.value)} rows={4}
                  placeholder={placeType === 'state' ? 'Karnataka\nTamil Nadu\nGoa' : placeType === 'city' ? 'Country,State,City\nIndia,Karnataka,Bengaluru' : 'Country,Pincode\nIndia,560001\nIndia,560002'}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none font-mono" />
              </div>
              {bulkError && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{bulkError}</p>}
              <div className="flex items-center justify-between">
                <button onClick={() => {
                  const sample = placeType === 'state'
                    ? 'State\nKarnataka\nTamil Nadu\nGoa'
                    : placeType === 'city'
                    ? 'Country,State,City\nIndia,Karnataka,Bengaluru\nIndia,Karnataka,Mangalore\nIndia,Tamilnadu,Chennai'
                    : 'Country,Pincode\nIndia,560001\nIndia,560002\nIndia,560003'
                  const link = document.createElement('a')
                  link.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(sample)
                  link.download = `sample-${placeType}.csv`
                  link.click()
                }} className="text-xs text-gray-500 hover:text-gray-800 underline">Download sample CSV</button>
                <button onClick={previewBulk}
                  className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Preview</button>
              </div>
            </div>
          )}

          {/* Bulk preview table */}
          {inputMode === 'bulk' && bulkPreview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  {placeType === 'pincode' ? 'Pincodes' : placeType === 'city' ? 'Cities' : 'States'} of {place.country} – Preview
                </p>
                <button onClick={() => setBulkPreview(null)} className="text-xs text-gray-500 hover:text-gray-800 underline">← Back</button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-200 w-14">S.No.</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-200">Country</th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-200">
                        {placeType === 'pincode' ? 'Pincode/Zip code' : placeType === 'city' ? 'City' : 'State'}
                      </th>
                      <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 border-b border-gray-200">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {bulkPreview.map((row, i) => (
                      <tr key={i} className={row.status === 'invalid' ? 'bg-red-50' : ''}>
                        <td className="px-4 py-2 text-center text-gray-500">{i + 1}</td>
                        <td className="px-4 py-2 text-center text-gray-600">{row.country}</td>
                        <td className="px-4 py-2 text-center font-mono text-gray-800">{row.value}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`text-xs font-medium ${row.status === 'valid' ? 'text-green-600' : 'text-red-600'}`}>
                            {row.status === 'valid' ? 'Valid' : 'Invalid'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-3">
                  <button onClick={() => setBulkPreview(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                  <span className="text-xs text-gray-500">
                    {bulkPreview.filter(r => r.status === 'invalid').length === 0
                      ? 'No errors found !'
                      : `${bulkPreview.filter(r => r.status === 'invalid').length} error(s) — invalid rows will be skipped`}
                  </span>
                </div>
                <button onClick={confirmBulk}
                  className={`px-4 py-2 text-white text-sm font-medium rounded-lg ${bulkAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-900 hover:bg-gray-800'}`}>
                  {bulkAction === 'delete' ? 'Confirm Delete' : 'Confirm Add'}
                </button>
              </div>
            </div>
          )}

          {/* Manual inputs */}
          {inputMode === 'manual' && placeType === 'state' && hasStates && (
            <div className="space-y-2">
              <input type="text" value={stateSearch} onChange={e => setStateSearch(e.target.value)}
                placeholder={`Search ${place.country} state…`} autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                {filteredStates.map(s => (
                  <div key={s} onClick={() => toggleState(s)}
                    className={`px-4 py-2.5 text-sm cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${selectedStates.includes(s) ? 'bg-gray-900 text-white' : 'hover:bg-gray-50 text-gray-800'}`}>
                    {s}
                  </div>
                ))}
                {filteredStates.length === 0 && <p className="px-4 py-3 text-sm text-gray-400">No states found</p>}
              </div>
              {selectedStates.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedStates.map(v => (
                    <span key={v} className="flex items-center gap-1 bg-gray-100 text-xs px-2.5 py-1 rounded-full text-gray-700">
                      {v}<button onClick={() => toggleState(v)} className="text-gray-400 hover:text-gray-700 ml-0.5"><X size={10} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {inputMode === 'manual' && placeType === 'city' && (
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">Enter city names (comma separated)</label>
              <input type="text" value={cityInput} onChange={e => setCityInput(e.target.value)}
                placeholder="e.g. Bengaluru, Mysuru, Mangaluru" autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            </div>
          )}

          {inputMode === 'manual' && placeType === 'pincode' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <button onClick={() => {
                  setManualPincodes(p => [...p, ''])
                  // scroll to bottom of list after adding
                  setTimeout(() => {
                    const container = document.getElementById('pincode-list')
                    if (container) container.scrollTop = container.scrollHeight
                  }, 50)
                }}
                  className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700">Add More</button>
                <button onClick={handleSubmit}
                  className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700">Submit</button>
              </div>
              <div id="pincode-list" className="space-y-2 max-h-64 overflow-y-auto">
                {manualPincodes.map((pin, idx) => (
                  <div key={idx} className="flex gap-3 items-end">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Pincode</label>
                      <input type="text" value={pin}
                        onChange={e => setManualPincodes(p => p.map((x, i) => i === idx ? e.target.value : x))}
                        autoFocus={idx === manualPincodes.length - 1 && idx > 0}
                        className="w-44 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                    </div>
                    <button onClick={() => setManualPincodes(p => p.filter((_, i) => i !== idx))}
                      className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700 mb-0.5">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {(placeType !== 'pincode' || inputMode === 'bulk') && (
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

// ── Main Form ────────────────────────────────────────────────────
export default function ShippingZoneForm() {
  const navigate = useNavigate()
  const { zoneId } = useParams<{ zoneId: string }>()
  const isEdit = !!zoneId
  const qc = useQueryClient()

  const [zoneName,          setZoneName]          = useState('')
  const [countrySearch,     setCountrySearch]     = useState('')
  const [showCountryDrop,   setShowCountryDrop]   = useState(false)
  const [places,            setPlaces]            = useState<ZonePlace[]>([])
  const [editingPlace,      setEditingPlace]      = useState<ZonePlace | null>(null)
  const [selectedProducts,  setSelectedProducts]  = useState<{ id: string; name: string }[]>([])
  const [selectionType,     setSelectionType]     = useState<'category' | 'specific'>('specific')
  const [selectedCatId,     setSelectedCatId]     = useState('')
  const [catProducts,       setCatProducts]       = useState<ProductItem[]>([])
  const [loadingCat,        setLoadingCat]        = useState(false)
  const [prodSearch,        setProdSearch]        = useState('')
  const [prodResults,       setProdResults]       = useState<ProductItem[]>([])
  const [searching,         setSearching]         = useState(false)
  const [saving,            setSaving]            = useState(false)
  const [error,             setError]             = useState<string | null>(null)
  const countryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setShowCountryDrop(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Load existing zone if editing
  useQuery({
    queryKey: ['shipping-zone-edit', zoneId],
    enabled: isEdit,
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'shipping_zones', zoneId!))
      if (snap.exists()) {
        const d = snap.data()
        setZoneName(d.name ?? '')
        setPlaces(d.places ?? [])
        setSelectedProducts(d.selected_products ?? [])
        if (d.product_type) setSelectionType(d.product_type as 'category' | 'specific')
      }
      return snap.data() ?? null
    },
  })

  // Categories dropdown
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'categories'), orderBy('name', 'asc')))
      return snap.docs.map(d => ({
        id: d.id,
        name: (d.data().name as string) ?? '',
        parent_id: (d.data().parent_id as string | null) ?? null,
        display_order: (d.data().display_order as number) ?? 0,
      }))
    },
  })

  // Category products
  const handleCategorySelect = async (catId: string) => {
    setSelectedCatId(catId); setCatProducts([])
    if (!catId) return
    setLoadingCat(true)
    const snap = await getDocs(query(collection(db, 'products'),
      where('status', '==', 'published'), where('category_id', '==', catId)))
    setCatProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductItem)))
    setLoadingCat(false)
  }

  // All published products (for specific selection)
  const { data: allProducts = [], isLoading: loadingAllProducts } = useQuery({
    queryKey: ['all-products-published'],
    queryFn: async () => {
      const snap = await getDocs(query(collection(db, 'products'), where('status', '==', 'published')))
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ProductItem))
    },
    enabled: selectionType === 'specific',
  })

  // Specific product search
  useEffect(() => {
    if (!prodSearch.trim()) { setProdResults([]); return }
    const t = setTimeout(async () => {
      setSearching(true)
      const snap = await getDocs(query(collection(db, 'products'), where('status', '==', 'published')))
      const q = prodSearch.toLowerCase()
      setProdResults(snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ProductItem))
        .filter(p => p.name.toLowerCase().includes(q) && !selectedProducts.find(s => s.id === p.id))
        .slice(0, 8))
      setSearching(false)
    }, 300)
    return () => clearTimeout(t)
  }, [prodSearch, selectedProducts])

  const toggleProduct = (p: { id: string; name: string }) =>
    setSelectedProducts(prev => prev.find(x => x.id === p.id) ? prev.filter(x => x.id !== p.id) : [...prev, { id: p.id, name: p.name }])
  const removeProduct = (id: string) => setSelectedProducts(prev => prev.filter(x => x.id !== id))
  const moveProduct   = (idx: number, dir: -1 | 1) => {
    const arr = [...selectedProducts]; const swap = idx + dir
    if (swap < 0 || swap >= arr.length) return
    ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
    setSelectedProducts(arr)
  }

  const addCountry = (name: string) => {
    const trimmed = name.trim(); if (!trimmed) return
    if (places.find(p => p.country.toLowerCase() === trimmed.toLowerCase())) { setCountrySearch(''); setShowCountryDrop(false); return }
    const newPlace: ZonePlace = { id: crypto.randomUUID(), country: trimmed, placeType: 'state', values: [] }
    setPlaces(p => [...p, newPlace])
    setEditingPlace(newPlace)
    setCountrySearch(''); setShowCountryDrop(false)
  }

  const placeSummary = (p: ZonePlace): string => {
    if (!p.values?.length) return `All over "${p.country}"`
    if (p.values.length <= 2) return p.values.join(', ')
    return `${p.values.slice(0, 2).join(', ')} +${p.values.length - 2} more`
  }

  const filteredCountries = COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()))

  const handleSave = async () => {
    if (!zoneName.trim()) { setError('Zone name is required'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        name: zoneName.trim(),
        location: places.map(p => p.country).join(', ') || null,
        places,
        product_type: selectedProducts.length ? selectionType : null,
        selected_products: selectedProducts.length ? selectedProducts : null,
        updated_at: Timestamp.now(),
      }
      if (isEdit) {
        await updateDoc(doc(db, 'shipping_zones', zoneId!), payload)
      } else {
        await addDoc(collection(db, 'shipping_zones'), { ...payload, created_at: Timestamp.now() })
      }
      qc.invalidateQueries({ queryKey: ['shipping-zones'] })
      navigate('/shipping-zones')
    } catch (e) { setError((e as { message?: string })?.message ?? 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">
              <Link to="/" className="hover:underline">Dashboard</Link>{' / '}
              <Link to="/shipping-zones" className="hover:underline">Shipping Zones</Link>{' / '}
              {isEdit ? 'Edit' : 'Add'} Shipping Zone
            </p>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit' : 'Add'} Shipping Zone</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/shipping-zones')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-60">
              {saving && <Loader2 size={13} className="animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-lg">{error}</p>}

        {/* Zone Name */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Zone Name</label>
          <input type="text" value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="Zone Name"
            className="w-full max-w-lg px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>

        {/* Zones */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Zones</h2>
          <div ref={countryRef} className="relative max-w-xs">
            <input type="text" value={countrySearch}
              onChange={e => { setCountrySearch(e.target.value); setShowCountryDrop(true) }}
              onFocus={() => setShowCountryDrop(true)}
              onKeyDown={e => { if (e.key === 'Enter' && countrySearch.trim()) addCountry(countrySearch); if (e.key === 'Escape') setShowCountryDrop(false) }}
              placeholder="Type and choose the country"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
            {showCountryDrop && (
              <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                {(countrySearch ? filteredCountries : COUNTRIES).map(c => (
                  <button key={c} onMouseDown={e => e.preventDefault()} onClick={() => addCountry(c)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">{c}</button>
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
                      <button onClick={() => setEditingPlace({ ...p })} className="ml-3 text-blue-600 hover:underline text-xs font-medium">Specific Places</button>
                      {p.placeType === 'pincode' && p.values.length > 0 && (
                        <button
                          onClick={() => {
                            const csv = `Country,Pincode\n${p.values.map(v => `${p.country},${v}`).join('\n')}`
                            const link = document.createElement('a')
                            link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
                            link.download = `pincodes-${p.country.toLowerCase().replace(/\s+/g, '-')}.csv`
                            link.click()
                          }}
                          className="ml-3 text-green-600 hover:underline text-xs font-medium"
                        >
                          ↓ Download ({p.values.length})
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setPlaces(prev => prev.filter(x => x.id !== p.id))} className="text-red-400 hover:text-red-600 p-1"><X size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Products */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">
            Products available in this zone <span className="text-gray-400 font-normal ml-1">({selectedProducts.length} selected)</span>
          </h2>
          <div className="flex gap-2">
            {(['category', 'specific'] as const).map(t => (
              <button key={t} onClick={() => { setSelectionType(t); setSelectedCatId(''); setCatProducts([]) }}
                className={`px-4 py-2 text-sm rounded-lg border font-medium transition-colors ${selectionType === t ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                {t === 'category' ? 'By Category' : 'Specific Products'}
              </button>
            ))}
          </div>

          {selectionType === 'category' && (
            <div className="space-y-3">
              <CategoryTreeSelect
                categories={categories}
                value={selectedCatId}
                onChange={id => handleCategorySelect(id)}
                placeholder="Select a category…"
                compact
              />
              {loadingCat && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={13} className="animate-spin" /> Loading…</div>}
              {catProducts.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">{catProducts.length} products</p>
                    <button onClick={() => {
                      const newOnes = catProducts.filter(p => !selectedProducts.find(s => s.id === p.id))
                      setSelectedProducts(prev => [...prev, ...newOnes.map(p => ({ id: p.id, name: p.name }))])
                    }} className="text-xs border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 font-medium">Add All</button>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    {catProducts.map(p => {
                      const isSel = !!selectedProducts.find(s => s.id === p.id)
                      return (
                        <div key={p.id} onClick={() => toggleProduct(p)}
                          className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${isSel ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                          <input type="checkbox" checked={isSel} readOnly className="accent-gray-900 shrink-0" />
                          {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="w-8 h-8 rounded object-cover border border-gray-200 shrink-0" /> : <div className="w-8 h-8 rounded bg-gray-200 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className={`text-xs ${isSel ? 'text-gray-300' : 'text-gray-400'}`}>₹{p.price}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {selectionType === 'specific' && (
            <div className="space-y-3">
              {/* Search + Select All */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input type="text" value={prodSearch} onChange={e => setProdSearch(e.target.value)}
                    placeholder="Search products…"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                  {(searching || loadingAllProducts) && <Loader2 size={13} className="absolute right-3 top-2.5 animate-spin text-gray-400" />}
                </div>
                <button
                  onClick={() => {
                    const visible = prodSearch.trim()
                      ? allProducts.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase()))
                      : allProducts
                    const newOnes = visible.filter(p => !selectedProducts.find(s => s.id === p.id))
                    setSelectedProducts(prev => [...prev, ...newOnes.map(p => ({ id: p.id, name: p.name }))])
                  }}
                  className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 font-medium whitespace-nowrap">
                  Select All
                </button>
              </div>

              {/* Product list */}
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                {loadingAllProducts ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                    <Loader2 size={14} className="animate-spin" /> Loading products…
                  </div>
                ) : (() => {
                  const visible = prodSearch.trim()
                    ? allProducts.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase()))
                    : allProducts
                  if (visible.length === 0) return (
                    <p className="text-sm text-gray-400 text-center py-8">No products found</p>
                  )
                  return visible.map(p => {
                    const isSel = !!selectedProducts.find(s => s.id === p.id)
                    return (
                      <div key={p.id} onClick={() => toggleProduct(p)}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${isSel ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={isSel} readOnly className="accent-gray-900 shrink-0" />
                        {p.images?.[0]
                          ? <img src={p.images[0]} alt={p.name} className="w-8 h-8 rounded object-cover shrink-0 border border-gray-200" />
                          : <div className="w-8 h-8 rounded bg-gray-100 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isSel ? '' : 'text-gray-900'}`}>{p.name}</p>
                          <p className={`text-xs ${isSel ? 'text-gray-300' : 'text-gray-400'}`}>₹{p.price}</p>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
              {allProducts.length > 0 && (
                <p className="text-xs text-gray-400">{selectedProducts.length} of {allProducts.length} selected</p>
              )}
            </div>
          )}

          {selectedProducts.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500 font-medium">Selected ({selectedProducts.length})</p>
              {selectedProducts.map((p, idx) => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-gray-50">
                  <span className="text-xs text-gray-400 w-5 text-center shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900 truncate">{p.name}</p></div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => moveProduct(idx, -1)} disabled={idx === 0} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30">↑</button>
                    <button onClick={() => moveProduct(idx, 1)} disabled={idx === selectedProducts.length - 1} className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-30">↓</button>
                    <button onClick={() => removeProduct(p.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"><X size={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editingPlace && (
        <PlacesModal place={editingPlace} onClose={() => setEditingPlace(null)}
          onSave={updated => { setPlaces(p => p.map(pl => pl.id === updated.id ? updated : pl)); setEditingPlace(null) }} />
      )}
    </div>
  )
}
