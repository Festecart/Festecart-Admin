# Festecart-Connect — Shipping System Integration Guide

## Overview

The Festecart Admin has been updated with a full shipping zone management system. Festecart-Connect (storefront) must now read from the new tables to calculate shipping at checkout. The old `delivery_pincodes` table remains as a fallback.

---

## Step 1 — Run This SQL in Supabase

```sql
-- Shipping Zones
create table if not exists public.shipping_zones (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  location          text,
  places            jsonb not null default '[]'::jsonb,
  product_type      text,           -- 'category' | 'product_group' | 'specific' | null
  selected_products jsonb,          -- [{ id, name }]
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Shipping Methods
create table if not exists public.shipping_methods (
  id                    uuid primary key default gen_random_uuid(),
  zone_id               uuid not null references public.shipping_zones(id) on delete cascade,
  name                  text not null,
  delivery_min          int not null default 1,
  delivery_max          int not null default 2,
  time_unit             text not null default 'Business Days',
  condition_type        text,        -- 'price' | 'weight' | null
  price_min             numeric,
  price_max             numeric,
  weight_min            numeric,
  weight_max            numeric,
  free_shipping         boolean not null default false,
  charge                numeric not null default 0,
  charge_type           text not null default 'flat',   -- 'flat' | 'percentage'
  allow_free_offer_code boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

-- Courier Vendors
create table if not exists public.courier_vendors (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null,
  tracking_url              text,
  tracking_number_mandatory boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Add missing columns if tables already existed
alter table public.shipping_zones
  add column if not exists product_type      text,
  add column if not exists selected_products jsonb;

alter table public.shipping_methods
  add column if not exists is_active boolean not null default true;

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists shipping_zones_updated_at on public.shipping_zones;
create trigger shipping_zones_updated_at
  before update on public.shipping_zones
  for each row execute function public.set_updated_at();

drop trigger if exists courier_vendors_updated_at on public.courier_vendors;
create trigger courier_vendors_updated_at
  before update on public.courier_vendors
  for each row execute function public.set_updated_at();

-- RLS
alter table public.shipping_zones    enable row level security;
alter table public.shipping_methods  enable row level security;
alter table public.courier_vendors   enable row level security;

create policy if not exists "Admin full access shipping_zones"
  on public.shipping_zones for all to authenticated using (true) with check (true);
create policy if not exists "Admin full access shipping_methods"
  on public.shipping_methods for all to authenticated using (true) with check (true);
create policy if not exists "Admin full access courier_vendors"
  on public.courier_vendors for all to authenticated using (true) with check (true);

-- Public read for storefront
create policy if not exists "Public read shipping_zones"
  on public.shipping_zones for select to anon using (true);
create policy if not exists "Public read shipping_methods"
  on public.shipping_methods for select to anon using (true);
create policy if not exists "Public read courier_vendors"
  on public.courier_vendors for select to anon using (true);

-- Seed default vendor
insert into public.courier_vendors (name, tracking_url, tracking_number_mandatory)
values ('Self-delivery', null, false)
on conflict do nothing;
```

---

## Step 2 — Data Structure Reference

### `shipping_zones.places` (JSONB array)

Each entry in the `places` array looks like this:

```json
[
  {
    "id": "uuid",
    "country": "India",
    "placeType": "pincode",
    "values": ["560001", "560002", "636463", "636464"]
  },
  {
    "id": "uuid",
    "country": "India",
    "placeType": "state",
    "values": ["Karnataka", "Tamil Nadu"]
  }
]
```

- `placeType` is one of: `"state"` | `"city"` | `"pincode"`
- `values` is the array of selected states, city names, or pincodes

### `shipping_zones.selected_products` (JSONB array)

```json
[{ "id": "product-uuid", "name": "Product Name" }]
```

Used when `product_type` is `"specific"`, `"category"`, or `"product_group"`.

### Bulk CSV format (Country + Pincode)

The admin uploads CSVs in this format:

```csv
Country,Pincode
India,560001
India,560002
India,636463
```

---

## Step 3 — Files to Create/Modify in Festecart-Connect

### 3a. New file: `src/lib/shippingUtils.ts`

```typescript
import { supabase } from './supabase'

interface ShippingResult {
  charge: number
  methodName: string
  deliveryMin: number
  deliveryMax: number
  timeUnit: string
  isFree: boolean
  allowFreeCode: boolean
}

/**
 * Get the applicable shipping rate for a given pincode + order total.
 * Priority: zone-based methods → delivery_pincodes fallback.
 * Returns null if pincode is not serviceable.
 */
export async function getShippingRate(
  pincode: string,
  orderTotal: number,
  productIds: string[] = []
): Promise<ShippingResult | null> {

  // 1. Fetch all active zones with their places
  const { data: zones } = await supabase
    .from('shipping_zones')
    .select('id, name, places, product_type, selected_products')

  for (const zone of zones ?? []) {
    // 2. Check if customer pincode matches this zone's places
    const places: Array<{ placeType: string; values: string[] }> = zone.places ?? []
    const pincodeMatches = places.some(
      p => p.placeType === 'pincode' && p.values.includes(pincode)
    )
    if (!pincodeMatches) continue

    // 3. Check product restriction (if zone has product_type set)
    if (zone.product_type && zone.selected_products?.length > 0) {
      const allowedIds = (zone.selected_products as { id: string }[]).map(p => p.id)
      const hasMatch = productIds.some(id => allowedIds.includes(id))
      if (!hasMatch) continue
    }

    // 4. Find the applicable shipping method based on order total
    const { data: methods } = await supabase
      .from('shipping_methods')
      .select('*')
      .eq('zone_id', zone.id)
      .eq('is_active', true)
      .order('price_min', { ascending: true })

    for (const method of methods ?? []) {
      let matches = false

      if (method.condition_type === 'price') {
        const min = method.price_min ?? 0
        const max = method.price_max ?? Infinity
        matches = orderTotal >= min && orderTotal <= max
      } else if (!method.condition_type) {
        matches = true // no condition = always applies
      }

      if (matches) {
        let charge = 0
        if (!method.free_shipping) {
          charge = method.charge_type === 'percentage'
            ? (orderTotal * method.charge) / 100
            : method.charge
        }
        return {
          charge,
          methodName: method.name,
          deliveryMin: method.delivery_min,
          deliveryMax: method.delivery_max,
          timeUnit: method.time_unit,
          isFree: method.free_shipping,
          allowFreeCode: method.allow_free_offer_code,
        }
      }
    }
  }

  // 5. Fallback: old delivery_pincodes table
  const { data: pinRow } = await supabase
    .from('delivery_pincodes')
    .select('shipping_charge, is_active')
    .eq('pincode', pincode)
    .single()

  if (pinRow?.is_active) {
    return {
      charge: pinRow.shipping_charge,
      methodName: 'Standard Delivery',
      deliveryMin: 3,
      deliveryMax: 7,
      timeUnit: 'Business Days',
      isFree: pinRow.shipping_charge === 0,
      allowFreeCode: false,
    }
  }

  return null // not serviceable
}

/**
 * Check if a pincode is serviceable at all (zone OR delivery_pincodes).
 */
export async function isPincodeServiceable(pincode: string): Promise<boolean> {
  const result = await getShippingRate(pincode, 0)
  return result !== null
}
```

---

### 3b. Modify: `src/hooks/useDeliveryPincodes.ts`

Add a new hook:

```typescript
import { getShippingRate } from '@/lib/shippingUtils'

export function useShippingRate(pincode: string, orderTotal: number, productIds?: string[]) {
  return useQuery({
    queryKey: ['shipping-rate', pincode, orderTotal],
    queryFn: () => getShippingRate(pincode, orderTotal, productIds),
    enabled: pincode.length === 6,
    staleTime: 1000 * 60 * 5,
  })
}
```

---

### 3c. Modify: `src/pages/user/CheckoutPage.tsx`

Replace the current flat pincode map lookup:

```typescript
// REMOVE this:
const shippingCharge = pincodeMap[pincode]?.charge ?? 0

// ADD this:
const { data: shippingResult, isLoading: shippingLoading } = useShippingRate(
  pincode,
  cartSubtotal,
  cartItems.map(i => i.product_id)
)

// Disable Place Order if not serviceable
const isServiceable = shippingResult !== null
const shippingCharge = shippingResult?.charge ?? 0

// Show delivery estimate
const deliveryText = shippingResult
  ? `${shippingResult.deliveryMin}–${shippingResult.deliveryMax} ${shippingResult.timeUnit}`
  : ''

// Show free shipping message
const isFreeShipping = shippingResult?.isFree ?? false
```

---

### 3d. Show delivery estimate in UI

In the order summary / checkout UI:

```tsx
{shippingResult && (
  <div className="text-sm text-gray-600">
    <span className="font-medium">
      {shippingResult.isFree ? 'Free Shipping' : `₹${shippingResult.charge.toFixed(0)}`}
    </span>
    <span className="text-gray-400 ml-2">
      Est. {shippingResult.deliveryMin}–{shippingResult.deliveryMax} {shippingResult.timeUnit}
    </span>
  </div>
)}

{!isServiceable && pincode.length === 6 && (
  <p className="text-sm text-red-500">
    Delivery not available for this pincode
  </p>
)}
```

---

### 3e. Free Shipping Coupon Code

If `shippingResult.allowFreeCode === true`, allow a coupon that waives shipping:

```typescript
if (appliedCoupon?.type === 'free_shipping' && shippingResult?.allowFreeCode) {
  finalShippingCharge = 0
}
```

---

## Step 4 — Courier Vendors in Admin Tracking

When the admin adds tracking info to an order (in `OrderDetail.tsx` → `TrackingModal`), the courier name dropdown should be populated from the `courier_vendors` table:

```typescript
// In TrackingModal, fetch courier vendors
const { data: vendors } = useQuery({
  queryKey: ['courier-vendors'],
  queryFn: async () => {
    const { data } = await supabase.from('courier_vendors').select('id, name, tracking_url').order('name')
    return data ?? []
  }
})

// Build tracking URL with the number substituted
const buildTrackingUrl = (vendor: { tracking_url: string | null }, trackingNum: string) => {
  if (!vendor.tracking_url) return null
  return vendor.tracking_url.replace('{tracking_number}', trackingNum)
}
```

Show the tracking URL to the customer in their order status email and order detail page.

---

## Summary of Changes Required

| File | Action | Details |
|---|---|---|
| `src/lib/shippingUtils.ts` | **CREATE** | Zone-based shipping rate calculator |
| `src/hooks/useDeliveryPincodes.ts` | **MODIFY** | Add `useShippingRate` hook |
| `src/pages/user/CheckoutPage.tsx` | **MODIFY** | Use zone-based rate, show estimate, disable if not serviceable |
| `src/pages/user/OrderDetailPage.tsx` | **MODIFY** | Show tracking URL from courier vendor |
| Order confirmation email | **MODIFY** | Show delivery estimate from `delivery_min/max + time_unit` |

---

## CSV Bulk Upload Format

When uploading pincodes to a shipping zone in Admin:

```csv
Country,Pincode
India,560001
India,560002
India,636463
India,636464
```

- **Column 1**: Country name (must match exactly: `India`, `United States`, etc.)
- **Column 2**: Pincode / Zipcode

Download the sample CSV from the Bulk Upload panel in Admin to get the correct format.
