import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  db, collection, doc, getDoc, addDoc, updateDoc, Timestamp,
} from '@/lib/firebase'
import { useQuery } from '@tanstack/react-query'
import { X, Plus, Loader2, MapPin } from 'lucide-react'
import {
  useDeliveryZones,
  useDeleteDeliveryZone,
  type ZonePlace,
  type ZonePlaceType,
  type DeliveryZone,
} from '@/hooks/useDeliveryZones'
import { formatCurrency } from '@/lib/utils'
import {
  useDeliveryPincodes,
  useAddPincode,
  useUpdatePincode,
  useDeletePincode,
} from '@/hooks/useDeliveryPincodes'
import type { DeliveryPincode } from '@/types'
import { Pencil, Trash2, Search, Check } from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────

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
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
    'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
    'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming',
  ],
}

const COUNTRIES = ['India','United States','United Kingdom','Australia','Canada','Rest of the World']

// ── Places Modal (identical to ShippingZoneForm) ─────────────────

function PlacesModal({ place, onClose, onSave }: {
  place: ZonePlace; onClose: () => void; onSave: (p: ZonePlace) => void
}) {
  // City rows: each row is { id, state (dropdown value), input (raw typed text), tags (committed chips) }
  type CityRow = { id: string; state: string; input: string; tags: string[] }
  const initCityRows = (): CityRow[] => {
    if (place.placeType === 'city' && place.values.length) {
      return [{ id: crypto.randomUUID(), state: '', input: '', tags: place.values }]
    }
    return [{ id: crypto.randomUUID(), state: '', input: '', tags: [] }]
  }

  const [placeType,      setPlaceType]      = useState<ZonePlaceType>(place.placeType)
  const [selectedStates, setSelectedStates] = useState<string[]>(place.placeType === 'state' ? place.values : [])
  const [stateSearch,    setStateSearch]    = useState('')
  const [cityRows,       setCityRows]       = useState<CityRow[]>(initCityRows)
  const [manualPincodes, setManualPincodes] = useState<string[]>(
    place.placeType === 'pincode' && place.values.length ? place.values : ['']
  )
  const [inputMode,   setInputMode]   = useState<'manual' | 'bulk'>('manual')
  const [bulkText,    setBulkText]    = useState('')
  const [bulkError,   setBulkError]   = useState<string | null>(null)
  const [bulkPreview, setBulkPreview] = useState<{ value: string; country: string; status: 'valid' | 'invalid' }[] | null>(null)
  const [bulkAction,  setBulkAction]  = useState<'add' | 'delete'>('add')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const stateList      = STATES_BY_COUNTRY[place.country] ?? []
  const hasStates      = stateList.length > 0
  const filteredStates = stateList.filter(s => s.toLowerCase().includes(stateSearch.toLowerCase()))
  const toggleState    = (s: string) => setSelectedStates(v => v.includes(s) ? v.filter(x => x !== s) : [...v, s])

  const parseBulkCSV = (text: string, mode: ZonePlaceType): string[] => {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) return []
    const firstLine = lines[0].toLowerCase()
    const hasHeader = firstLine.includes('pincode') || firstLine.includes('country') ||
                      firstLine.includes('state') || firstLine.includes('city')
    const dataLines = hasHeader ? lines.slice(1) : lines
    const result: string[] = []
    for (const line of dataLines) {
      const parts = line.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''))
      if (mode === 'city') { const v = parts.length >= 3 ? parts[2] : parts[parts.length - 1]; if (v) result.push(v) }
      else if (mode === 'pincode') { const v = parts.length >= 2 ? parts[parts.length - 1] : parts[0]; if (v) result.push(v) }
      else { const v = parts[parts.length - 1]; if (v) result.push(v) }
    }
    return [...new Set(result)]
  }

  const handleBulkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setBulkText(ev.target?.result as string ?? '')
    reader.readAsText(file); e.target.value = ''
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
        // Add bulk cities into the first row's tags
        setCityRows(rows => {
          const updated = [...rows]
          updated[0] = { ...updated[0], tags: [...new Set([...updated[0].tags, ...valid])] }
          return updated
        })
      } else setManualPincodes(prev => [...new Set([...prev.filter(p => p.trim()), ...valid])])
    } else {
      if (placeType === 'state') setSelectedStates(prev => prev.filter(s => !valid.includes(s)))
      else if (placeType === 'city') {
        setCityRows(rows => rows.map(r => ({ ...r, tags: r.tags.filter(t => !valid.includes(t)) })))
      } else setManualPincodes(prev => prev.filter(p => !valid.includes(p)))
    }
    setBulkPreview(null); setBulkText(''); setBulkError(null)
  }

  const handleSubmit = () => {
    if (placeType === 'state') {
      onSave({ ...place, placeType, values: selectedStates })
    } else if (placeType === 'city') {
      // Collect all tags from all rows + any uncommitted input
      const allCities = cityRows.flatMap(r => {
        const fromInput = r.input.split(',').map(s => s.trim()).filter(Boolean)
        return [...r.tags, ...fromInput]
      })
      onSave({ ...place, placeType, values: [...new Set(allCities)] })
    } else {
      onSave({ ...place, placeType, values: manualPincodes.filter(s => s.trim() !== '') })
    }
    onClose()
  }

  // City row helpers
  const addCityRow = () => setCityRows(rows => [...rows, { id: crypto.randomUUID(), state: '', input: '', tags: [] }])
  const removeCityRow = (id: string) => setCityRows(rows => rows.filter(r => r.id !== id))
  const updateCityRow = (id: string, patch: Partial<{ state: string; input: string; tags: string[] }>) =>
    setCityRows(rows => rows.map(r => r.id === id ? { ...r, ...patch } : r))
  const commitCityInput = (id: string, raw: string) => {
    const newTags = raw.split(',').map(s => s.trim()).filter(Boolean)
    if (!newTags.length) return
    setCityRows(rows => rows.map(r =>
      r.id === id ? { ...r, tags: [...new Set([...r.tags, ...newTags])], input: '' } : r
    ))
  }
  const removeCityTag = (rowId: string, tag: string) =>
    setCityRows(rows => rows.map(r => r.id === rowId ? { ...r, tags: r.tags.filter(t => t !== tag) } : r))

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-6 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-lg">Places in {place.country}</h3>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </div>

        <div className="px-8 py-6 overflow-y-auto flex-1 space-y-6">
          {/* Type radio */}
          <div className="flex gap-8">
            {(hasStates ? ['state','city','pincode'] : ['city','pincode']).map(t => (
              <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={placeType === t} onChange={() => { setPlaceType(t as ZonePlaceType); setInputMode('manual'); setBulkError(null) }} className="accent-gray-900 w-4 h-4" />
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

          {/* Bulk upload */}
          {inputMode === 'bulk' && !bulkPreview && (
            <div className="space-y-3">
              <div className="flex gap-3">
                {(['add','delete'] as const).map(a => (
                  <button key={a} onClick={() => setBulkAction(a)}
                    className={`px-4 py-1.5 text-sm rounded-lg border font-medium transition-colors ${bulkAction === a ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    Bulk {a.charAt(0).toUpperCase() + a.slice(1)}
                  </button>
                ))}
              </div>
              <div onClick={() => fileInputRef.current?.click()}
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
                    ? 'Country,State,City\nIndia,Karnataka,Bengaluru\nIndia,Karnataka,Mangalore\nIndia,Tamil Nadu,Chennai'
                    : 'Country,Pincode\nIndia,560001\nIndia,560002\nIndia,560003'
                  const a = document.createElement('a')
                  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(sample)
                  a.download = `sample-${placeType}.csv`; a.click()
                }} className="text-xs text-gray-500 hover:text-gray-800 underline">Download sample CSV</button>
                <button onClick={previewBulk} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Preview</button>
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

          {/* Manual — State */}
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

          {/* Manual — City */}
          {inputMode === 'manual' && placeType === 'city' && (
            <div className="space-y-3">
              <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
                {cityRows.map((row, idx) => (
                  <div key={row.id} className="space-y-2">
                    <div className="flex gap-3 items-start">
                      {/* State dropdown */}
                      <div className="w-56 shrink-0">
                        <label className="block text-xs text-gray-500 mb-1">State</label>
                        {stateList.length > 0 ? (
                          <select
                            value={row.state}
                            onChange={e => updateCityRow(row.id, { state: e.target.value })}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                          >
                            <option value="">Select state</option>
                            {stateList.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={row.state}
                            onChange={e => updateCityRow(row.id, { state: e.target.value })}
                            placeholder="State"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                        )}
                      </div>

                      {/* City input + tags */}
                      <div className="flex-1">
                        <label className="block text-xs text-gray-500 mb-1">City (use comma for multiple cities)</label>
                        <div className="min-h-[56px] px-3 py-2 border border-gray-300 rounded-lg flex flex-wrap gap-1.5 items-start focus-within:ring-2 focus-within:ring-gray-900">
                          {row.tags.map(tag => (
                            <span key={tag} className="flex items-center gap-1 bg-gray-900 text-white text-xs px-2 py-0.5 rounded-full shrink-0">
                              {tag}
                              <button type="button" onClick={() => removeCityTag(row.id, tag)} className="opacity-70 hover:opacity-100 ml-0.5">
                                <X size={9} />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={row.input}
                            autoFocus={idx === 0}
                            onChange={e => updateCityRow(row.id, { input: e.target.value })}
                            onKeyDown={e => {
                              if ((e.key === 'Enter' || e.key === ',') && row.input.trim()) {
                                e.preventDefault()
                                commitCityInput(row.id, row.input)
                              }
                              if (e.key === 'Backspace' && !row.input && row.tags.length) {
                                removeCityTag(row.id, row.tags[row.tags.length - 1])
                              }
                            }}
                            onBlur={() => { if (row.input.trim()) commitCityInput(row.id, row.input) }}
                            placeholder={row.tags.length === 0 ? 'e.g. Bengaluru, Mysuru' : ''}
                            className="flex-1 min-w-[80px] text-sm outline-none bg-transparent py-0.5"
                          />
                        </div>
                      </div>


                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button type="button" onClick={addCityRow}
                  className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700">Add More</button>
                <button type="button" onClick={handleSubmit}
                  className="px-4 py-2 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-700">Submit</button>
              </div>
            </div>
          )}

          {/* Manual — Pincode */}
          {inputMode === 'manual' && placeType === 'pincode' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <button onClick={() => setManualPincodes(p => [...p, ''])}
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {(placeType === 'state' || inputMode === 'bulk') && (
          <div className="flex justify-end gap-3 px-8 py-5 border-t border-gray-100">
            <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Submit</button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Delivery Zone Form (Add / Edit) ──────────────────────────────

function DeliveryZoneForm() {
  const navigate   = useNavigate()
  const { zoneId } = useParams<{ zoneId: string }>()
  const isEdit     = !!zoneId
  const qc         = useQueryClient()

  const [zoneName,        setZoneName]        = useState('')
  const [places,          setPlaces]          = useState<ZonePlace[]>([])
  const [shippingCharge,  setShippingCharge]  = useState('0')
  const [isActive,        setIsActive]        = useState(true)
  const [editingPlace,    setEditingPlace]    = useState<ZonePlace | null>(null)
  const [countrySearch,   setCountrySearch]   = useState('')
  const [showCountryDrop, setShowCountryDrop] = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState<string | null>(null)
  const countryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) setShowCountryDrop(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Load existing zone for edit
  useQuery({
    queryKey: ['delivery-zone-edit', zoneId],
    enabled: isEdit,
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'delivery_zones', zoneId!))
      if (snap.exists()) {
        const d = snap.data()
        setZoneName(d.name ?? '')
        setPlaces(d.places ?? [])
        setShippingCharge(String(d.shipping_charge ?? 0))
        setIsActive(d.is_active !== false)
      }
      return snap.data() ?? null
    },
  })

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
    const charge = parseFloat(shippingCharge)
    if (isNaN(charge) || charge < 0) { setError('Shipping charge must be a valid non-negative number'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        name: zoneName.trim(),
        places,
        shipping_charge: charge,
        is_active: isActive,
        updated_at: Timestamp.now(),
      }
      if (isEdit) {
        await updateDoc(doc(db, 'delivery_zones', zoneId!), payload)
      } else {
        await addDoc(collection(db, 'delivery_zones'), { ...payload, created_at: Timestamp.now() })
      }
      qc.invalidateQueries({ queryKey: ['delivery_zones'] })
      navigate('/delivery-zones')
    } catch (e) { setError((e as { message?: string })?.message ?? 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">
              <Link to="/" className="hover:underline">Dashboard</Link>{' / '}
              <Link to="/delivery-zones" className="hover:underline">Delivery Zones</Link>{' / '}
              {isEdit ? 'Edit' : 'Add'} Delivery Zone
            </p>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit' : 'Add'} Delivery Zone</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate('/delivery-zones')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
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
          <input type="text" value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="e.g. Karnataka Delivery"
            className="w-full max-w-lg px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
        </div>

        {/* Zones (Places) */}
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
                        <button onClick={() => {
                          const csv = `Country,Pincode\n${p.values.map(v => `${p.country},${v}`).join('\n')}`
                          const a = document.createElement('a')
                          a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
                          a.download = `pincodes-${p.country.toLowerCase().replace(/\s+/g, '-')}.csv`; a.click()
                        }} className="ml-3 text-green-600 hover:underline text-xs font-medium">↓ Download ({p.values.length})</button>
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

        {/* Shipping Charge + Active */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900">Shipping Charge</h2>
          <div className="flex flex-wrap gap-6 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Charge (₹)</label>
              <input type="number" value={shippingCharge} onChange={e => setShippingCharge(e.target.value)}
                min="0" step="1" placeholder="0"
                className="w-40 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <p className="text-xs text-gray-400 mt-1">Enter 0 for free delivery</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Active</label>
              <button type="button" onClick={() => setIsActive(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? 'bg-green-500' : 'bg-gray-300'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <p className="text-xs text-gray-400 mt-1">{isActive ? 'Zone is active' : 'Zone is inactive'}</p>
            </div>
          </div>
        </div>
      </div>

      {editingPlace && (
        <PlacesModal place={editingPlace} onClose={() => setEditingPlace(null)}
          onSave={updated => { setPlaces(p => p.map(pl => pl.id === updated.id ? updated : pl)); setEditingPlace(null) }} />
      )}
    </div>
  )
}

// ── Legacy Pincodes section ───────────────────────────────────────

interface LegacyForm { pincode: string; area_name: string; shipping_charge: string; is_active: boolean }
const EMPTY_LEGACY: LegacyForm = { pincode: '', area_name: '', shipping_charge: '0', is_active: true }

function LegacyPincodes() {
  const { data: pincodes, isLoading } = useDeliveryPincodes()
  const addPincode    = useAddPincode()
  const updatePincode = useUpdatePincode()
  const deletePincode = useDeletePincode()

  const [search, setSearch]                   = useState('')
  const [showAdd, setShowAdd]                 = useState(false)
  const [editingId, setEditingId]             = useState<string | null>(null)
  const [form, setForm]                       = useState<LegacyForm>(EMPTY_LEGACY)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [formError, setFormError]             = useState<string | null>(null)

  const filtered = (pincodes ?? []).filter(p => {
    const q = search.toLowerCase()
    return p.pincode.includes(q) || p.area_name.toLowerCase().includes(q)
  })

  const openAdd  = () => { setForm(EMPTY_LEGACY); setFormError(null); setEditingId(null); setShowAdd(true) }
  const openEdit = (p: DeliveryPincode) => {
    setForm({ pincode: p.pincode, area_name: p.area_name, shipping_charge: String(p.shipping_charge), is_active: p.is_active })
    setFormError(null); setEditingId(p.id); setShowAdd(false)
  }
  const closeForm = () => { setShowAdd(false); setEditingId(null); setFormError(null) }

  const handleSave = async () => {
    setFormError(null)
    if (!form.pincode.match(/^\d{6}$/)) { setFormError('Pincode must be exactly 6 digits'); return }
    if (!form.area_name.trim()) { setFormError('Area name is required'); return }
    const charge = parseFloat(form.shipping_charge)
    if (isNaN(charge) || charge < 0) { setFormError('Shipping charge must be a valid non-negative number'); return }
    try {
      if (editingId) {
        await updatePincode.mutateAsync({ id: editingId, area_name: form.area_name.trim(), shipping_charge: charge, is_active: form.is_active })
      } else {
        await addPincode.mutateAsync({ pincode: form.pincode.trim(), area_name: form.area_name.trim(), shipping_charge: charge, is_active: form.is_active })
      }
      closeForm()
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Save failed') }
  }

  const handleDelete = async (id: string) => {
    try { await deletePincode.mutateAsync(id); setDeleteConfirmId(null) } catch (e) { console.error(e) }
  }

  const isSaving = addPincode.isPending || updatePincode.isPending

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2"><MapPin size={18} /> Legacy Pincodes</h2>
          <p className="text-xs text-gray-500 mt-0.5">Existing pincode-only records — fallback when no delivery zone matches</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-gray-700 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={16} /> Add Pincode
        </button>
      </div>

      {(showAdd || editingId) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-900 mb-4">{editingId ? 'Edit Pincode' : 'Add New Pincode'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Pincode *</label>
              <input type="text" value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))}
                placeholder="560001" maxLength={6} disabled={!!editingId}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Area Name *</label>
              <input type="text" value={form.area_name} onChange={e => setForm(f => ({ ...f, area_name: e.target.value }))}
                placeholder="Koramangala"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Shipping Charge (₹)</label>
              <input type="number" value={form.shipping_charge} onChange={e => setForm(f => ({ ...f, shipping_charge: e.target.value }))}
                min="0" step="1"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
              <p className="text-xs text-gray-400 mt-0.5">0 = free delivery</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Active?</label>
              <div className="flex items-center gap-2 mt-2">
                <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-gray-600">{form.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>
          {formError && <p className="mt-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>}
          <div className="mt-4 flex gap-3">
            <button onClick={handleSave} disabled={isSaving}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editingId ? 'Save Changes' : 'Add Pincode'}
            </button>
            <button onClick={closeForm}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search pincode or area…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>
          <span className="text-sm text-gray-500">{filtered.length} pincodes</span>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading pincodes…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Pincode</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Area Name</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Shipping</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono font-medium text-gray-900">{p.pincode}</td>
                    <td className="px-5 py-3 text-gray-700">{p.area_name}</td>
                    <td className="px-5 py-3">{p.shipping_charge === 0 ? <span className="text-green-600 text-xs font-medium">Free</span> : formatCurrency(p.shipping_charge)}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(p)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"><Pencil size={14} /></button>
                        {deleteConfirmId === p.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(p.id)} disabled={deletePincode.isPending} className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded">Confirm</button>
                            <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(p.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">{search ? 'No pincodes match your search' : 'No pincodes added yet'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Delivery Zones List Page ──────────────────────────────────────

function DeliveryZonesList() {
  const navigate    = useNavigate()
  const { data: zones = [], isLoading } = useDeliveryZones()
  const deleteZone  = useDeleteDeliveryZone()
  const [search, setSearch]                   = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const placeSummary = (z: DeliveryZone): string => {
    if (!z.places?.length) return '—'
    return z.places.map(p => {
      if (!p.values?.length) return `All over ${p.country}`
      const sample = p.values.slice(0, 2).join(', ')
      return p.values.length > 2 ? `${sample} +${p.values.length - 2} more` : sample
    }).join('; ')
  }

  const filtered = zones.filter(z => {
    const q = search.toLowerCase()
    return z.name.toLowerCase().includes(q) ||
      z.places?.some(p => p.country.toLowerCase().includes(q) || p.values.some(v => v.toLowerCase().includes(q)))
  })

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 mb-1">
            <Link to="/" className="hover:underline">Dashboard</Link> / Delivery Zones
          </p>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><MapPin size={22} /> Delivery Zones</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage serviceable areas — changes reflect instantly on checkout</p>
        </div>
        <button onClick={() => navigate('/delivery-zones/add')}
          className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <Plus size={16} /> Add Delivery Zone
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search zones…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <span className="text-sm text-gray-500">{filtered.length} zone{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading zones…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Zone Name</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Places</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Shipping</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(z => (
                <tr key={z.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <button onClick={() => navigate(`/delivery-zones/${z.id}/edit`)}
                      className="font-medium text-gray-900 hover:text-gray-600 hover:underline text-left">{z.name}</button>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs max-w-xs truncate">{placeSummary(z)}</td>
                  <td className="px-5 py-3">
                    {z.shipping_charge === 0
                      ? <span className="text-green-600 text-xs font-medium">Free</span>
                      : <span className="text-gray-700">{formatCurrency(z.shipping_charge)}</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${z.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {z.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => navigate(`/delivery-zones/${z.id}/edit`)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Edit">
                        <Pencil size={14} />
                      </button>
                      {deleteConfirmId === z.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={async () => { await deleteZone.mutateAsync(z.id); setDeleteConfirmId(null) }}
                            disabled={deleteZone.isPending}
                            className="text-xs text-red-600 font-medium px-2 py-1 bg-red-50 rounded">Confirm</button>
                          <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-500 px-2 py-1">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeleteConfirmId(z.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                  {search ? 'No zones match your search' : 'No delivery zones added yet'}
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Legacy Pincodes */}
      <div className="border-t border-gray-200 pt-8">
        <LegacyPincodes />
      </div>
    </div>
  )
}

// ── Router-aware default export ───────────────────────────────────
// Renders list, add form, or edit form based on route params

export default function DeliveryZones() {
  const { zoneId, action } = useParams<{ zoneId?: string; action?: string }>()

  // /delivery-zones/add  → show add form
  if (action === 'add' || zoneId === 'add') return <DeliveryZoneForm />
  // /delivery-zones/:zoneId/edit → show edit form
  if (zoneId && action === 'edit') return <DeliveryZoneForm />
  // default → list
  return <DeliveryZonesList />
}
