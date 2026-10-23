
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
    Download,
    Loader2,
    Users,
    Search,
    X,
} from 'lucide-react'

type Data = Record<string, unknown>

type RecordItem = {
    id: string
    data: Data
}

interface Customer {
    id: string
    uid: string
    name: string
    phone: string
    email: string
    billing_address: string
    shipping_address: string
    shipping_pin_code: string
    no_of_orders: number
    no_of_products: number
    business_value: number
}

type CustomerDetails = {
    uid: string
    name: string
    phone: string
    email: string
    billing_address: string
    shipping_address: string
    shipping_pin_code: string
}

const HEADERS = [
    'Name',
    'Ph',
    'Email',
    'Billing Address',
    'Shipping Address',
    'Shipping Pin Code',
    'No of Orders',
    'No of Products',
    'Business Value',
]

function obj(value: unknown): Data {
    if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
    ) {
        return value as Data
    }

    return {}
}

function str(value: unknown): string {
    if (typeof value === 'string') {
        return value.trim()
    }

    if (typeof value === 'number') {
        return String(value)
    }

    return ''
}

function first(...values: unknown[]): string {
    for (const value of values) {
        const result = str(value)

        if (result) return result
    }

    return ''
}

function formatAddress(value: unknown): string {
    if (typeof value === 'string') {
        return value.trim()
    }

    const a = obj(value)

    return [
        first(
            a.address,
            a.line1,
            a.address1,
            a.street
        ),
        first(
            a.line2,
            a.address2
        ),
        first(a.landmark),
        first(a.city),
        first(a.state),
        first(
            a.pincode,
            a.pin_code,
            a.postal_code
        ),
    ]
        .filter(Boolean)
        .join(', ')
}

function phoneKey(value: string): string {
    let digits = value.replace(/\D/g, '')

    if (
        digits.length === 12 &&
        digits.startsWith('91')
    ) {
        digits = digits.slice(2)
    }

    if (
        digits.length === 11 &&
        digits.startsWith('0')
    ) {
        digits = digits.slice(1)
    }

    return digits.length === 10 ? digits : ''
}

function numberValue(value: unknown): number {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0
    }

    const parsed = Number(
        str(value).replace(/[₹,\s]/g, '')
    )

    return Number.isFinite(parsed) ? parsed : 0
}

function timeValue(value: unknown): number {
    const timestamp = obj(value)

    if (typeof timestamp.seconds === 'number') {
        return timestamp.seconds * 1000
    }

    if (value instanceof Date) {
        return value.getTime()
    }

    const parsed = Date.parse(str(value))

    return Number.isFinite(parsed) ? parsed : 0
}

function isCancelledOrder(data: Data): boolean {
    const status = first(data.status).toLowerCase()

    return (
        status === 'cancelled' ||
        status === 'canceled'
    )
}

function countProducts(order: Data): number {
    const items = Array.isArray(order.items)
        ? order.items
        : []

    return items.reduce(
        (total: number, item: unknown) => {
            const product = obj(item)

            const quantity = numberValue(
                product.quantity ?? 1
            )

            return total + Math.max(0, quantity)
        },
        0
    )
}

function detailsFromData(data: Data): CustomerDetails {
    const shipping = obj(data.shipping_address)

    return {
        uid: first(
            data.user_id,
            data.customer_id,
            data.uid
        ),

        name: first(
            data.guest_name,
            data.full_name,
            data.display_name,
            data.name,
            shipping.name
        ),

        phone: first(
            data.guest_phone,
            data.phone,
            data.phone_number,
            data.mobile,
            shipping.phone
        ),

        email: first(
            data.guest_email,
            data.customer_email,
            data.email
        ),

        billing_address: first(
            formatAddress(data.billing_address),
            formatAddress(data.billingAddress)
        ),

        shipping_address: first(
            formatAddress(data.shipping_address),
            formatAddress(data.shippingAddress)
        ),

        shipping_pin_code: first(
            data.shipping_pin_code,
            data.shipping_pincode,
            shipping.pincode,
            shipping.pin_code,
            data.pincode
        ),
    }
}

function buildCustomers(
    profiles: RecordItem[],
    orders: RecordItem[]
): Customer[] {
    type Entry = {
        id: string
        details: CustomerDetails
        data: Data
        isOrder: boolean
        time: number
    }

    // Cancelled orders are excluded.
    const validOrders = orders.filter(
        order => !isCancelledOrder(order.data)
    )

    const entries: Entry[] = [
        ...validOrders.map(order => ({
            id: `order:${order.id}`,
            details: detailsFromData(order.data),
            data: order.data,
            isOrder: true,
            time: timeValue(order.data.created_at),
        })),

        ...profiles.map(profile => ({
            id: `profile:${profile.id}`,
            details: {
                ...detailsFromData(profile.data),
                uid: profile.id,
            },
            data: profile.data,
            isOrder: false,
            time: Number.MAX_SAFE_INTEGER,
        })),
    ]

    const parent = entries.map((_, index) => index)

    const members = entries.map(
        (_, index) => [index]
    )

    const find = (index: number): number => {
        if (parent[index] !== index) {
            parent[index] = find(parent[index])
        }

        return parent[index]
    }

    const groupUIDs = (root: number): Set<string> =>
        new Set(
            members[root]
                .map(index => entries[index].details.uid)
                .filter(Boolean)
        )

    const merge = (a: number, b: number) => {
        const rootA = find(a)
        const rootB = find(b)

        if (rootA === rootB) return

        const uidsA = groupUIDs(rootA)
        const uidsB = groupUIDs(rootB)

        // Different authenticated accounts stay separate.
        if (
            uidsA.size > 0 &&
            uidsB.size > 0 &&
            [...uidsA].some(uid => !uidsB.has(uid))
        ) {
            return
        }

        parent[rootB] = rootA

        members[rootA].push(
            ...members[rootB]
        )

        members[rootB] = []
    }

    const identities = new Map<string, number[]>()

    entries.forEach((entry, index) => {
        const phone = phoneKey(entry.details.phone)
        const email = entry.details.email.toLowerCase()
        const uid = entry.details.uid

        const keys = [
            uid ? `uid:${uid}` : '',
            phone ? `phone:${phone}` : '',
            email ? `email:${email}` : '',
        ].filter(Boolean)

        for (const key of keys) {
            const matches = identities.get(key) ?? []

            for (const other of matches) {
                merge(index, other)
            }

            matches.push(index)
            identities.set(key, matches)
        }
    })

    const grouped = new Map<number, Entry[]>()

    entries.forEach((entry, index) => {
        const root = find(index)
        const group = grouped.get(root) ?? []

        group.push(entry)
        grouped.set(root, group)
    })

    const customers: Customer[] = []

    for (const group of grouped.values()) {
        const customer: Customer = {
            id: group[0].id,
            uid: '',
            name: '',
            phone: '',
            email: '',
            billing_address: '',
            shipping_address: '',
            shipping_pin_code: '',
            no_of_orders: 0,
            no_of_products: 0,
            business_value: 0,
        }

        // Apply older orders first, current profile last.
        group.sort((a, b) => a.time - b.time)

        for (const entry of group) {
            const details = entry.details

            if (details.uid) {
                customer.uid = details.uid
            }

            if (details.name) {
                customer.name = details.name
            }

            if (details.phone) {
                customer.phone = details.phone
            }

            if (details.email) {
                customer.email = details.email
            }

            if (details.billing_address) {
                customer.billing_address =
                    details.billing_address
            }

            if (details.shipping_address) {
                customer.shipping_address =
                    details.shipping_address
            }

            if (details.shipping_pin_code) {
                customer.shipping_pin_code =
                    details.shipping_pin_code
            }

            if (entry.isOrder) {
                customer.no_of_orders += 1

                customer.no_of_products +=
                    countProducts(entry.data)

                customer.business_value +=
                    numberValue(entry.data.total)
            }
        }

        customers.push(customer)
    }

    // NEW: Remove completely empty customer rows.
    return customers
        .filter(customer =>
            customer.name.trim() !== '' ||
            customer.phone.trim() !== '' ||
            customer.email.trim() !== ''
        )
        .sort((a, b) =>
            a.name.localeCompare(b.name)
        )
}

function csvValue(value: unknown): string {
    let text = String(value ?? '')

    if (/^\s*[=+\-@]/.test(text)) {
        text = `'${text}`
    }

    return `"${text.replace(/"/g, '""')}"`
}

export default function Customers() {
    const [orders, setOrders] =
        useState<RecordItem[]>([])

    const [profiles, setProfiles] =
        useState<RecordItem[]>([])

    const [ordersLoading, setOrdersLoading] =
        useState(true)

    const [profilesLoading, setProfilesLoading] =
        useState(true)

    const [ordersError, setOrdersError] =
        useState('')

    const [profilesError, setProfilesError] =
        useState('')

    const [search, setSearch] =
        useState('')

    // Listen for previous and new orders.
    useEffect(() => {
        const stopOrders = onSnapshot(
            collection(db, 'orders'),

            snapshot => {
                setOrders(
                    snapshot.docs.map(item => ({
                        id: item.id,
                        data: item.data() as Data,
                    }))
                )

                setOrdersError('')
                setOrdersLoading(false)
            },

            error => {
                setOrdersError(error.message)
                setOrdersLoading(false)
            }
        )

        // Listen for customer profile updates.
        const stopProfiles = onSnapshot(
            collection(db, 'user_profiles'),

            snapshot => {
                setProfiles(
                    snapshot.docs.map(item => ({
                        id: item.id,
                        data: item.data() as Data,
                    }))
                )

                setProfilesError('')
                setProfilesLoading(false)
            },

            error => {
                setProfilesError(error.message)
                setProfilesLoading(false)
            }
        )

        return () => {
            stopOrders()
            stopProfiles()
        }
    }, [])

    const loading =
        ordersLoading || profilesLoading

    const validOrders = useMemo(
        () =>
            orders.filter(
                order => !isCancelledOrder(order.data)
            ),
        [orders]
    )

    const customers = useMemo(
        () => buildCustomers(profiles, orders),
        [profiles, orders]
    )

    // Search by name, phone or email.
    const filteredCustomers = useMemo(() => {
        const term = search.trim().toLowerCase()

        if (!term) return customers

        const digits = search.replace(/\D/g, '')

        return customers.filter(customer => {
            const nameMatch = customer.name
                .toLowerCase()
                .includes(term)

            const emailMatch = customer.email
                .toLowerCase()
                .includes(term)

            const phoneMatch =
                digits.length > 0 &&
                customer.phone
                    .replace(/\D/g, '')
                    .includes(digits)

            return nameMatch || emailMatch || phoneMatch
        })
    }, [customers, search])

    const totalProducts = useMemo(
        () =>
            customers.reduce(
                (sum, customer) =>
                    sum + customer.no_of_products,
                0
            ),
        [customers]
    )

    const totalBusiness = useMemo(
        () =>
            customers.reduce(
                (sum, customer) =>
                    sum + customer.business_value,
                0
            ),
        [customers]
    )

    const currency = (value: number) =>
        `₹${value.toLocaleString('en-IN', {
            maximumFractionDigits: 2,
        })}`

    function exportCustomers() {
        const rows = filteredCustomers.map(customer => [
            customer.name,
            customer.phone,
            customer.email,
            customer.billing_address,
            customer.shipping_address,
            customer.shipping_pin_code,
            customer.no_of_orders,
            customer.no_of_products,
            customer.business_value,
        ])

        const csv =
            '\uFEFF' +
            [HEADERS, ...rows]
                .map(row =>
                    row.map(csvValue).join(',')
                )
                .join('\r\n')

        const blob = new Blob([csv], {
            type: 'text/csv;charset=utf-8;',
        })

        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')

        link.href = url
        link.download = 'festecart_customers.csv'

        document.body.appendChild(link)
        link.click()
        link.remove()

        window.setTimeout(
            () => URL.revokeObjectURL(url),
            1000
        )
    }

    return (
        <div className="p-6 space-y-5">

            {/* Page Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">

                <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                        Customers
                    </h1>

                    <p className="mt-1 text-sm text-gray-500">
                        {loading
                            ? 'Loading customers...'
                            : `${customers.length} customers`}
                    </p>
                </div>

                {/* Search and Export */}
                <div className="flex flex-wrap items-center gap-2">

                    <div className="relative w-full sm:w-72">
                        <Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />

                        <input
                            type="text"
                            value={search}
                            onChange={event =>
                                setSearch(event.target.value)
                            }
                            placeholder="Search name, phone, email..."
                            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                        />

                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Clear search"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                            >
                                <X size={15} />
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={exportCustomers}
                        disabled={
                            loading ||
                            !!ordersError ||
                            !!profilesError
                        }
                        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <Download size={16} />
                        Export CSV
                    </button>

                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">

                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <p className="text-sm text-gray-500">
                        Total Customers
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                        {customers.length}
                    </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <p className="text-sm text-gray-500">
                        Total Orders
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                        {validOrders.length}
                    </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <p className="text-sm text-gray-500">
                        Total Products
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                        {totalProducts}
                    </p>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-5">
                    <p className="text-sm text-gray-500">
                        Business Value
                    </p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                        {currency(totalBusiness)}
                    </p>
                </div>

            </div>

            {/* Error Messages */}
            {(ordersError || profilesError) && (
                <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {ordersError && (
                        <p>Orders: {ordersError}</p>
                    )}

                    {profilesError && (
                        <p>Customer profiles: {profilesError}</p>
                    )}
                </div>
            )}

            {/* Customer Table with Sticky Header */}
            <div className="rounded-xl border border-gray-200 bg-white">

                <div className="max-h-[75vh] overflow-auto rounded-xl">

                    <table className="w-full min-w-[1450px] text-left text-sm">

                        <thead className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 shadow-sm">
                            <tr>
                                {HEADERS.map(header => (
                                    <th
                                        key={header}
                                        scope="col"
                                        className="bg-gray-50 px-4 py-3 text-xs font-semibold uppercase text-gray-500"
                                    >
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">

                            {loading ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="p-10 text-center"
                                    >
                                        <Loader2
                                            size={22}
                                            className="inline animate-spin"
                                        />
                                    </td>
                                </tr>
                            ) : ordersError ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="p-10 text-center text-red-600"
                                    >
                                        Unable to load customer orders
                                    </td>
                                </tr>
                            ) : filteredCustomers.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="p-10 text-center text-gray-400"
                                    >
                                        <Users
                                            size={26}
                                            className="mx-auto mb-2"
                                        />

                                        {search
                                            ? 'No customers match your search'
                                            : 'No customers found'}
                                    </td>
                                </tr>
                            ) : (
                                filteredCustomers.map(customer => (
                                    <tr
                                        key={customer.id}
                                        className="hover:bg-gray-50"
                                    >

                                        <td className="px-4 py-4 font-medium text-gray-900">
                                            {customer.name || '—'}
                                        </td>

                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {customer.phone || '—'}
                                        </td>

                                        <td className="px-4 py-4">
                                            {customer.email || '—'}
                                        </td>

                                        <td className="px-4 py-4 min-w-[220px] max-w-[350px] whitespace-pre-wrap break-words align-top">
                                            {customer.billing_address || '—'}
                                        </td>

                                        <td className="px-4 py-4 min-w-[220px] max-w-[350px] whitespace-pre-wrap break-words align-top">
                                            {customer.shipping_address || '—'}
                                        </td>

                                        <td className="px-4 py-4 whitespace-nowrap">
                                            {customer.shipping_pin_code || '—'}
                                        </td>

                                        <td className="px-4 py-4 font-medium">
                                            {customer.no_of_orders}
                                        </td>

                                        <td className="px-4 py-4 font-medium">
                                            {customer.no_of_products}
                                        </td>

                                        <td className="px-4 py-4 font-semibold whitespace-nowrap">
                                            {currency(customer.business_value)}
                                        </td>

                                    </tr>
                                ))
                            )}

                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
