export function incomeDateToIso(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim())
  if (!match) return ''

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return ''

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day < 1 || day > daysInMonth[month - 1]) return ''

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isoToIncomeDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return ''

  const formatted = `${match[3]}/${match[2]}/${match[1]}`
  return incomeDateToIso(formatted) ? formatted : ''
}
