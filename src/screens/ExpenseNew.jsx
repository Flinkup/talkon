import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import {
  ORGANIZATION_ID,
  DEFAULT_EXCHANGE_RATES,
  CURRENCIES,
} from '../lib/constants'

const today = () => new Date().toISOString().slice(0, 10)

async function fetchRateFromDatabase(currencyCode, date) {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('rate_to_ils')
    .eq('currency_code', currencyCode)
    .eq('rate_date', date)
    .maybeSingle()

  if (error) throw error
  const rate = Number(data?.rate_to_ils)
  return isFinite(rate) && rate > 0 ? rate : null
}

async function fetchHistoricalExchangeRate(currencyCode, date) {
  if (currencyCode === 'ILS') return 1

  const url = `https://api.frankfurter.app/${encodeURIComponent(date)}?from=${encodeURIComponent(currencyCode)}&to=ILS`
  const response = await fetch(url)
  if (!response.ok) throw new Error('Exchange rate lookup failed')

  const payload = await response.json()
  const rate = Number(payload?.rates?.ILS)
  if (!isFinite(rate) || rate <= 0) throw new Error('Exchange rate is unavailable')

  return Math.round(rate * 10000) / 10000
}

async function saveRateToDatabase(currencyCode, date, rate) {
  const { error } = await supabase
    .from('exchange_rates')
    .upsert(
      {
        rate_date: date,
        currency_code: currencyCode,
        rate_to_ils: rate,
        source: 'frankfurter',
        fetched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'rate_date,currency_code' },
    )

  if (error) throw error
}

async function resolveExchangeRate(currencyCode, date) {
  if (currencyCode === 'ILS') return { rate: 1, source: 'fixed' }

  const cachedRate = await fetchRateFromDatabase(currencyCode, date)
  if (cachedRate) return { rate: cachedRate, source: 'database' }

  const networkRate = await fetchHistoricalExchangeRate(currencyCode, date)
  await saveRateToDatabase(currencyCode, date, networkRate)
  return { rate: networkRate, source: 'network' }
}

const emptyForm = () => ({
  expense_date: today(),
  item: '',
  invoice_number: '',
  supplier_id: '',
  category_id: '',
  payment_method_id: '',
  payer_id: '',
  currency_code: 'ILS',
  original_amount: '',
  exchange_rate_to_ils: '1',
  vat_included: true,
  notes: '',
})

export default function ExpenseNew() {
  const { user } = useAuth()

  const [form, setForm] = useState(emptyForm)
  const [amountIlsOverride, setAmountIlsOverride] = useState(false)
  const [amountIlsManual, setAmountIlsManual] = useState('')
  const [exchangeRateLoading, setExchangeRateLoading] = useState(false)
  const [exchangeRateError, setExchangeRateError] = useState('')
  const [exchangeRateSource, setExchangeRateSource] = useState('')

  const [lists, setLists] = useState({
    suppliers: [],
    categories: [],
    paymentMethods: [],
    payers: [],
  })
  const [listsError, setListsError] = useState('')
  const [loadingLists, setLoadingLists] = useState(true)

  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoadingLists(true)
      setListsError('')
      try {
        const [suppliers, categories, paymentMethods, payers] =
          await Promise.all([
            supabase
              .from('suppliers')
              .select('id, name')
              .eq('is_active', true)
              .order('name'),
            supabase
              .from('expense_categories')
              .select('id, name, parent_id, sort_order')
              .eq('is_active', true)
              .order('sort_order')
              .order('name'),
            supabase
              .from('payment_methods')
              .select('id, name')
              .eq('is_active', true)
              .order('sort_order')
              .order('name'),
            supabase
              .from('payers')
              .select('id, name')
              .eq('is_active', true)
              .order('name'),
          ])

        const firstError =
          suppliers.error ||
          categories.error ||
          paymentMethods.error ||
          payers.error
        if (firstError) throw firstError

        if (!active) return
        setLists({
          suppliers: suppliers.data ?? [],
          categories: categories.data ?? [],
          paymentMethods: paymentMethods.data ?? [],
          payers: payers.data ?? [],
        })
      } catch (err) {
        if (active) setListsError(err?.message || 'טעינת הרשימות נכשלה')
      } finally {
        if (active) setLoadingLists(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const currencyCode = form.currency_code
    const expenseDate = form.expense_date

    setExchangeRateError('')
    setExchangeRateSource('')

    if (!expenseDate || currencyCode === 'ILS') {
      setExchangeRateLoading(false)
      if (currencyCode === 'ILS') {
        setForm((prev) => ({ ...prev, exchange_rate_to_ils: '1' }))
      }
      return () => {
        active = false
      }
    }

    if (!['USD', 'EUR'].includes(currencyCode)) {
      setExchangeRateLoading(false)
      return () => {
        active = false
      }
    }

    ;(async () => {
      setExchangeRateLoading(true)
      try {
        const result = await resolveExchangeRate(currencyCode, expenseDate)
        if (!active) return
        setForm((prev) => {
          if (prev.currency_code !== currencyCode || prev.expense_date !== expenseDate) return prev
          return { ...prev, exchange_rate_to_ils: String(result.rate) }
        })
        setExchangeRateSource(result.source)
      } catch (err) {
        if (!active) return
        setForm((prev) => {
          if (prev.currency_code !== currencyCode || prev.expense_date !== expenseDate) return prev
          return {
            ...prev,
            exchange_rate_to_ils: String(DEFAULT_EXCHANGE_RATES[currencyCode] ?? 1),
          }
        })
        setExchangeRateError('לא נמצא שער בדטה בייס או ברשת. הוצג שער ברירת מחדל וניתן לערוך ידנית.')
      } finally {
        if (active) setExchangeRateLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [form.currency_code, form.expense_date])

  const orderedCategories = useMemo(
    () => buildCategoryTree(lists.categories),
    [lists.categories],
  )

  const computedIls = useMemo(() => {
    const amount = parseFloat(form.original_amount)
    const rate = parseFloat(form.exchange_rate_to_ils)
    if (!isFinite(amount) || !isFinite(rate)) return null
    return Math.round(amount * rate * 100) / 100
  }, [form.original_amount, form.exchange_rate_to_ils])

  const amountIlsValue = amountIlsOverride
    ? amountIlsManual
    : computedIls ?? ''

  function setField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  function handleCurrencyChange(code) {
    setForm((prev) => ({
      ...prev,
      currency_code: code,
      exchange_rate_to_ils: String(DEFAULT_EXCHANGE_RATES[code] ?? 1),
    }))
  }

  function validate() {
    const e = {}
    if (!form.expense_date) e.expense_date = 'שדה חובה'
    if (!form.item.trim()) e.item = 'שדה חובה'
    if (!form.category_id) e.category_id = 'שדה חובה'

    const amount = parseFloat(form.original_amount)
    if (!isFinite(amount) || amount === 0) e.original_amount = 'סכום חובה'

    const rate = parseFloat(form.exchange_rate_to_ils)
    if (!isFinite(rate) || rate <= 0) e.exchange_rate_to_ils = 'שער חייב להיות גדול מ-0'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(evt) {
    evt.preventDefault()
    setFeedback(null)
    if (!validate()) {
      setFeedback({ type: 'error', text: 'נא למלא את שדות החובה המסומנים.' })
      return
    }

    const finalIls = amountIlsOverride
      ? parseFloat(amountIlsManual)
      : computedIls

    const row = {
      organization_id: ORGANIZATION_ID,
      expense_date: form.expense_date,
      item: form.item.trim(),
      invoice_number: form.invoice_number.trim() || null,
      supplier_id: form.supplier_id || null,
      category_id: form.category_id,
      payment_method_id: form.payment_method_id || null,
      payer_id: form.payer_id || null,
      currency_code: form.currency_code,
      original_amount: parseFloat(form.original_amount),
      exchange_rate_to_ils: parseFloat(form.exchange_rate_to_ils),
      amount_ils: isFinite(finalIls) ? finalIls : null,
      vat_included: form.vat_included,
      notes: form.notes.trim() || null,
      payment_status: 'paid',
      source_system: 'app',
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('expenses').insert(row)
      if (error) throw error

      setFeedback({ type: 'success', text: 'ההוצאה נשמרה בהצלחה' })
      setForm((prev) => ({ ...emptyForm(), expense_date: prev.expense_date }))
      setAmountIlsOverride(false)
      setAmountIlsManual('')
      setExchangeRateSource('')
      setErrors({})
    } catch (err) {
      setFeedback({ type: 'error', text: translateInsertError(err) })
    } finally {
      setSubmitting(false)
    }
  }

  const isForeign = form.currency_code !== 'ILS'

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-ink-800">הזנת הוצאה חדשה</h1>
        <p className="mt-1 text-sm text-slate-500">
          מלא את הפרטים ולחץ שמירה. שדות עם * הם חובה.
        </p>
      </div>

      {listsError && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          שים לב: טעינת חלק מהרשימות נכשלה ({listsError}). ניתן עדיין למלא שדות חופשיים.
        </div>
      )}

      {feedback && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-hairline bg-surface p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="תאריך הוצאה" required error={errors.expense_date}>
            <input
              type="date"
              value={form.expense_date}
              onChange={(e) => setField('expense_date', e.target.value)}
              className={inputCls(errors.expense_date)}
            />
          </Field>

          <Field label="מספר חשבונית" error={errors.invoice_number}>
            <input
              type="text"
              value={form.invoice_number}
              onChange={(e) => setField('invoice_number', e.target.value)}
              className={inputCls()}
              placeholder="אופציונלי"
            />
          </Field>
        </div>

        <Field label="פריט / תיאור" required error={errors.item}>
          <input
            type="text"
            value={form.item}
            onChange={(e) => setField('item', e.target.value)}
            className={inputCls(errors.item)}
            placeholder="למשל: מנוי חודשי, ציוד משרדי..."
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="ספק" error={errors.supplier_id}>
            <select
              value={form.supplier_id}
              onChange={(e) => setField('supplier_id', e.target.value)}
              className={selectCls()}
              disabled={loadingLists}
            >
              <option value="">- ללא / לא ידוע -</option>
              {lists.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="קטגוריה" required error={errors.category_id}>
            <select
              value={form.category_id}
              onChange={(e) => setField('category_id', e.target.value)}
              className={selectCls(errors.category_id)}
              disabled={loadingLists}
            >
              <option value="">- בחר קטגוריה -</option>
              {orderedCategories.map((c) => (
                <option key={c.id} value={c.id} disabled={c.isHeader}>
                  {c.depth > 0 ? '  '.repeat(c.depth) + '↳ ' : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="אמצעי תשלום" error={errors.payment_method_id}>
            <select
              value={form.payment_method_id}
              onChange={(e) => setField('payment_method_id', e.target.value)}
              className={selectCls()}
              disabled={loadingLists}
            >
              <option value="">- ללא -</option>
              {lists.paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="מי שילם" error={errors.payer_id}>
            <select
              value={form.payer_id}
              onChange={(e) => setField('payer_id', e.target.value)}
              className={selectCls()}
              disabled={loadingLists}
            >
              <option value="">- ללא -</option>
              {lists.payers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="מטבע">
              <select
                value={form.currency_code}
                onChange={(e) => handleCurrencyChange(e.target.value)}
                className={selectCls()}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="סכום מקורי" required error={errors.original_amount}>
              <input
                type="number"
                step="0.01"
                inputMode="decimal"
                value={form.original_amount}
                onChange={(e) => setField('original_amount', e.target.value)}
                className={inputCls(errors.original_amount)}
                placeholder="0.00"
              />
            </Field>

            <Field label="שער המרה לש״ח" error={errors.exchange_rate_to_ils}>
              <input
                type="number"
                step="0.0001"
                inputMode="decimal"
                value={form.exchange_rate_to_ils}
                onChange={(e) => setField('exchange_rate_to_ils', e.target.value)}
                className={inputCls(errors.exchange_rate_to_ils)}
                disabled={!isForeign || exchangeRateLoading}
              />
              {exchangeRateLoading && (
                <span className="mt-1 block text-xs text-slate-500">
                  מחפש שער בדטה בייס. אם חסר, טוען מהרשת ושומר להמשך.
                </span>
              )}
              {exchangeRateSource === 'database' && !exchangeRateLoading && (
                <span className="mt-1 block text-xs text-emerald-700">
                  השער נטען מדטה בייס לפי תאריך ההוצאה.
                </span>
              )}
              {exchangeRateSource === 'network' && !exchangeRateLoading && (
                <span className="mt-1 block text-xs text-emerald-700">
                  השער נשלף מהרשת ונשמר בדטה בייס.
                </span>
              )}
              {exchangeRateError && (
                <span className="mt-1 block text-xs text-amber-700">
                  {exchangeRateError}
                </span>
              )}
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="min-w-[8rem] flex-1">
              <Field label="סכום בשקלים">
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={amountIlsValue}
                  onChange={(e) => setAmountIlsManual(e.target.value)}
                  readOnly={!amountIlsOverride}
                  className={`${inputCls()} ${
                    amountIlsOverride ? '' : 'bg-slate-100 text-slate-600'
                  } font-semibold`}
                />
              </Field>
            </div>

            <label className="flex select-none items-center gap-2 pb-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={amountIlsOverride}
                onChange={(e) => {
                  setAmountIlsOverride(e.target.checked)
                  if (e.target.checked) {
                    setAmountIlsManual(
                      computedIls != null ? String(computedIls) : '',
                    )
                  }
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              דריסה ידנית
            </label>
          </div>
        </div>

        <label className="flex select-none items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.vat_included}
            onChange={(e) => setField('vat_included', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          כולל מע״מ
        </label>

        <Field label="הערות">
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            className={`${inputCls()} resize-y`}
            placeholder="אופציונלי"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 pt-2 sm:flex sm:items-center">
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-gold-500 px-5 py-2.5 font-semibold text-ink-800 shadow-sm transition hover:bg-gold-600 disabled:opacity-60 sm:w-auto"
          >
            {submitting ? 'שומר...' : 'שמירת הוצאה'}
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm())
              setAmountIlsOverride(false)
              setAmountIlsManual('')
              setExchangeRateSource('')
              setErrors({})
              setFeedback(null)
            }}
            className="w-full rounded-full border border-slate-300 px-5 py-2.5 font-medium text-ink-700 transition hover:bg-slate-50 sm:w-auto"
          >
            ניקוי טופס
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, required, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

const baseInput =
  'w-full rounded-lg border px-3 py-2 text-slate-900 outline-none transition focus:ring-2 focus:ring-teal-100'

function inputCls(error) {
  return `${baseInput} ${
    error
      ? 'border-red-400 focus:border-red-500'
      : 'border-slate-300 focus:border-teal-500'
  }`
}

function selectCls(error) {
  return `${inputCls(error)} bg-white`
}

function buildCategoryTree(categories) {
  const byParent = new Map()
  for (const c of categories) {
    const key = c.parent_id ?? 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(c)
  }

  const result = []
  const walk = (parentKey, depth) => {
    const children = byParent.get(parentKey) ?? []
    for (const c of children) {
      result.push({ id: c.id, name: c.name, depth })
      walk(c.id, depth + 1)
    }
  }
  walk('root', 0)

  const seen = new Set(result.map((r) => r.id))
  for (const c of categories) {
    if (!seen.has(c.id)) result.push({ id: c.id, name: c.name, depth: 0 })
  }
  return result
}

function translateInsertError(err) {
  const message = err?.message || ''
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('violates row-level')) {
    return 'אין לך הרשאה לשמור את ההוצאה. נדרשת הרשאת עורך ומעלה.'
  }
  if (m.includes('violates check constraint')) {
    return 'אחד הערכים אינו תקין. בדוק סכום ושער המרה.'
  }
  if (m.includes('foreign key')) {
    return 'אחת הבחירות אינה תקפה. רענן את הדף ונסה שוב.'
  }
  return message || 'שמירת ההוצאה נכשלה. נסה שוב.'
}


