import test from 'node:test'
import assert from 'node:assert/strict'
import { getVatAmount, getVatRate } from './vat.js'

test('uses the VAT rate applicable on the expense date', () => {
  assert.equal(getVatRate('2024-12-31'), 0.17)
  assert.equal(getVatRate('2025-01-01'), 0.18)
})

test('extracts VAT from a VAT-inclusive total', () => {
  assert.equal(getVatAmount(117, '2024-12-31', true), 17)
  assert.equal(getVatAmount(118, '2025-01-01', true), 18)
})

test('excludes rows without VAT or a usable amount', () => {
  assert.equal(getVatAmount(118, '2025-01-01', false), 0)
  assert.equal(getVatAmount(null, '2025-01-01', true), 0)
  assert.equal(getVatAmount('not-a-number', '2025-01-01', true), 0)
})
