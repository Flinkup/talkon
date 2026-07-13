import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PAYMENT_STATUS_LABELS } from '../lib/constants'

const ilsFmt = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const compactIlsFmt = new Intl.NumberFormat('he-IL', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const numberFmt = new Intl.NumberFormat('he-IL')
const monthLabels = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳']

function formatLocalDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getMonthRange() {
  const now = new Date()
  return {
    start: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: formatLocalDate(now),
    label: now.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
  }
}

function getPreviousMonthRange() {
  const now = new Date()
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return {
    start: formatLocalDate(new Date(previousMonth.getFullYear(), previousMonth.getMonth(), 1)),
    end: formatLocalDate(new Date(previousMonth.getFullYear(), previousMonth.getMonth() + 1, 0)),
  }
}

function formatSignedIls(value) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${ilsFmt.format(value)}`
}

function getYearRange(year) {
  return {
    start: `${year - 1}-01-01`,
    end: `${year}-12-31`,
  }
}

function getAvailableYears() {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 5 }, (_, i) => currentYear - i)
}

export default function Dashboard() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [previousMonthPaid, setPreviousMonthPaid] = useState(0)
  const [previousMonthLoading, setPreviousMonthLoading] = useState(true)

  const [trendRows, setTrendRows] = useState([])
  const [trendLoading, setTrendLoading] = useState(true)
  const [trendError, setTrendError] = useState('')
  const [trendYear, setTrendYear] = useState(() => new Date().getFullYear())
  const [trendCategory, setTrendCategory] = useState('')

  const month = useMemo(getMonthRange, [])
  const previousMonth = useMemo(getPreviousMonthRange, [])
  const yearOptions = useMemo(getAvailableYears, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data, error: fetchError } = await supabase
          .from('expenses')
          .select(
            'id, expense_date, item, amount_ils, payment_status, supplier:suppliers(name), category:expense_categories(name)',
          )
          .gte('expense_date', month.start)
          .lte('expense_date', month.end)
          .order('expense_date', { ascending: false })
          .order('created_at', { ascending: false })

        if (fetchError) throw fetchError
        if (active) setRows(data ?? [])
      } catch (err) {
        if (active) setError(err?.message || 'טעינת נתוני החודש נכשלה')
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [month.end, month.start])
  useEffect(() => {
    let active = true
    ;(async () => {
      setPreviousMonthLoading(true)
      try {
        const { data, error: fetchError } = await supabase
          .from('expenses')
          .select('amount_ils, payment_status')
          .gte('expense_date', previousMonth.start)
          .lte('expense_date', previousMonth.end)
          .in('payment_status', ['paid', 'reimbursed'])

        if (fetchError) throw fetchError
        if (!active) return
        setPreviousMonthPaid(
          (data ?? []).reduce((sum, row) => sum + (Number(row.amount_ils) || 0), 0),
        )
      } catch (err) {
        if (active) setPreviousMonthPaid(0)
      } finally {
        if (active) setPreviousMonthLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [previousMonth.end, previousMonth.start])

  useEffect(() => {
    let active = true
    ;(async () => {
      const range = getYearRange(trendYear)
      setTrendLoading(true)
      setTrendError('')
      try {
        const { data, error: fetchError } = await supabase
          .from('expenses')
          .select('id, expense_date, amount_ils, category:expense_categories(name)')
          .gte('expense_date', range.start)
          .lte('expense_date', range.end)
          .order('expense_date', { ascending: true })

        if (fetchError) throw fetchError
        if (active) setTrendRows(data ?? [])
      } catch (err) {
        if (active) setTrendError(err?.message || 'טעינת מגמת ההוצאות נכשלה')
      } finally {
        if (active) setTrendLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [trendYear])

  const stats = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + (Number(row.amount_ils) || 0), 0)
    const paid = rows
      .filter((row) => row.payment_status === 'paid' || row.payment_status === 'reimbursed')
      .reduce((sum, row) => sum + (Number(row.amount_ils) || 0), 0)
    const open = rows
      .filter((row) => !['paid', 'reimbursed', 'cancelled'].includes(row.payment_status))
      .reduce((sum, row) => sum + (Number(row.amount_ils) || 0), 0)

    const byCategory = new Map()
    for (const row of rows) {
      const name = row.category?.name || 'ללא קטגוריה'
      byCategory.set(name, (byCategory.get(name) || 0) + (Number(row.amount_ils) || 0))
    }

    const topCategory = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])[0]

    return {
      total,
      paid,
      open,
      topCategory: topCategory ? { name: topCategory[0], amount: topCategory[1] } : null,
    }
  }, [rows])

  const trendCategoryOptions = useMemo(() => {
    const set = new Set(trendRows.map((row) => row.category?.name || 'ללא קטגוריה'))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'))
  }, [trendRows])

  const trend = useMemo(() => {
    const current = Array(12).fill(0)
    const previous = Array(12).fill(0)

    for (const row of trendRows) {
      const category = row.category?.name || 'ללא קטגוריה'
      if (trendCategory && category !== trendCategory) continue

      const [yearText, monthText] = row.expense_date.split('-')
      const year = Number(yearText)
      const monthIndex = Number(monthText) - 1
      const amount = Number(row.amount_ils) || 0

      if (year === trendYear) current[monthIndex] += amount
      if (year === trendYear - 1) previous[monthIndex] += amount
    }

    const max = Math.max(...current, ...previous, 1)
    const totalCurrent = current.reduce((sum, value) => sum + value, 0)
    const totalPrevious = previous.reduce((sum, value) => sum + value, 0)

    return { current, previous, max, totalCurrent, totalPrevious }
  }, [trendCategory, trendRows, trendYear])

  const monthPaidGap = stats.total - previousMonthPaid
  const gapLoading = loading || previousMonthLoading

  const recentRows = rows.slice(0, 5)

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-teal-700">{month.label}</p>
          <h1 className="mt-1 text-3xl font-bold text-ink-800">הוצאות החודש עד כה</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            תמונת מצב מהירה של ההוצאות שנרשמו מתחילת החודש ועד היום.
          </p>
        </div>

        <Link
          to="/expenses/new"
          className="rounded-full bg-gold-500 px-5 py-3 text-sm font-semibold text-ink-800 shadow-sm transition hover:bg-gold-600"
        >
          + הזנת הוצאה חדשה
        </Link>
      </section>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="סך הוצאות" value={loading ? 'טוען...' : ilsFmt.format(stats.total)} accent="gold" />
        <StatCard label="מספר הוצאות" value={loading ? 'טוען...' : numberFmt.format(rows.length)} />
        <StatCard label="פער מול ששולם חודש שעבר" value={gapLoading ? 'טוען...' : formatSignedIls(monthPaidGap)} />
      </section>

      <section className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-ink-800">מגמת הוצאות חודשית</h2>
            <p className="text-sm text-slate-500">השוואה חודשית בין {trendYear} ל-{trendYear - 1}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">שנה</span>
              <select
                value={trendYear}
                onChange={(e) => setTrendYear(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="block min-w-[12rem]">
              <span className="mb-1 block text-xs font-medium text-slate-500">קטגוריה</span>
              <select
                value={trendCategory}
                onChange={(e) => setTrendCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500"
              >
                <option value="">כל הקטגוריות</option>
                {trendCategoryOptions.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {trendError && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {trendError}
          </div>
        )}

        {trendLoading ? (
          <EmptyState text="טוען מגמת הוצאות..." />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-4 text-sm text-slate-600">
              <Legend color="bg-teal-500" label={`${trendYear}: ${ilsFmt.format(trend.totalCurrent)}`} />
              <Legend color="bg-gold-500" label={`${trendYear - 1}: ${ilsFmt.format(trend.totalPrevious)}`} />
            </div>
            <div className="overflow-x-auto pb-2">
              <div dir="ltr" className="grid min-w-[760px] grid-cols-12 items-end gap-3 border-b border-slate-200 pb-3">
                {monthLabels.map((label, index) => (
                  <MonthBar
                    key={label}
                    label={label}
                    current={trend.current[index]}
                    previous={trend.previous[index]}
                    max={trend.max}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink-800">הוצאות אחרונות</h2>
              <p className="text-sm text-slate-500">הרישומים האחרונים מהחודש הנוכחי</p>
            </div>
            <Link to="/expenses" className="text-sm font-medium text-teal-700 hover:text-teal-800">
              לכל ההוצאות
            </Link>
          </div>

          {loading ? (
            <EmptyState text="טוען הוצאות..." />
          ) : recentRows.length === 0 ? (
            <EmptyState text="עדיין לא נרשמו הוצאות החודש." />
          ) : (
            <div className="divide-y divide-slate-100">
              {recentRows.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-800">{row.item || 'ללא תיאור'}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {row.expense_date} · {row.supplier?.name || 'ללא ספק'} · {row.category?.name || 'ללא קטגוריה'}
                    </div>
                  </div>
                  <div className="shrink-0 text-left">
                    <div className="font-semibold text-ink-800">
                      {row.amount_ils != null ? ilsFmt.format(Number(row.amount_ils)) : '—'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {PAYMENT_STATUS_LABELS[row.payment_status] ?? row.payment_status ?? 'לא ידוע'}
                    </div>
                    <Link
                      to={`/expenses/${row.id}/edit`} state={{ returnTo: '/dashboard' }}
                      className="mt-1 inline-block text-xs font-medium text-teal-700 hover:text-teal-800"
                    >
                      עריכה
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-ink-800">נקודת מבט ניהולית</h2>
          <div className="mt-4 space-y-4">
            <Insight label="שולם או הוחזר" value={loading ? 'טוען...' : ilsFmt.format(stats.paid)} />
            <Insight
              label="קטגוריה מובילה"
              value={loading ? 'טוען...' : stats.topCategory ? stats.topCategory.name : 'אין נתונים'}
              detail={!loading && stats.topCategory ? ilsFmt.format(stats.topCategory.amount) : undefined}
            />
          </div>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, accent, tone }) {
  const accentClass = accent === 'gold' ? 'bg-gold-500' : tone === 'warning' ? 'bg-amber-400' : 'bg-teal-500'
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className={`mt-1 h-10 w-1.5 rounded-full ${accentClass}`} />
        <div>
          <div className="text-sm text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-bold text-ink-800">{value}</div>
        </div>
      </div>
    </div>
  )
}

function MonthBar({ label, current, previous, max }) {
  const currentHeight = Math.max(6, Math.round((current / max) * 132))
  const previousHeight = Math.max(6, Math.round((previous / max) * 132))

  return (
    <div className="flex min-h-[188px] flex-col items-center justify-end gap-2 text-center">
      <div className="flex h-36 items-end justify-center gap-1.5">
        <div
          className="w-4 rounded-t bg-gold-500/80"
          style={{ height: previous ? `${previousHeight}px` : '6px', opacity: previous ? 1 : 0.25 }}
          title={`${label} שנה קודמת: ${ilsFmt.format(previous)}`}
        />
        <div
          className="w-4 rounded-t bg-teal-500"
          style={{ height: current ? `${currentHeight}px` : '6px', opacity: current ? 1 : 0.25 }}
          title={`${label} שנה נבחרת: ${ilsFmt.format(current)}`}
        />
      </div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-[11px] leading-tight text-slate-400">{compactIlsFmt.format(current)} ₪</div>
    </div>
  )
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded-sm ${color}`} />
      <span>{label}</span>
    </div>
  )
}

function Insight({ label, value, detail }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-ink-800">{value}</div>
      {detail && <div className="mt-0.5 text-xs text-slate-400">{detail}</div>}
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
      {text}
    </div>
  )
}





