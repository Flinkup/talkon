import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import {
  DEFAULT_EXCHANGE_RATES,
  CURRENCIES,
  PAYMENT_STATUS_LABELS,
} from '../lib/constants'

const today = () => new Date().toISOString().slice(0, 10)

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
  amount_ils: '',
  vat_included: true,
  payment_status: 'pending',
  notes: '',
})

export default function ExpenseEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = location.state?.returnTo || '/expenses'
  const { user } = useAuth()

  const [form, setForm] = useState(emptyForm)
  const [amountIlsOverride, setAmountIlsOverride] = useState(false)
  const [amountIlsManual, setAmountIlsManual] = useState('')
  const [lists, setLists] = useState({
    suppliers: [],
    categories: [],
    paymentMethods: [],
    payers: [],
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savedExpenseDate, setSavedExpenseDate] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setFeedback(null)
      try {
        const [expense, suppliers, categories, paymentMethods, payers] =
          await Promise.all([
            supabase
              .from('expenses')
              .select(
                'id, expense_date, item, invoice_number, supplier_id, category_id, payment_method_id, payer_id, currency_code, original_amount, exchange_rate_to_ils, amount_ils, vat_included, payment_status, notes',
              )
              .eq('id', id)
              .single(),
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
          expense.error ||
          suppliers.error ||
          categories.error ||
          paymentMethods.error ||
          payers.error
        if (firstError) throw firstError
        if (!active) return

        const row = expense.data
        const computed = computeIls(row.original_amount, row.exchange_rate_to_ils)
        const stored = row.amount_ils == null ? '' : String(row.amount_ils)
        const shouldOverride =
          row.amount_ils != null &&
          computed != null &&
          Math.abs(Number(row.amount_ils) - computed) > 0.01

        setSavedExpenseDate(row.expense_date || '')
        setForm({
          expense_date: row.expense_date || today(),
          item: row.item || '',
          invoice_number: row.invoice_number || '',
          supplier_id: row.supplier_id || '',
          category_id: row.category_id || '',
          payment_method_id: row.payment_method_id || '',
          payer_id: row.payer_id || '',
          currency_code: row.currency_code || 'ILS',
          original_amount: row.original_amount == null ? '' : String(row.original_amount),
          exchange_rate_to_ils:
            row.exchange_rate_to_ils == null ? '1' : String(row.exchange_rate_to_ils),
          amount_ils: stored,
          vat_included: Boolean(row.vat_included),
          payment_status: row.payment_status || 'pending',
          notes: row.notes || '',
        })
        setAmountIlsOverride(shouldOverride)
        setAmountIlsManual(stored)
        setLists({
          suppliers: suppliers.data ?? [],
          categories: categories.data ?? [],
          paymentMethods: paymentMethods.data ?? [],
          payers: payers.data ?? [],
        })
      } catch (err) {
        if (active) {
          setFeedback({ type: 'error', text: err?.message || 'טעינת ההוצאה נכשלה' })
        }
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [id])

  const orderedCategories = useMemo(
    () => buildCategoryTree(lists.categories),
    [lists.categories],
  )

  const computedIls = useMemo(
    () => computeIls(form.original_amount, form.exchange_rate_to_ils),
    [form.original_amount, form.exchange_rate_to_ils],
  )

  const amountIlsValue = amountIlsOverride ? amountIlsManual : computedIls ?? ''
  const isForeign = form.currency_code !== 'ILS'
  const canDelete = isCurrentMonth(savedExpenseDate)

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

    if (amountIlsOverride) {
      const manual = parseFloat(amountIlsManual)
      if (!isFinite(manual)) e.amount_ils = 'סכום בשקלים חייב להיות מספר'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(evt) {
    evt.preventDefault()
    setFeedback(null)
    if (!validate()) {
      setFeedback({ type: 'error', text: 'נא לבדוק את השדות המסומנים.' })
      return
    }

    const finalIls = amountIlsOverride ? parseFloat(amountIlsManual) : computedIls
    const row = {
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
      payment_status: form.payment_status,
      notes: form.notes.trim() || null,
      updated_by: user?.id ?? null,
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('expenses').update(row).eq('id', id)
      if (error) throw error
      setSavedExpenseDate(row.expense_date)
      navigate(returnTo)
    } catch (err) {
      setFeedback({ type: 'error', text: translateUpdateError(err) })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    setFeedback(null)
    if (!canDelete) return

    const confirmed = window.confirm('למחוק את ההוצאה הזו? לא ניתן לשחזר את הפעולה מתוך האפליקציה.')
    if (!confirmed) return

    const { start, end } = getCurrentMonthRange()
    setDeleting(true)
    try {
      const { data, error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id)
        .gte('expense_date', start)
        .lte('expense_date', end)
        .select('id')

      if (error) throw error
      if (!data || data.length === 0) {
        throw new Error('ההוצאה לא נמחקה. בדרך כלל זה אומר שחסרה הרשאת מחיקה ב-Supabase, או שההוצאה אינה בחודש הנוכחי.')
      }

      navigate('/expenses')
    } catch (err) {
      setFeedback({ type: 'error', text: translateDeleteError(err) })
    } finally {
      setDeleting(false)
    }
  }
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-400">
        טוען הוצאה...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">עריכת הוצאה</h1>
          <p className="mt-1 text-sm text-slate-500">
            עדכן את הפרטים ושמור את השינויים.
          </p>
        </div>
        <Link to={returnTo} className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-ink-700 transition hover:bg-slate-50 sm:w-auto">
          חזרה לרשימה
        </Link>
      </div>

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

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-hairline bg-surface p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="תאריך הוצאה" required error={errors.expense_date}>
            <input type="date" value={form.expense_date} onChange={(e) => setField('expense_date', e.target.value)} className={inputCls(errors.expense_date)} />
          </Field>
          <Field label="מספר חשבונית">
            <input type="text" value={form.invoice_number} onChange={(e) => setField('invoice_number', e.target.value)} className={inputCls()} />
          </Field>
        </div>

        <Field label="פריט / תיאור" required error={errors.item}>
          <input type="text" value={form.item} onChange={(e) => setField('item', e.target.value)} className={inputCls(errors.item)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="ספק">
            <select value={form.supplier_id} onChange={(e) => setField('supplier_id', e.target.value)} className={selectCls()}>
              <option value="">— ללא / לא ידוע —</option>
              {lists.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="קטגוריה" required error={errors.category_id}>
            <select value={form.category_id} onChange={(e) => setField('category_id', e.target.value)} className={selectCls(errors.category_id)}>
              <option value="">— בחר קטגוריה —</option>
              {orderedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.depth > 0 ? '  '.repeat(c.depth) + '↳ ' : ''}{c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="אמצעי תשלום">
            <select value={form.payment_method_id} onChange={(e) => setField('payment_method_id', e.target.value)} className={selectCls()}>
              <option value="">— ללא —</option>
              {lists.paymentMethods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="מי שילם">
            <select value={form.payer_id} onChange={(e) => setField('payer_id', e.target.value)} className={selectCls()}>
              <option value="">— ללא —</option>
              {lists.payers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="מטבע">
              <select value={form.currency_code} onChange={(e) => handleCurrencyChange(e.target.value)} className={selectCls()}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="סכום מקורי" required error={errors.original_amount}>
              <input type="number" step="0.01" inputMode="decimal" value={form.original_amount} onChange={(e) => setField('original_amount', e.target.value)} className={inputCls(errors.original_amount)} />
            </Field>
            <Field label="שער המרה לש״ח" error={errors.exchange_rate_to_ils}>
              <input type="number" step="0.0001" inputMode="decimal" value={form.exchange_rate_to_ils} onChange={(e) => setField('exchange_rate_to_ils', e.target.value)} className={inputCls(errors.exchange_rate_to_ils)} disabled={!isForeign} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="min-w-[8rem] flex-1">
              <Field label="סכום בשקלים" error={errors.amount_ils}>
                <input type="number" step="0.01" inputMode="decimal" value={amountIlsValue} onChange={(e) => setAmountIlsManual(e.target.value)} readOnly={!amountIlsOverride} className={`${inputCls(errors.amount_ils)} ${amountIlsOverride ? '' : 'bg-slate-100 text-slate-600'} font-semibold`} />
              </Field>
            </div>
            <label className="flex select-none items-center gap-2 pb-2 text-sm text-slate-600">
              <input type="checkbox" checked={amountIlsOverride} onChange={(e) => {
                setAmountIlsOverride(e.target.checked)
                if (e.target.checked) setAmountIlsManual(computedIls != null ? String(computedIls) : '')
              }} className="h-4 w-4 rounded border-slate-300" />
              דריסה ידנית
            </label>
          </div>
        </div>

        <Field label="סטטוס תשלום">
          <select value={form.payment_status} onChange={(e) => setField('payment_status', e.target.value)} className={selectCls()}>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </Field>

        <label className="flex select-none items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.vat_included} onChange={(e) => setField('vat_included', e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          כולל מע״מ
        </label>

        <Field label="הערות">
          <textarea rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} className={`${inputCls()} resize-y`} />
        </Field>

        <div className="grid grid-cols-1 gap-3 pt-2 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={submitting || deleting} className="w-full rounded-full bg-gold-500 px-5 py-2.5 font-semibold text-ink-800 shadow-sm transition hover:bg-gold-600 disabled:opacity-60 sm:w-auto">
              {submitting ? 'שומר...' : 'שמירת שינויים'}
            </button>
            <button type="button" onClick={() => navigate(returnTo)} disabled={deleting} className="w-full rounded-full border border-slate-300 px-5 py-2.5 font-medium text-ink-700 transition hover:bg-slate-50 disabled:opacity-60 sm:w-auto">
              ביטול
            </button>
          </div>

          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting || deleting}
              className="w-full rounded-full border border-red-200 px-5 py-2.5 font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 sm:w-auto"
            >
              {deleting ? 'מוחק...' : 'מחיקת הוצאה'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

function Field({ label, required, error, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500"> *</span>}
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
    error ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-teal-500'
  }`
}

function selectCls(error) {
  return `${inputCls(error)} bg-white`
}

function computeIls(amountValue, rateValue) {
  const amount = parseFloat(amountValue)
  const rate = parseFloat(rateValue)
  if (!isFinite(amount) || !isFinite(rate)) return null
  return Math.round(amount * rate * 100) / 100
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

function getCurrentMonthRange() {
  const now = new Date()
  return {
    start: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: formatLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isCurrentMonth(dateValue) {
  if (!dateValue) return false
  const { start, end } = getCurrentMonthRange()
  return dateValue >= start && dateValue <= end
}
function translateUpdateError(err) {
  const message = err?.message || ''
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('violates row-level')) {
    return 'אין לך הרשאה לערוך את ההוצאה הזו.'
  }
  if (m.includes('violates check constraint')) {
    return 'אחד הערכים אינו תקין. בדוק סכום, שער המרה וסטטוסים.'
  }
  if (m.includes('foreign key')) {
    return 'אחת הבחירות אינה תקפה. רענן את הדף ונסה שוב.'
  }
  return message || 'שמירת השינויים נכשלה. נסה שוב.'
}

function translateDeleteError(err) {
  const message = err?.message || ''
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('violates row-level')) {
    return 'אין לך הרשאה למחוק את ההוצאה הזו.'
  }
  return message || 'מחיקת ההוצאה נכשלה. נסה שוב.'
}







