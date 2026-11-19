import { useState } from 'react'
import type { DashboardDateRange } from '@/types/moduleDashboards'

export function useDashboardDateRange() {
  return useState<DashboardDateRange>(() => {
    const to = new Date()
    to.setHours(23, 59, 59, 999)
    const from = new Date()
    from.setDate(from.getDate() - 29)
    from.setHours(0, 0, 0, 0)
    return { from, to }
  })
}
