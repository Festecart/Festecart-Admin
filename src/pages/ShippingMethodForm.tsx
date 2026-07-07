import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { db, collection, doc, getDoc, addDoc, updateDoc, Timestamp } from '@/lib/firebase'
import { Loader2 } from 'lucide-react'

type ShippingCondition = '' | 'price' | 'weight'
type ChargeType = 'flat' | 'percentage'
type TimeUnit = 'Business Days' | 'Days' | 'Hours'

export default function ShippingMethodForm() {
  const navigate = useNavigate()
  const { zoneId, methodId } = useParams<{ zoneId: string; methodId: string }>()
  const isEdit = !!methodId
  const qc = useQueryClient()

  const { data: zone } = useQuery({
    queryKey: ['shipping-zone', zoneId],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'shipping_zones', zoneId!))
      return snap.exists() ? { name: snap.data().name } : null
    },
    enabled: !!zoneId,
  })

  const [name,          setName]          = useState('')
  const [deliveryMin,   setDeliveryMin]   = useState('1')
  const [deliveryMax,   setDeliveryMax]   = useState('2')
  const [timeUnit,      setTimeUnit]      = useState<TimeUnit>('Business Days')
  const [condition,     setCondition]     = useState<ShippingCondition>('')
  const [priceMin,      setPriceMin]      = useState('')
  const [priceMax,      setPriceMax]      = useState('')
  const [weightMin,     setWeightMin]     = useState('')
  const [weightMax,     setWeightMax]     = useState('')
  const [freeShipping,  setFreeShipping]  = useState(false)
  const [charge,        setCharge]        = useState('0.00')
  const [chargeType,    setChargeType]    = useState<ChargeType>('flat')
  const [freeOfferCode, setFreeOfferCode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  useQuery({
    queryKey: ['shipping-method', methodId],
    enabled: isEdit,
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'shipping_methods', methodId!))
      if (snap.exists()) {
        const d = snap.data()
        setName(d.name ?? ''); setDeliveryMin(String(d.delivery_min ?? 1)); setDeliveryMax(String(d.delivery_max ?? 2))
        setTimeUnit(d.time_unit ?? 'Business Days'); setCondition(d.condition_type ?? '')
        setPriceMin(String(d.price_min ?? '')); setPriceMax(String(d.price_max ?? ''))
        setWeightMin(String(d.weight_min ?? '')); setWeightMax(String(d.weight_max ?? ''))
        setFreeShipping(d.free_shipping ?? false); setCharge(String(d.charge ?? '0.00'))
        setChargeType(d.charge_type ?? 'flat'); setFreeOfferCode(d.allow_free_offer_code ?? false)
      }
      return snap.data()
    },
  })

  const handleSave = async () => {
    if (!name.trim()) { setError('Shipping Method Name is required'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        zone_id: zoneId, name: name.trim(),
        delivery_min: parseInt(deliveryMin) || 1, delivery_max: parseInt(deliveryMax) || 2,
        time_unit: timeUnit, condition_type: condition || null,
        price_min:   condition === 'price'  ? parseFloat(priceMin)  || null : null,
        price_max:   condition === 'price'  ? parseFloat(priceMax)  || null : null,
        weight_min:  condition === 'weight' ? parseFloat(weightMin) || null : null,
        weight_max:  condition === 'weight' ? parseFloat(weightMax) || null : null,
        free_shipping: freeShipping, charge: freeShipping ? 0 : parseFloat(charge) || 0,
        charge_type: chargeType, allow_free_offer_code: freeOfferCode,
        updated_at: Timestamp.now(),
      }
      if (isEdit) {
        await updateDoc(doc(db, 'shipping_methods', methodId!), payload)
      } else {
        await addDoc(collection(db, 'shipping_methods'), { ...payload, created_at: Timestamp.now() })
      }
      qc.invalidateQueries({ queryKey: ['shipping-methods', zoneId] })
      navigate(`/shipping-zones/${zoneId}/methods`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">
              <Link to="/" className="hover:underline">Dashboard</Link> /{' '}
              <Link to="/shipping-zones" className="hover:underline">Shipping Zones</Link> /
              {zone && <> Shipping Methods of "{(zone as { name: string }).name}" /</>} {isEdit ? 'Edit' : 'Add'} Shipping Method
            </p>
            <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit' : 'Add'} Shipping Method</h1>
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
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Shipping Method Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Shipping Method Name"
              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Estimated Delivery Time</label>
            <div className="flex gap-3 items-center">
              <input type="number" value={deliveryMin} onChange={e => setDeliveryMin(e.target.value)} min="0"
                className="w-24 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <input type="number" value={deliveryMax} onChange={e => setDeliveryMax(e.target.value)} min="0"
                className="w-24 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              <select value={timeUnit} onChange={e => setTimeUnit(e.target.value as TimeUnit)}
                className="px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
                <option>Business Days</option><option>Days</option><option>Hours</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Shipping Condition</label>
            <select value={condition} onChange={e => setCondition(e.target.value as ShippingCondition)}
              className="w-60 px-3 py-2.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-900">
              <option value="">— Select —</option>
              <option value="price">Based on Price</option>
              <option value="weight">Based on Weight</option>
            </select>
          </div>
          {condition === 'price' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Price Range *</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                  <span className="px-3 py-2.5 bg-gray-50 text-gray-500 text-sm border-r border-gray-300">₹</span>
                  <input type="number" value={priceMin} onChange={e => setPriceMin(e.target.value)} placeholder="Min" min="0"
                    className="px-3 py-2.5 text-sm focus:outline-none w-36" />
                </div>
                <span className="text-gray-400 text-sm">to</span>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                  <span className="px-3 py-2.5 bg-gray-50 text-gray-500 text-sm border-r border-gray-300">₹</span>
                  <input type="number" value={priceMax} onChange={e => setPriceMax(e.target.value)} placeholder="Max" min="0"
                    className="px-3 py-2.5 text-sm focus:outline-none w-36" />
                </div>
              </div>
            </div>
          )}
          {condition === 'weight' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Weight Range (kg) *</label>
              <div className="flex items-center gap-3">
                <input type="number" value={weightMin} onChange={e => setWeightMin(e.target.value)} placeholder="Min kg" min="0"
                  className="w-32 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                <span className="text-gray-400 text-sm">to</span>
                <input type="number" value={weightMax} onChange={e => setWeightMax(e.target.value)} placeholder="Max kg" min="0"
                  className="w-32 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            </div>
          )}
          {condition && (
            <>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={freeShipping} onChange={e => setFreeShipping(e.target.checked)} className="w-4 h-4 accent-gray-900" />
                Allow free shipping
              </label>
              {!freeShipping && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Shipping Charges *</label>
                  <div className="flex items-center gap-4">
                    <input type="number" value={charge} onChange={e => setCharge(e.target.value)} min="0" step="0.01"
                      className="w-36 px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900" />
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={chargeType === 'flat'} onChange={() => setChargeType('flat')} className="w-4 h-4 accent-gray-900" /> Flat
                    </label>
                    <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" checked={chargeType === 'percentage'} onChange={() => setChargeType('percentage')} className="w-4 h-4 accent-gray-900" /> Percentage
                    </label>
                  </div>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={freeOfferCode} onChange={e => setFreeOfferCode(e.target.checked)} className="w-4 h-4 accent-gray-900" />
                Allow Free Shipping offer code
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
