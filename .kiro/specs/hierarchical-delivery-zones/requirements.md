# Requirements Document

## Introduction

The Festecart Admin panel currently validates delivery eligibility using a flat list of pincodes stored in the `delivery_pincodes` Firestore collection. This feature upgrades that system to a three-level hierarchical delivery zone model: **State → City → Pincode**. Admins can define zones at any level of specificity, and the storefront checkout resolves the applicable zone and shipping charge using a priority-first lookup (pincode → city → state). Existing pincode-only records must remain valid and continue to work without migration.

---

## Glossary

- **Delivery_Zone**: A Firestore document in the `delivery_zones` collection that specifies where delivery is available and the associated shipping charge. A zone is defined at exactly one of three granularity levels: state-level, city-level, or pincode-level.
- **Zone_Level**: The granularity of a Delivery_Zone. One of: `state`, `city`, or `pincode`.
- **State_Zone**: A Delivery_Zone where `zone_level = "state"` and only `state` is populated. Covers the entire state.
- **City_Zone**: A Delivery_Zone where `zone_level = "city"` and both `state` and `city` are populated. Covers the entire city within that state.
- **Pincode_Zone**: A Delivery_Zone where `zone_level = "pincode"` and `state`, `city`, and `pincode` are all populated. Covers a single pincode.
- **Zone_Resolver**: The lookup function (in the storefront's `shippingUtils`) that, given a customer's state, city, and pincode, returns the most specific matching active Delivery_Zone.
- **Admin_Panel**: The Festecart Admin React + TypeScript + Vite application.
- **Storefront**: The customer-facing checkout application that calls `getShippingRate` and `getUndeliverableProductIds` from `shippingUtils`.
- **Legacy_Pincode**: An existing document in the `delivery_pincodes` Firestore collection with the old schema `{ id, pincode, area_name, shipping_charge, is_active, created_at, updated_at }`.
- **Shipping_Charge**: A non-negative monetary amount in Indian Rupees (₹) representing the delivery fee for a zone. Zero means free delivery.
- **DeliveryZones_Page**: The admin UI page at `src/pages/DeliveryZones.tsx` that manages Delivery_Zone records.
- **useDeliveryZones_Hook**: The React Query hook at `src/hooks/useDeliveryZones.ts` that reads and mutates the `delivery_zones` collection.

---

## Requirements

### Requirement 1: Hierarchical Zone Data Model

**User Story:** As an admin, I want to define delivery zones at state, city, or pincode granularity, so that I can configure delivery coverage at the right level of specificity without being forced to enumerate every pincode.

#### Acceptance Criteria

1. THE Admin_Panel SHALL store Delivery_Zone records in a Firestore collection named `delivery_zones` with the fields: `id`, `zone_level`, `state`, `city`, `pincode`, `area_name`, `shipping_charge`, `is_active`, `created_at`, `updated_at`.
2. WHEN a Delivery_Zone has `zone_level = "state"`, THE Admin_Panel SHALL require `state` to be non-empty and SHALL store `city` and `pincode` as empty strings.
3. WHEN a Delivery_Zone has `zone_level = "city"`, THE Admin_Panel SHALL require both `state` and `city` to be non-empty and SHALL store `pincode` as an empty string.
4. WHEN a Delivery_Zone has `zone_level = "pincode"`, THE Admin_Panel SHALL require `state`, `city`, and `pincode` to all be non-empty, and `pincode` SHALL be exactly 6 digits.
5. THE Admin_Panel SHALL enforce that `shipping_charge` is a non-negative number for all Delivery_Zone records.
6. THE Admin_Panel SHALL enforce that `is_active` is a boolean for all Delivery_Zone records.

---

### Requirement 2: Admin UI — Creating Delivery Zones

**User Story:** As an admin, I want to create delivery zones from a form in the admin panel, so that I can define where Festecart delivers and at what cost.

#### Acceptance Criteria

1. THE DeliveryZones_Page SHALL display a zone creation form with the following fields: Zone Level selector (State / City / Pincode), State input, City input, Pincode input, Area Name input, Shipping Charge input (₹), and Active toggle.
2. WHEN the admin selects Zone Level "State", THE DeliveryZones_Page SHALL hide the City and Pincode input fields and SHALL NOT require them for form submission.
3. WHEN the admin selects Zone Level "City", THE DeliveryZones_Page SHALL show the City input field, hide the Pincode input field, and SHALL require State and City for form submission.
4. WHEN the admin selects Zone Level "Pincode", THE DeliveryZones_Page SHALL show all three fields (State, City, Pincode) and SHALL require all three for form submission.
5. WHEN the admin submits a valid zone creation form, THE useDeliveryZones_Hook SHALL write a new document to the `delivery_zones` Firestore collection and SHALL invalidate the zone list query cache.
6. IF the admin submits a form with a missing required field, THEN THE DeliveryZones_Page SHALL display a field-level validation error message and SHALL NOT write to Firestore.
7. IF the admin submits a Pincode-level zone with a pincode that does not match the pattern `^\d{6}$`, THEN THE DeliveryZones_Page SHALL display the error "Pincode must be exactly 6 digits" and SHALL NOT write to Firestore.
8. IF the admin submits a form with a `shipping_charge` value that is not a non-negative number, THEN THE DeliveryZones_Page SHALL display the error "Shipping charge must be a valid non-negative number" and SHALL NOT write to Firestore.

---

### Requirement 3: Admin UI — Editing Delivery Zones

**User Story:** As an admin, I want to edit the area name, shipping charge, and active status of an existing delivery zone, so that I can update delivery configuration without deleting and recreating records.

#### Acceptance Criteria

1. THE DeliveryZones_Page SHALL provide an edit action for each zone in the zone list.
2. WHEN the admin opens the edit form for a zone, THE DeliveryZones_Page SHALL pre-populate the form with the zone's current `area_name`, `shipping_charge`, and `is_active` values.
3. WHILE editing a zone, THE DeliveryZones_Page SHALL disable the Zone Level, State, City, and Pincode fields so that the zone's key identifying fields cannot be changed.
4. WHEN the admin saves valid edits, THE useDeliveryZones_Hook SHALL update `area_name`, `shipping_charge`, `is_active`, and `updated_at` on the existing Firestore document and SHALL invalidate the zone list query cache.
5. IF the admin saves edits with an invalid `shipping_charge`, THEN THE DeliveryZones_Page SHALL display a validation error and SHALL NOT write to Firestore.

---

### Requirement 4: Admin UI — Deleting Delivery Zones

**User Story:** As an admin, I want to delete delivery zones I no longer need, so that I can keep the zone list clean and accurate.

#### Acceptance Criteria

1. THE DeliveryZones_Page SHALL provide a delete action for each zone in the zone list.
2. WHEN the admin clicks delete, THE DeliveryZones_Page SHALL display an inline confirmation prompt before proceeding with deletion.
3. WHEN the admin confirms deletion, THE useDeliveryZones_Hook SHALL delete the Firestore document and SHALL invalidate the zone list query cache.

---

### Requirement 5: Admin UI — Listing and Searching Delivery Zones

**User Story:** As an admin, I want to view and search the full list of delivery zones, so that I can quickly find and manage specific zones.

#### Acceptance Criteria

1. THE DeliveryZones_Page SHALL display all Delivery_Zone records in a paginated or scrollable table with columns: Zone Level, State, City, Pincode, Area Name, Shipping Charge, Status, and Actions.
2. THE DeliveryZones_Page SHALL display a badge or label indicating the Zone Level (`State`, `City`, or `Pincode`) for each row.
3. THE DeliveryZones_Page SHALL provide a search input that filters the displayed zones by matching the search query against `state`, `city`, `pincode`, and `area_name` fields (case-insensitive).
4. WHEN the zone list is loading, THE DeliveryZones_Page SHALL display a loading indicator in place of the table.
5. WHEN the zone list is empty and no search is active, THE DeliveryZones_Page SHALL display the message "No delivery zones added yet".

---

### Requirement 6: Hierarchical Zone Resolution at Checkout

**User Story:** As a customer, I want the checkout to automatically determine whether my address is deliverable and what the shipping cost is, so that I get accurate shipping information without any manual lookup.

#### Acceptance Criteria

1. THE Zone_Resolver SHALL accept a customer address with fields: `state`, `city`, and `pincode`.
2. WHEN a customer address is provided, THE Zone_Resolver SHALL first search for an active Pincode_Zone where `pincode`, `state`, and `city` all match the customer address (case-insensitive).
3. WHEN no matching Pincode_Zone is found, THE Zone_Resolver SHALL search for an active City_Zone where `state` and `city` match the customer address (case-insensitive).
4. WHEN no matching City_Zone is found, THE Zone_Resolver SHALL search for an active State_Zone where `state` matches the customer address (case-insensitive).
5. WHEN a matching zone is found at any level, THE Zone_Resolver SHALL return `{ isServiceable: true, charge: <shipping_charge> }`.
6. WHEN no matching zone is found at any level, THE Zone_Resolver SHALL return `{ isServiceable: false, charge: 0 }`.
7. THE Zone_Resolver SHALL only match zones where `is_active = true`.

---

### Requirement 7: Backward Compatibility with Legacy Pincodes

**User Story:** As a system operator, I want the existing `delivery_pincodes` records to remain valid and continue to serve checkout requests, so that no data migration is required at launch.

#### Acceptance Criteria

1. THE Zone_Resolver SHALL query the `delivery_pincodes` Firestore collection as a fallback WHEN no match is found in the `delivery_zones` collection for a given pincode.
2. WHEN a Legacy_Pincode record matches the customer's pincode and `is_active = true`, THE Zone_Resolver SHALL return `{ isServiceable: true, charge: <shipping_charge> }`.
3. WHEN resolving shipping, THE Zone_Resolver SHALL apply the following full priority order: (1) active Pincode_Zone in `delivery_zones`, (2) active City_Zone in `delivery_zones`, (3) active State_Zone in `delivery_zones`, (4) active Legacy_Pincode in `delivery_pincodes`.
4. THE Admin_Panel SHALL continue to support the existing `delivery_pincodes` management UI and mutations without modification.

---

### Requirement 8: Shipping Charge Inheritance

**User Story:** As an admin, I want each zone level to carry its own shipping charge, so that I can charge differently for state-wide delivery vs. city delivery vs. pincode-level delivery.

#### Acceptance Criteria

1. THE Zone_Resolver SHALL return the `shipping_charge` from the most specific matching zone, not an aggregated or default value.
2. WHEN a Pincode_Zone matches, THE Zone_Resolver SHALL use the Pincode_Zone's `shipping_charge` regardless of whether a less specific zone also matches.
3. WHEN a City_Zone matches (and no Pincode_Zone matched), THE Zone_Resolver SHALL use the City_Zone's `shipping_charge`.
4. WHEN a State_Zone matches (and no Pincode_Zone or City_Zone matched), THE Zone_Resolver SHALL use the State_Zone's `shipping_charge`.
5. WHERE a `shipping_charge` of 0 is configured, THE Zone_Resolver SHALL return `{ isServiceable: true, charge: 0 }` indicating free delivery.

---

### Requirement 9: Firestore Security Rules for Delivery Zones

**User Story:** As a system operator, I want the `delivery_zones` collection to be protected so that only authenticated admins can write to it and the storefront can read it.

#### Acceptance Criteria

1. THE Firestore security rules SHALL allow read access to the `delivery_zones` collection for all authenticated users (to support storefront zone resolution).
2. THE Firestore security rules SHALL restrict write access (create, update, delete) to the `delivery_zones` collection to users with the `admin` role claim.
3. IF an unauthenticated request attempts to write to the `delivery_zones` collection, THEN THE Firestore security rules SHALL deny the request.
