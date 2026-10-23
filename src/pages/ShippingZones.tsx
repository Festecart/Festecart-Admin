
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  db,
  collection,
  doc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  Timestamp,
} from '@/lib/firebase'
import { MoreVertical, Plus, Loader2 } from 'lucide-react'

interface ShippingZone {
  id: string
  name: string
  location: string | null
  remarks?: string
  is_active?: boolean
  created_at: string
}

interface ShippingMethod {
  id: string
  zone_id: string
  name: string
}

const EMPTY_ZONES: ShippingZone[] = []
const EMPTY_METHODS: ShippingMethod[] = []

function useShippingZones() {
  return useQuery({
    queryKey: ['shipping-zones'],
    queryFn: async () => {
      const snap = await getDocs(
        query(
          collection(db, 'shipping_zones'),
          orderBy('created_at', 'asc')
        )
      )

      return snap.docs.map(
        d => ({ id: d.id, ...d.data() } as ShippingZone)
      )
    },
  })
}

function useShippingMethods() {
  return useQuery({
    queryKey: ['shipping-methods-all'],
    queryFn: async () => {
      const snap = await getDocs(
        collection(db, 'shipping_methods')
      )

      return snap.docs.map(
        d => ({ id: d.id, ...d.data() } as ShippingMethod)
      )
    },
  })
}

function useDeleteZone() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'shipping_zones', id))
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping-zones'] })
      qc.invalidateQueries({ queryKey: ['shipping-methods-all'] })
    },
  })
}

function useToggleZoneActive() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      is_active,
    }: {
      id: string
      is_active: boolean
    }) => {
      await updateDoc(doc(db, 'shipping_zones', id), {
        is_active,
        updated_at: Timestamp.now(),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping-zones'] })
    },
  })
}

function ZoneMenu({
  zone,
  onClose,
  anchorRef,
}: {
  zone: ShippingZone
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const navigate = useNavigate()
  const deleteZone = useDeleteZone()
  const menuRef = useRef<HTMLDivElement>(null)

  const rect = anchorRef.current?.getBoundingClientRect()
  const top = (rect?.bottom ?? 0) + window.scrollY + 4
  const left = (rect?.right ?? 0) + window.scrollX - 144

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !anchorRef.current?.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handler)

    return () => {
      document.removeEventListener('mousedown', handler)
    }
  }, [anchorRef, onClose])

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top,
        left,
        zIndex: 9999,
        minWidth: 144,
      }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl py-1"
    >
      <button
        onClick={() => {
          navigate(`/shipping-zones/${zone.id}/methods`)
          onClose()
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
      >
        View Methods
      </button>

      <button
        onClick={() => {
          navigate(`/shipping-zones/${zone.id}/edit`)
          onClose()
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
      >
        Edit Zone
      </button>

      <button
        onClick={() => {
          navigate(`/shipping-zones/${zone.id}/methods/add`)
          onClose()
        }}
        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
      >
        Add Method
      </button>

      <button
        disabled={deleteZone.isPending}
        onClick={async () => {
          try {
            await deleteZone.mutateAsync(zone.id)
            onClose()
          } catch (error) {
            console.error(
              'Failed to delete shipping zone:',
              error
            )
          }
        }}
        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        {deleteZone.isPending ? 'Deleting...' : 'Delete Zone'}
      </button>

      {deleteZone.isError && (
        <p className="px-4 py-2 text-xs text-red-600">
          Failed to delete zone.
        </p>
      )}
    </div>,
    document.body
  )
}

export default function ShippingZones() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: zones = EMPTY_ZONES, isLoading } =
    useShippingZones()

  const { data: methods = EMPTY_METHODS } =
    useShippingMethods()

  const toggleZoneActive = useToggleZoneActive()

  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const [remarksDrafts, setRemarksDrafts] = useState<
    Record<string, string>
  >({})

  const [activeRemarksId, setActiveRemarksId] = useState<
    string | null
  >(null)

  const [savingRemarks, setSavingRemarks] = useState<
    Record<string, boolean>
  >({})

  const [saveErrors, setSaveErrors] = useState<
    Record<string, string>
  >({})

  const [saveSuccess, setSaveSuccess] = useState<
    Record<string, string>
  >({})

  const btnRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({})

  const methodCount = useCallback(
    (zoneId: string) =>
      methods.filter(method => method.zone_id === zoneId).length,
    [methods]
  )

  const autoResizeTextarea = (
    textarea: HTMLTextAreaElement
  ) => {
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  const handleSaveRemarks = async (zone: ShippingZone) => {
    const newRemarks =
      remarksDrafts[zone.id] ?? zone.remarks ?? ''

    const originalRemarks = zone.remarks ?? ''

    if (newRemarks === originalRemarks) {
      setActiveRemarksId(current =>
        current === zone.id ? null : current
      )
      return
    }

    setSavingRemarks(previous => ({
      ...previous,
      [zone.id]: true,
    }))

    setSaveErrors(previous => ({
      ...previous,
      [zone.id]: '',
    }))

    setSaveSuccess(previous => ({
      ...previous,
      [zone.id]: '',
    }))

    try {
      await updateDoc(doc(db, 'shipping_zones', zone.id), {
        remarks: newRemarks,
        updated_at: Timestamp.now(),
      })

      setRemarksDrafts(previous => ({
        ...previous,
        [zone.id]: newRemarks,
      }))

      setSaveSuccess(previous => ({
        ...previous,
        [zone.id]: 'Remarks saved successfully.',
      }))

      setActiveRemarksId(current =>
        current === zone.id ? null : current
      )

      await queryClient.invalidateQueries({
        queryKey: ['shipping-zones'],
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.'

      setSaveErrors(previous => ({
        ...previous,
        [zone.id]: `Failed to save remarks: ${message}`,
      }))
    } finally {
      setSavingRemarks(previous => ({
        ...previous,
        [zone.id]: false,
      }))
    }
  }

  const handleCancelRemarks = (zone: ShippingZone) => {
    setRemarksDrafts(previous => ({
      ...previous,
      [zone.id]: zone.remarks ?? '',
    }))

    setSaveErrors(previous => ({
      ...previous,
      [zone.id]: '',
    }))

    setSaveSuccess(previous => ({
      ...previous,
      [zone.id]: '',
    }))

    setActiveRemarksId(current =>
      current === zone.id ? null : current
    )
  }

  const handleRemarksBlur = (zone: ShippingZone) => {
    const savedRemarks = zone.remarks ?? ''
    const currentDraft =
      remarksDrafts[zone.id] ?? savedRemarks

    if (currentDraft === savedRemarks) {
      setActiveRemarksId(current =>
        current === zone.id ? null : current
      )
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-1">
            <Link to="/" className="hover:underline">
              Dashboard
            </Link>{' '}
            / Shipping Zones
          </p>

          <h1 className="text-2xl font-bold text-gray-900">
            Shipping Zones
          </h1>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate('/shipping-zones/vendors')}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Courier Vendors
          </button>

          <button
            onClick={() => navigate('/shipping-zones/add')}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            <Plus size={14} />
            Add Shipping Zone
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400">
            <Loader2 className="animate-spin inline" size={20} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Zone
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Location
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Shipping Methods
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase min-w-[260px]">
                      Remarks
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                  {zones.map(zone => {
                    const count = methodCount(zone.id)
                    const isActive = zone.is_active !== false

                    const savedRemarks = zone.remarks ?? ''
                    const draftRemarks =
                      remarksDrafts[zone.id] ?? savedRemarks

                    const hasChanges =
                      draftRemarks !== savedRemarks

                    const isSaving =
                      savingRemarks[zone.id] ?? false

                    const showSaveOptions =
                      activeRemarksId === zone.id ||
                      hasChanges

                    return (
                      <tr
                        key={zone.id}
                        className="hover:bg-gray-50"
                      >
                        <td className="px-5 py-3 align-top">
                          <button
                            onClick={() =>
                              navigate(
                                `/shipping-zones/${zone.id}/edit`
                              )
                            }
                            className="font-medium text-gray-900 hover:text-gray-600 hover:underline text-left"
                          >
                            {zone.name}
                          </button>
                        </td>

                        <td className="px-5 py-3 text-gray-400 text-xs align-top">
                          {zone.location || ''}
                        </td>

                        <td className="px-5 py-3 align-top">
                          {count > 0 ? (
                            <button
                              onClick={() =>
                                navigate(
                                  `/shipping-zones/${zone.id}/methods`
                                )
                              }
                              className="text-xs text-gray-500 hover:underline"
                            >
                              {count} Shipping Method
                              {count !== 1 ? 's' : ''}
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                navigate(
                                  `/shipping-zones/${zone.id}/methods/add`
                                )
                              }
                              className="text-xs text-gray-700 hover:underline font-medium"
                            >
                              Add Shipping Method
                            </button>
                          )}
                        </td>

                        <td className="px-5 py-3 align-top">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isActive}
                              aria-label={`${isActive ? 'Disable' : 'Enable'} ${zone.name}`}
                              disabled={
                                toggleZoneActive.isPending &&
                                toggleZoneActive.variables?.id === zone.id
                              }
                              onClick={() => {
                                toggleZoneActive.reset()
                                toggleZoneActive.mutate({
                                  id: zone.id,
                                  is_active: !isActive,
                                })
                              }}
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${isActive
                                  ? 'bg-green-500'
                                  : 'bg-gray-300'
                                }`}
                            >
                              <span
                                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${isActive
                                    ? 'translate-x-5'
                                    : 'translate-x-1'
                                  }`}
                              />
                            </button>

                            <span
                              className={`text-xs font-medium ${isActive
                                  ? 'text-green-700'
                                  : 'text-gray-500'
                                }`}
                            >
                              {isActive ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                        </td>

                        {/* Editable Remarks column */}
                        <td className="px-5 py-3 min-w-[260px] max-w-[360px] align-top">
                          <div className="space-y-2">
                            <textarea
                              rows={1}
                              maxLength={1000}
                              value={draftRemarks}
                              placeholder="Enter remarks..."
                              disabled={isSaving}
                              onFocus={() => {
                                setActiveRemarksId(zone.id)
                              }}
                              onBlur={() => {
                                handleRemarksBlur(zone)
                              }}
                              onChange={event => {
                                const textarea =
                                  event.currentTarget

                                const value = textarea.value

                                setRemarksDrafts(previous => ({
                                  ...previous,
                                  [zone.id]: value,
                                }))

                                setSaveErrors(previous => ({
                                  ...previous,
                                  [zone.id]: '',
                                }))

                                setSaveSuccess(previous => ({
                                  ...previous,
                                  [zone.id]: '',
                                }))

                                autoResizeTextarea(textarea)
                              }}
                              ref={element => {
                                if (element) {
                                  autoResizeTextarea(element)
                                }
                              }}
                              className="block w-full min-h-[38px] resize-none overflow-hidden rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-300 disabled:bg-gray-100"
                            />

                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs text-gray-400">
                                {draftRemarks.length}/1000
                              </span>

                              {showSaveOptions && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={isSaving}
                                    onMouseDown={event =>
                                      event.preventDefault()
                                    }
                                    onClick={() =>
                                      handleCancelRemarks(zone)
                                    }
                                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>

                                  <button
                                    type="button"
                                    disabled={
                                      isSaving || !hasChanges
                                    }
                                    onMouseDown={event =>
                                      event.preventDefault()
                                    }
                                    onClick={() =>
                                      handleSaveRemarks(zone)
                                    }
                                    className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                                  >
                                    {isSaving && (
                                      <Loader2
                                        size={12}
                                        className="animate-spin"
                                      />
                                    )}
                                    {isSaving
                                      ? 'Saving...'
                                      : 'Save'}
                                  </button>
                                </div>
                              )}
                            </div>

                            {saveErrors[zone.id] && (
                              <p
                                role="alert"
                                className="text-xs text-red-600 break-words"
                              >
                                {saveErrors[zone.id]}
                              </p>
                            )}

                            {saveSuccess[zone.id] && (
                              <p
                                role="status"
                                className="text-xs text-green-600"
                              >
                                {saveSuccess[zone.id]}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-3 text-right align-top">
                          <button
                            ref={element => {
                              btnRefs.current[zone.id] = element
                            }}
                            onClick={event => {
                              event.stopPropagation()
                              setMenuOpen(current =>
                                current === zone.id
                                  ? null
                                  : zone.id
                              )
                            }}
                            aria-label={`Actions for ${zone.name}`}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {menuOpen === zone.id && (
                            <ZoneMenu
                              zone={zone}
                              onClose={() =>
                                setMenuOpen(null)
                              }
                              anchorRef={{
                                get current() {
                                  return btnRefs.current[zone.id]
                                },
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    )
                  })}

                  {toggleZoneActive.isError && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-3 text-sm text-red-700 bg-red-50"
                        role="alert"
                      >
                        Could not update shipping zone status:{' '}
                        {(toggleZoneActive.error as Error).message}
                      </td>
                    </tr>
                  )}

                  {zones.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-5 py-10 text-center text-gray-400"
                      >
                        No shipping zones yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
