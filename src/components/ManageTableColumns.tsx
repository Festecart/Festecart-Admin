import { useEffect, useMemo, useRef, useState } from 'react'
import { Columns3, GripVertical, RotateCcw } from 'lucide-react'

export interface TableColumnOption {
  id: string
  label: string
  canHide?: boolean
}

interface StoredColumnPreferences {
  order: string[]
  hidden: string[]
}

export interface TableColumnPreferences {
  allColumns: TableColumnOption[]
  columns: TableColumnOption[]
  hiddenColumnIds: ReadonlySet<string>
  isLoaded: boolean
  error: string
  toggleColumn: (id: string) => void
  moveColumn: (sourceId: string, targetId: string) => void
  showAll: () => void
  hideAllButOne: () => void
  reset: () => void
  canHideColumn: (id: string) => boolean
}

export function useTableColumnPreferences(
  storageKey: string,
  columnOptions: TableColumnOption[],
): TableColumnPreferences {
  const defaultOrder = useMemo(
    () => columnOptions.map(column => column.id),
    [columnOptions],
  )
  const [order, setOrder] = useState(defaultOrder)
  const [hiddenColumnIds, setHiddenColumnIds] = useState<Set<string>>(() => new Set())
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (saved) {
        const parsed: unknown = JSON.parse(saved)
        if (
          !parsed ||
          typeof parsed !== 'object' ||
          !Array.isArray((parsed as StoredColumnPreferences).order) ||
          !Array.isArray((parsed as StoredColumnPreferences).hidden)
        ) {
          throw new Error('Saved column preferences have an invalid format.')
        }

        const settings = parsed as StoredColumnPreferences
        const knownIds = new Set(defaultOrder)
        const savedOrder = settings.order.filter(
          (id): id is string => typeof id === 'string' && knownIds.has(id),
        )
        const nextOrder = [
          ...new Set(savedOrder),
          ...defaultOrder.filter(id => !savedOrder.includes(id)),
        ]
        const hideableIds = new Set(
          columnOptions.filter(column => column.canHide !== false).map(column => column.id),
        )
        const nextHidden = new Set(
          settings.hidden.filter(
            (id): id is string => typeof id === 'string' && hideableIds.has(id),
          ),
        )
        const visibleHideableIds = defaultOrder.filter(
          id => hideableIds.has(id) && !nextHidden.has(id),
        )
        if (visibleHideableIds.length === 0 && defaultOrder.length > 0) {
          nextHidden.delete(defaultOrder.find(id => hideableIds.has(id)) ?? '')
        }

        setOrder(nextOrder)
        setHiddenColumnIds(nextHidden)
      }
      setError('')
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? `Could not load saved column preferences: ${loadError.message}`
          : 'Could not load saved column preferences.',
      )
    } finally {
      setIsLoaded(true)
    }
  }, [columnOptions, defaultOrder, storageKey])

  useEffect(() => {
    if (!isLoaded) return

    try {
      const saved: StoredColumnPreferences = {
        order,
        hidden: [...hiddenColumnIds],
      }
      window.localStorage.setItem(storageKey, JSON.stringify(saved))
      setError('')
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? `Could not save column preferences: ${saveError.message}`
          : 'Could not save column preferences.',
      )
    }
  }, [hiddenColumnIds, isLoaded, order, storageKey])

  const toggleColumn = (id: string) => {
    const option = columnOptions.find(column => column.id === id)
    if (!option || option.canHide === false) return

    setHiddenColumnIds(current => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        const visibleCount = columnOptions.filter(
          column => column.canHide !== false && !current.has(column.id),
        ).length
        if (visibleCount <= 1) return current
        next.add(id)
      }
      return next
    })
  }

  const moveColumn = (sourceId: string, targetId: string) => {
    setOrder(current => {
      const sourceIndex = current.indexOf(sourceId)
      const targetIndex = current.indexOf(targetId)
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current
      const next = [...current]
      next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, sourceId)
      return next
    })
  }

  const reset = () => {
    setOrder(defaultOrder)
    setHiddenColumnIds(new Set())
  }

  const showAll = () => setHiddenColumnIds(new Set())

  const hideAllButOne = () => {
    const hideableIds = columnOptions
      .filter(column => column.canHide !== false)
      .map(column => column.id)
    if (hideableIds.length <= 1) return
    setHiddenColumnIds(new Set(hideableIds.slice(1)))
  }

  const optionsById = new Map(columnOptions.map(column => [column.id, column]))
  const allColumns = order
    .map(id => optionsById.get(id))
    .filter((column): column is TableColumnOption => Boolean(column))
  const visibleColumns = allColumns
    .filter(column => !hiddenColumnIds.has(column.id))
  const visibleHideableCount = columnOptions.filter(
    column => column.canHide !== false && !hiddenColumnIds.has(column.id),
  ).length

  return {
    allColumns,
    columns: visibleColumns,
    hiddenColumnIds,
    isLoaded,
    error,
    toggleColumn,
    moveColumn,
    showAll,
    hideAllButOne,
    reset,
    canHideColumn: id => {
      const column = optionsById.get(id)
      return Boolean(
        column &&
        column.canHide !== false &&
        (hiddenColumnIds.has(id) || visibleHideableCount > 1),
      )
    },
  }
}

export function ManageTableColumns({
  preferences,
}: {
  preferences: TableColumnPreferences
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return
      setIsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Columns3 size={15} />
        Manage Columns
      </button>
      {isOpen && (
        <div
          role="dialog"
          aria-label="Manage table columns"
          className="absolute right-0 z-30 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
        >
          <p className="mb-2 text-xs text-gray-500">
            Drag columns to change their left-to-right order.
          </p>
          {preferences.error && (
            <p role="alert" className="mb-2 text-xs text-red-600">
              {preferences.error}
            </p>
          )}
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {preferences.allColumns.map(column => {
              const isVisible = !preferences.hiddenColumnIds.has(column.id)
              const canHide = preferences.canHideColumn(column.id)
              return (
                <div
                  key={column.id}
                  draggable={preferences.isLoaded}
                  onDragStart={event => {
                    event.dataTransfer.setData('text/plain', column.id)
                    event.dataTransfer.effectAllowed = 'move'
                    setDraggedColumnId(column.id)
                  }}
                  onDragOver={event => {
                    if (draggedColumnId) event.preventDefault()
                  }}
                  onDrop={event => {
                    event.preventDefault()
                    const sourceId = event.dataTransfer.getData('text/plain') || draggedColumnId
                    if (sourceId) preferences.moveColumn(sourceId, column.id)
                    setDraggedColumnId(null)
                  }}
                  onDragEnd={() => setDraggedColumnId(null)}
                  className={`flex items-center gap-2 rounded-md px-2 py-2 ${
                    draggedColumnId === column.id ? 'opacity-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <GripVertical
                    size={15}
                    className="shrink-0 cursor-grab text-gray-400"
                    aria-hidden="true"
                  />
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      disabled={!canHide || !preferences.isLoaded}
                      onChange={() => preferences.toggleColumn(column.id)}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    />
                    <span className="truncate">{column.label}</span>
                  </label>
                  {column.canHide === false && (
                    <span className="text-[10px] text-gray-400">Required</span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-2 flex gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={preferences.showAll}
              disabled={!preferences.isLoaded || preferences.hiddenColumnIds.size === 0}
              className="flex-1 rounded-md border border-gray-200 px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={preferences.hideAllButOne}
              disabled={
                !preferences.isLoaded ||
                preferences.allColumns.filter(column => column.canHide !== false).length <= 1 ||
                preferences.allColumns.filter(
                  column => column.canHide !== false && !preferences.hiddenColumnIds.has(column.id),
                ).length <= 1
              }
              title="Hide all optional columns except one"
              className="flex-1 rounded-md border border-gray-200 px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
            >
              Remove All
            </button>
          </div>
          <button
            type="button"
            onClick={preferences.reset}
            disabled={!preferences.isLoaded}
            className="mt-2 flex w-full items-center justify-center gap-2 border-t border-gray-100 pt-3 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Reset to Default
          </button>
        </div>
      )}
    </div>
  )
}
