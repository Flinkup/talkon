import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import {
  PAYMENT_STATUS_LABELS,
  CURRENCY_SYMBOLS,
} from '../lib/constants'
import { toCsv, downloadCsv } from '../lib/csv'
import { getVatAmount } from '../lib/vat'

const PAGE_SIZE = 50

const SELECT = `
  id, expense_date, item, invoice_number, currency_code,
  original_amount, exchange_rate_to_ils, amount_ils, vat_included,
  payment_status, notes, supplier_name_raw,
  category_id, payment_method_id, payer_id,
  supplier:suppliers(name),
  category:expense_categories(name),
  payment_method:payment_methods(name),
  payer:payers(name)
`

// Fetch every expense row, paging past the API's 1000-row cap.
async function fetchAllExpenses() {
  const all = []
  const step = 1000
  for (let from = 0; ; from += step) {
    const { data, error } = await supabase
      .from('expenses')
      .select(SELECT)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, from + step - 1)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < step) break
  }
  return all
}

// Flatten a joined row into plain display fields.
function shape(row) {
  return {
    id: row.id,
    expense_date: row.expense_date,
    item: row.item ?? '',
    invoice_number: row.invoice_number ?? '',
    supplier: row.supplier?.name ?? row.supplier_name_raw ?? '',
    category_id: row.category_id ?? '',
    category: row.category?.name ?? '',
    payment_method_id: row.payment_method_id ?? '',
    payment_method: row.payment_method?.name ?? '',
    payer_id: row.payer_id ?? '',
    payer: row.payer?.name ?? '',
    currency_code: row.currency_code,
    original_amount: row.original_amount,
    exchange_rate_to_ils: row.exchange_rate_to_ils,
    amount_ils: row.amount_ils,
    vat_included: row.vat_included,
    payment_status: row.payment_status,
    notes: row.notes ?? '',
  }
}

const ilsFmt = new Intl.NumberFormat('he-IL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export default function ExpenseList() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkForm, setBulkForm] = useState({
    payment_status: '',
    category_id: '',
    payment_method_id: '',
    payer_id: '',
  })
  const [lists, setLists] = useState({
    categories: [],
    paymentMethods: [],
    payers: [],
  })

  // filters
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [supplier, setSupplier] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [recordStatus, setRecordStatus] = useState('')
  const [vatOnly, setVatOnly] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const [expenseRows, categories, paymentMethods, payers] = await Promise.all([
          fetchAllExpenses(),
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

        const firstError = categories.error || paymentMethods.error || payers.error
        if (firstError) throw firstError
        if (!active) return

        setRows(expenseRows.map(shape))
        setLists({
          categories: categories.data ?? [],
          paymentMethods: paymentMethods.data ?? [],
          payers: payers.data ?? [],
        })
      } catch (err) {
        if (active) setError(err?.message || 'טעינת ההוצאות נכשלה')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const categoryOptions = useMemo(() => getDistinctOptions(rows, 'category'), [rows])
  const supplierOptions = useMemo(() => getDistinctOptions(rows, 'supplier'), [rows])
  const paymentMethodOptions = useMemo(
    () => getDistinctOptions(rows, 'payment_method'),
    [rows],
  )
  const orderedCategories = useMemo(
    () => buildCategoryTree(lists.categories),
    [lists.categories],
  )

  const normalizedDateRange = useMemo(() => {
    if (!fromDate || !toDate) return { from: fromDate, to: toDate }
    return fromDate <= toDate
      ? { from: fromDate, to: toDate }
      : { from: toDate, to: fromDate }
  }, [fromDate, toDate])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const from = normalizedDateRange.from
    const to = normalizedDateRange.to
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.item} ${r.invoice_number} ${r.supplier} ${r.notes}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (category && r.category !== category) return false
      if (supplier && r.supplier !== supplier) return false
      if (paymentMethod && r.payment_method !== paymentMethod) return false
      if (recordStatus && r.payment_status !== recordStatus) return false
      if (vatOnly && !r.vat_included) return false
      if (from && r.expense_date < from) return false
      if (to && r.expense_date > to) return false
      return true
    })
  }, [rows, search, category, supplier, paymentMethod, recordStatus, vatOnly, normalizedDateRange])

  // Reset to first page whenever a filter changes the result set size.
  useEffect(() => {
    setPage(0)
  }, [search, category, supplier, paymentMethod, recordStatus, vatOnly, fromDate, toDate])

  const totalIls = useMemo(
    () => filtered.reduce((sum, r) => sum + (Number(r.amount_ils) || 0), 0),
    [filtered],
  )
  const totalVat = useMemo(
    () => filtered.reduce(
      (sum, r) => sum + getVatAmount(r.amount_ils, r.expense_date, r.vat_included),
      0,
    ),
    [filtered],
  )
  const missingAmount = useMemo(
    () => filtered.filter((r) => r.amount_ils == null).length,
    [filtered],
  )

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const selectedCount = selectedIds.size
  const pageRowIds = useMemo(() => pageRows.map((r) => r.id), [pageRows])
  const allPageRowsSelected =
    pageRowIds.length > 0 && pageRowIds.every((id) => selectedIds.has(id))
  const hasBulkChange = Boolean(
    bulkForm.payment_status ||
      bulkForm.category_id ||
      bulkForm.payment_method_id ||
      bulkForm.payer_id,
  )

  function toggleRowSelection(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePageSelection() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageRowsSelected) {
        pageRowIds.forEach((id) => next.delete(id))
      } else {
        pageRowIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function setBulkField(name, value) {
    setBulkForm((prev) => ({ ...prev, [name]: value }))
  }

  async function handleBulkUpdate() {
    setFeedback(null)
    if (selectedIds.size === 0 || !hasBulkChange) return

    const patch = {}
    if (bulkForm.payment_status) patch.payment_status = bulkForm.payment_status
    if (bulkForm.category_id) patch.category_id = bulkForm.category_id
    if (bulkForm.payment_method_id) patch.payment_method_id = bulkForm.payment_method_id
    if (bulkForm.payer_id) patch.payer_id = bulkForm.payer_id
    patch.updated_by = user?.id ?? null

    setBulkSaving(true)
    try {
      const ids = Array.from(selectedIds)
      const { data, error } = await supabase
        .from('expenses')
        .update(patch)
        .in('id', ids)
        .select('id')

      if (error) throw error
      if (!data || data.length !== ids.length) {
        throw new Error('חלק מהרשומות לא עודכנו. ייתכן שחסרה הרשאת עריכה לאחת הרשומות.')
      }

      const refreshed = await fetchAllExpenses()
      setRows(refreshed.map(shape))
      setSelectedIds(new Set())
      setBulkForm({ payment_status: '', category_id: '', payment_method_id: '', payer_id: '' })
      setFeedback({ type: 'success', text: `${data.length} רשומות עודכנו בהצלחה.` })
    } catch (err) {
      setFeedback({ type: 'error', text: translateBulkUpdateError(err) })
    } finally {
      setBulkSaving(false)
    }
  }

  function handleExport() {
    const columns = [
      { key: 'expense_date', header: 'תאריך' },
      { key: 'item', header: 'פריט' },
      { key: 'invoice_number', header: 'מספר חשבונית' },
      { key: 'supplier', header: 'ספק' },
      { key: 'category', header: 'קטגוריה' },
      { key: 'payment_method', header: 'אמצעי תשלום' },
      { key: 'payer', header: 'מי שילם' },
      { key: 'currency_code', header: 'מטבע' },
      { key: 'original_amount', header: 'סכום מקורי' },
      { key: 'exchange_rate_to_ils', header: 'שער המרה' },
      { key: 'amount_ils', header: 'סכום בשקלים' },
      { key: 'vat_included_he', header: 'כולל מע״מ' },
      { key: 'payment_status_he', header: 'סטטוס תשלום' },
      { key: 'notes', header: 'הערות' },
    ]
    const exportRows = filtered.map((r) => ({
      ...r,
      vat_included_he: r.vat_included ? 'כן' : 'לא',
      payment_status_he:
        PAYMENT_STATUS_LABELS[r.payment_status] ?? r.payment_status,
    }))
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`talkon-expenses-${stamp}.csv`, toCsv(exportRows, columns))
  }

  function clearFilters() {
    setSearch('')
    setCategory('')
    setSupplier('')
    setPaymentMethod('')
    setRecordStatus('')
    setVatOnly(false)
    setFromDate('')
    setToDate('')
    setSelectedIds(new Set())
  }

  const hasFilters = search || category || supplier || paymentMethod || recordStatus || vatOnly || fromDate || toDate

  return (
    <div>
      <div className="mb-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800 sm:text-2xl">רשימת הוצאות</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading
              ? 'טוען…'
              : `${filtered.length.toLocaleString('he-IL')} מתוך ${rows.length.toLocaleString('he-IL')} הוצאות`}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
          <Link
            to="/expenses/new"
            className="inline-flex w-full items-center justify-center rounded-full bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-800 shadow-sm transition hover:bg-gold-600 sm:w-auto sm:py-2"
          >
            + הוצאה חדשה
          </Link>
          <button
            onClick={handleExport}
            disabled={loading || filtered.length === 0}
            className="inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-slate-50 disabled:opacity-50 sm:w-auto sm:py-2"
          >
            ייצוא CSV
          </button>
        </div>
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

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש: פריט / חשבונית / ספק / הערה"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 lg:col-span-2"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
        >
          <option value="">כל הקטגוריות</option>
          {categoryOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
        >
          <option value="">כל הספקים</option>
          {supplierOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
        >
          <option value="">כל אמצעי התשלום</option>
          {paymentMethodOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={recordStatus}
          onChange={(e) => setRecordStatus(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
        >
          <option value="">כל הסטטוסים</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-teal-300">
          <input
            type="checkbox"
            checked={vatOnly}
            onChange={(e) => setVatOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600"
          />
          חשבוניות עם מע״מ בלבד
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:col-span-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">מתאריך</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">עד תאריך</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-teal-500"
            />
          </label>
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:border-teal-200 hover:text-teal-700 sm:w-auto lg:col-span-6"
          >
            נקה בחירות
          </button>
        )}
      </div>

      {selectedCount > 0 && (
        <div className="mb-4 rounded-2xl border border-teal-100 bg-teal-50 p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-ink-800">
                נבחרו {selectedCount.toLocaleString('he-IL')} רשומות
              </div>
              <div className="text-xs text-slate-500">
                בחר ערך אחד או יותר ולחץ עדכון נבחרים.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-sm font-medium text-slate-500 hover:text-teal-700"
            >
              בטל בחירה
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <select
              value={bulkForm.payment_status}
              onChange={(e) => setBulkField('payment_status', e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
            >
              <option value="">סטטוס תשלום - ללא שינוי</option>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <select
              value={bulkForm.category_id}
              onChange={(e) => setBulkField('category_id', e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
            >
              <option value="">קטגוריה - ללא שינוי</option>
              {orderedCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.depth > 0 ? '  '.repeat(c.depth) + '↳ ' : ''}{c.name}
                </option>
              ))}
            </select>
            <select
              value={bulkForm.payment_method_id}
              onChange={(e) => setBulkField('payment_method_id', e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
            >
              <option value="">אמצעי תשלום - ללא שינוי</option>
              {lists.paymentMethods.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={bulkForm.payer_id}
              onChange={(e) => setBulkField('payer_id', e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
            >
              <option value="">מי שילם - ללא שינוי</option>
              {lists.payers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkUpdate}
              disabled={bulkSaving || !hasBulkChange}
              className="w-full rounded-full bg-gold-500 px-4 py-2.5 text-sm font-semibold text-ink-800 shadow-sm transition hover:bg-gold-600 disabled:opacity-50 lg:w-auto lg:py-2"
            >
              {bulkSaving ? 'מעדכן...' : 'עדכון נבחרים'}
            </button>
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="mb-4 rounded-2xl border border-hairline bg-surface px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex items-center gap-3 sm:min-w-[13rem]">
            <span className="h-9 w-1.5 rounded-full bg-gold-500" />
            <div>
              <div className="text-xs font-medium text-slate-500">
                סכום כולל (בשקלים)
              </div>
              <div className="text-xl font-bold text-ink-800">
                ₪{ilsFmt.format(totalIls)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-100 pt-4 sm:border-r sm:border-t-0 sm:pr-8 sm:pt-0">
            <span className="h-9 w-1.5 rounded-full bg-teal-500" />
            <div>
              <div className="text-xs font-medium text-slate-500">
                סכום מע״מ כולל
              </div>
              <div className="text-xl font-bold text-ink-800">
                ₪{ilsFmt.format(totalVat)}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                מתוך חשבוניות שסומנו ככוללות מע״מ
              </div>
            </div>
          </div>
        </div>
        {missingAmount > 0 && (
          <span className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            {missingAmount} שורות ללא סכום — לא נכללות בסכום
          </span>
        )}
      </div>

      {/* Data */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-400">
          טוען הוצאות…
        </div>
      ) : pageRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-400">
          לא נמצאו הוצאות התואמות לסינון.
        </div>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white lg:block">
            <table className="w-full min-w-[940px] text-right text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <Th className="w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allPageRowsSelected}
                      onChange={togglePageSelection}
                      aria-label="בחירת כל הרשומות בעמוד"
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </Th>
                  <Th>תאריך</Th>
                  <Th>פריט</Th>
                  <Th>ספק</Th>
                  <Th>קטגוריה</Th>
                  <Th>אמצעי תשלום</Th>
                  <Th>מי שילם</Th>
                  <Th className="text-left">סכום מקורי</Th>
                  <Th className="text-left">בשקלים</Th>
                  <Th>סטטוס</Th>
                  <Th className="text-center">עריכה</Th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleRowSelection(r.id)}
                        aria-label="בחירת רשומה"
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {r.expense_date}
                    </Td>
                    <Td className="font-medium text-slate-800">
                      {r.item || '—'}
                      {r.invoice_number && (
                        <span className="block text-xs text-slate-400">
                          חשבונית {r.invoice_number}
                        </span>
                      )}
                    </Td>
                    <Td className="text-slate-600">
                      {r.supplier ? (
                        <FilterButton label={r.supplier} onClick={() => setSupplier(r.supplier)} title="סינון לפי ספק" />
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-slate-600">
                      {r.category ? (
                        <FilterButton label={r.category} onClick={() => setCategory(r.category)} title="סינון לפי קטגוריה" />
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-slate-600">
                      {r.payment_method ? (
                        <FilterButton label={r.payment_method} onClick={() => setPaymentMethod(r.payment_method)} title="סינון לפי אמצעי תשלום" />
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="text-slate-600">{r.payer || '—'}</Td>
                    <Td className="whitespace-nowrap text-left text-slate-600">
                      {r.original_amount != null
                        ? `${CURRENCY_SYMBOLS[r.currency_code] ?? ''}${ilsFmt.format(
                            Number(r.original_amount),
                          )}`
                        : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-left font-semibold text-slate-800">
                      {r.amount_ils != null
                        ? `₪${ilsFmt.format(Number(r.amount_ils))}`
                        : '—'}
                    </Td>
                    <Td>
                      <PaymentStatusBadge status={r.payment_status} />
                    </Td>
                    <Td className="text-center">
                      <Link
                        to={`/expenses/${r.id}/edit`} state={{ returnTo: '/expenses' }}
                        className="text-sm font-medium text-teal-700 hover:text-teal-800"
                      >
                        עריכה
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile + tablet: cards */}
          <div className="space-y-3 lg:hidden">
            {pageRows.map((r) => (
              <ExpenseCard
                key={r.id}
                r={r}
                selected={selectedIds.has(r.id)}
                onSelect={() => toggleRowSelection(r.id)}
                onCategoryClick={setCategory}
                onSupplierClick={setSupplier}
                onPaymentMethodClick={setPaymentMethod}
              />
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm sm:justify-center sm:gap-4">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            הקודם
          </button>
          <span className="text-slate-500">
            עמוד {page + 1} מתוך {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={page >= pageCount - 1}
            className="rounded-lg border border-slate-300 px-3 py-1.5 disabled:opacity-40"
          >
            הבא
          </button>
        </div>
      )}
    </div>
  )
}

function ExpenseCard({
  r,
  selected,
  onSelect,
  onCategoryClick,
  onSupplierClick,
  onPaymentMethodClick,
}) {
  const meta = [
    { label: r.supplier, onClick: onSupplierClick, title: 'סינון לפי ספק' },
    { label: r.category, onClick: onCategoryClick, title: 'סינון לפי קטגוריה' },
    { label: r.payment_method, onClick: onPaymentMethodClick, title: 'סינון לפי אמצעי תשלום' },
    { label: r.payer },
  ].filter((item) => item.label)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label="בחירת רשומה"
          className="mt-1 h-4 w-4 rounded border-slate-300"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-slate-800">
            {r.item || '—'}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {r.expense_date}
            {r.invoice_number && ` · חשבונית ${r.invoice_number}`}
          </div>
        </div>
        <div className="shrink-0 text-left">
          <div className="font-semibold text-slate-800">
            {r.amount_ils != null ? `₪${ilsFmt.format(Number(r.amount_ils))}` : '—'}
          </div>
          {r.currency_code !== 'ILS' && r.original_amount != null && (
            <div className="text-xs text-slate-400">
              {CURRENCY_SYMBOLS[r.currency_code] ?? ''}
              {ilsFmt.format(Number(r.original_amount))}
            </div>
          )}
        </div>
      </div>
      {meta.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          {meta.map((m, i) => (
            <span key={`${m.label}-${i}`} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">·</span>}
              {m.onClick ? (
                <button
                  type="button"
                  onClick={() => m.onClick(m.label)}
                  className="font-medium text-teal-700 hover:text-teal-800"
                  title={m.title}
                >
                  {m.label}
                </button>
              ) : (
                m.label
              )}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <PaymentStatusBadge status={r.payment_status} />
        <Link
          to={`/expenses/${r.id}/edit`} state={{ returnTo: '/expenses' }}
          className="text-sm font-medium text-teal-700 hover:text-teal-800"
        >
          עריכה
        </Link>
      </div>
    </div>
  )
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

function translateBulkUpdateError(err) {
  const message = err?.message || ''
  const m = message.toLowerCase()
  if (m.includes('row-level security') || m.includes('violates row-level')) {
    return 'אין לך הרשאה לעדכן חלק מהרשומות שנבחרו.'
  }
  if (m.includes('foreign key')) {
    return 'אחת הבחירות אינה תקפה. רענן את הדף ונסה שוב.'
  }
  if (m.includes('check constraint')) {
    return 'אחד הערכים שנבחרו אינו תקין.'
  }
  return message || 'עדכון הרשומות שנבחרו נכשל. נסה שוב.'
}

function getDistinctOptions(rows, key) {
  const set = new Set(rows.map((r) => r[key]).filter(Boolean))
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'))
}

function FilterButton({ label, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-right font-medium text-teal-700 hover:text-teal-800"
      title={title}
    >
      {label}
    </button>
  )
}

function Th({ children, className = '' }) {
  return <th className={`px-4 py-2 font-medium ${className}`}>{children}</th>
}

function Td({ children, className = '' }) {
  return <td className={`px-4 py-2.5 align-top ${className}`}>{children}</td>
}


function PaymentStatusBadge({ status }) {
  const label = PAYMENT_STATUS_LABELS[status] ?? status
  const cls =
    {
      paid: 'bg-emerald-50 text-emerald-700',
      pending: 'bg-amber-50 text-amber-700',
      reimbursable: 'bg-sky-50 text-sky-700',
      reimbursed: 'bg-teal-50 text-teal-700',
      cancelled: 'bg-red-50 text-red-600',
      unknown: 'bg-slate-100 text-slate-600',
    }[status] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {label}
    </span>
  )
}

