// TalkOn is the only organization. Every write is scoped to this id.
export const ORGANIZATION_ID = '3a97d734-7913-424d-a0d9-18d3d44009f0'

// Operational default exchange rates (editable per-row in the form).
export const DEFAULT_EXCHANGE_RATES = {
  ILS: 1,
  USD: 3.7,
  EUR: 4.0,
}

export const CURRENCIES = [
  { code: 'ILS', label: '₪ שקל (ILS)' },
  { code: 'USD', label: '$ דולר (USD)' },
  { code: 'EUR', label: '€ יורו (EUR)' },
]

export const PAYMENT_STATUS_LABELS = {
  unknown: 'לא ידוע',
  pending: 'ממתין לתשלום',
  paid: 'שולם',
  reimbursable: 'להחזר',
  reimbursed: 'הוחזר',
  cancelled: 'מבוטל',
}

export const CURRENCY_SYMBOLS = { ILS: '₪', USD: '$', EUR: '€' }

