const VAT_RATE_CHANGE_DATE = '2025-01-01'

// Israel's standard VAT rate rose from 17% to 18% on 1 January 2025.
export function getVatRate(expenseDate) {
  return expenseDate >= VAT_RATE_CHANGE_DATE ? 0.18 : 0.17
}

// amountIls is stored as the invoice total, so the VAT component is extracted
// from the VAT-inclusive amount rather than added on top of it.
export function getVatAmount(amountIls, expenseDate, vatIncluded) {
  if (!vatIncluded || amountIls == null || amountIls === '') return 0

  const amount = Number(amountIls)
  if (!Number.isFinite(amount)) return 0

  const rate = getVatRate(expenseDate)
  return amount * (rate / (1 + rate))
}
