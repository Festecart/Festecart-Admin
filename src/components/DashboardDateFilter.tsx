import { useState } from 'react'
import type { DashboardDateRange } from '@/types/moduleDashboards'

type Preset = '7d' | '30d' | '90d' | 'custom'

const PRESETS: { value: Preset; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'custom', label: 'Custom' },
]

function toInputDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromInputDate(value: string, endOfDay: boolean): Date {
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
  return date
}

export function DashboardDateFilter({
  range,
  onChange,
}: {
  range: DashboardDateRange
  onChange: (range: DashboardDateRange) => void
}) {
  const [preset, setPreset] = useState<Preset>('30d')

  const selectPreset = (selected: Preset) => {
    setPreset(selected)
    if (selected === 'custom') return

    const days = Number.parseInt(selected, 10)
    const to = new Date()
    to.setHours(23, 59, 59, 999)
    const from = new Date()
    from.setDate(from.getDate() - days + 1)
    from.setHours(0, 0, 0, 0)
    onChange({ from, to })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(option => (
          <button
            key={option.value}
            type="button"
            aria-pressed={preset === option.value}
            onClick={() => selectPreset(option.value)}
            className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
              preset === option.value
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            From
            <input
              aria-label="Start date"
              type="date"
              value={toInputDate(range.from)}
              max={toInputDate(range.to)}
              onChange={event => {
                if (!event.target.value) return
                onChange({ ...range, from: fromInputDate(event.target.value, false) })
              }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            To
            <input
              aria-label="End date"
              type="date"
              value={toInputDate(range.to)}
              min={toInputDate(range.from)}
              onChange={event => {
                if (!event.target.value) return
                onChange({ ...range, to: fromInputDate(event.target.value, true) })
              }}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-xs text-gray-700"
            />
          </label>
        </>
      )}
    </div>
  )
}
