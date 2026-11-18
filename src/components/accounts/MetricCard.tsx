import type { ReactNode } from 'react'

export function MetricCard({
  label,
  value,
  icon,
  tone = 'slate',
}: {
  label: string
  value: string
  icon: ReactNode
  tone?: 'slate' | 'green' | 'red' | 'blue' | 'amber'
}) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700',
    red: 'bg-rose-50 text-rose-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  }
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-4 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{value}</p>
    </article>
  )
}
