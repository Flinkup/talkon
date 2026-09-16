import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EXPENSE_DATE_RANGE_KEY,
  readExpenseDateRange,
  writeExpenseDateRange,
} from './expenseListSession.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

test('stores and restores the expense screen date range for the session', () => {
  const storage = createStorage()
  writeExpenseDateRange({ from: '2026-09-01', to: '2026-09-16' }, storage)

  assert.deepEqual(readExpenseDateRange(storage), {
    from: '2026-09-01',
    to: '2026-09-16',
  })
})

test('removes the stored range when both dates are cleared', () => {
  const storage = createStorage()
  storage.setItem(EXPENSE_DATE_RANGE_KEY, '{"from":"2026-09-01","to":""}')

  writeExpenseDateRange({ from: '', to: '' }, storage)

  assert.equal(storage.getItem(EXPENSE_DATE_RANGE_KEY), null)
})

test('ignores malformed or invalid stored values', () => {
  const storage = createStorage()
  storage.setItem(EXPENSE_DATE_RANGE_KEY, '{"from":"not-a-date","to":42}')

  assert.deepEqual(readExpenseDateRange(storage), { from: '', to: '' })
})
