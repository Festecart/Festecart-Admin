export interface CsvSection {
  title: string
  headers: string[]
  rows: (string | number)[][]
}

function escapeCsv(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

export function downloadDashboardCsv(filename: string, sections: CsvSection[]) {
  const rows = sections.flatMap(section => [
    [escapeCsv(section.title)],
    section.headers.map(escapeCsv),
    ...section.rows.map(row => row.map(escapeCsv)),
    [],
  ])
  const blob = new Blob(['\uFEFF' + rows.map(row => row.join(',')).join('\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
