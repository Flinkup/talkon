export const EXPENSE_DATE_RANGE_KEY = 'talkon:expenses:date-range'

const emptyDateRange = { from: '', to: '' }
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function cleanDate(value) {
  return typeof value === 'string' && datePattern.test(value) ? value : ''
}

function resolveStorage(storage) {
  if (storage) return storage
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function readExpenseDateRange(storage) {
  storage = resolveStorage(storage)
  if (!storage) return emptyDateRange

  try {
    const stored = JSON.parse(storage.getItem(EXPENSE_DATE_RANGE_KEY))
    return {
      from: cleanDate(stored?.from),
      to: cleanDate(stored?.to),
    }
  } catch {
    return emptyDateRange
  }
}

export function writeExpenseDateRange(range, storage) {
  storage = resolveStorage(storage)
  if (!storage) return

  const next = {
    from: cleanDate(range?.from),
    to: cleanDate(range?.to),
  }

  try {
    if (!next.from && !next.to) {
      storage.removeItem(EXPENSE_DATE_RANGE_KEY)
      return
    }
    storage.setItem(EXPENSE_DATE_RANGE_KEY, JSON.stringify(next))
  } catch {
    // Storage may be unavailable in privacy-restricted browser contexts.
  }
}
