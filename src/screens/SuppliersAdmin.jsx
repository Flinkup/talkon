import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { ORGANIZATION_ID } from '../lib/constants'
import { Field, inputCls, selectCls, Btn, Feedback } from '../components/ui'
import Modal from '../components/Modal'

const emptyForm = () => ({
  name: '',
  department: '',
  default_category_id: '',
  notes: '',
  is_active: true,
})

export default function SuppliersAdmin() {
  const { canEdit } = useAuth()
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)

  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [editing, setEditing] = useState(null) // null | 'new' | row
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function load() {
    setLoading(true)
    const [sup, cat] = await Promise.all([
      supabase
        .from('suppliers')
        .select('id, name, department, default_category_id, notes, is_active')
        .order('name'),
      supabase
        .from('expense_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),
    ])
    if (sup.error) setFeedback({ type: 'error', text: sup.error.message })
    setRows(sup.data ?? [])
    setCategories(cat.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const catName = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.name]))
    return (id) => (id ? m.get(id) ?? '' : '')
  }, [categories])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (!showInactive && !r.is_active) return false
      if (q && !`${r.name} ${r.department ?? ''}`.toLowerCase().includes(q))
        return false
      return true
    })
  }, [rows, search, showInactive])

  function openNew() {
    setForm(emptyForm())
    setFormError('')
    setEditing('new')
  }
  function openEdit(row) {
    setForm({
      name: row.name ?? '',
      department: row.department ?? '',
      default_category_id: row.default_category_id ?? '',
      notes: row.notes ?? '',
      is_active: row.is_active,
    })
    setFormError('')
    setEditing(row)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('שם ספק הוא שדה חובה')
      return
    }
    setSaving(true)
    setFormError('')
    const payload = {
      name: form.name.trim(),
      department: form.department.trim() || null,
      default_category_id: form.default_category_id || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active,
    }
    try {
      let error
      if (editing === 'new') {
        ;({ error } = await supabase
          .from('suppliers')
          .insert({ ...payload, organization_id: ORGANIZATION_ID }))
      } else {
        ;({ error } = await supabase
          .from('suppliers')
          .update(payload)
          .eq('id', editing.id))
      }
      if (error) throw error
      setEditing(null)
      setFeedback({ type: 'success', text: 'נשמר בהצלחה ✓' })
      await load()
    } catch (err) {
      setFormError(translateError(err))
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(row) {
    const { error } = await supabase
      .from('suppliers')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)
    if (error) {
      setFeedback({ type: 'error', text: translateError(error) })
    } else {
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)),
      )
    }
  }

  return (
    <div>
      <AdminHeader
        title="ניהול ספקים"
        subtitle={`${filtered.length} ספקים`}
        onAdd={canEdit ? openNew : null}
        addLabel="+ ספק חדש"
      />

      <Feedback feedback={feedback} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש ספק…"
          className={`${inputCls} max-w-xs`}
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          הצג גם מושבתים
        </label>
      </div>

      <ListShell loading={loading} empty={filtered.length === 0}>
        {filtered.map((r) => (
          <RowShell key={r.id}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-slate-800">
                  {r.name}
                </span>
                {!r.is_active && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    מושבת
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-xs text-slate-400">
                {[r.department, catName(r.default_category_id)]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </div>
            </div>
            {canEdit && (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => toggleActive(r)}
                  className="text-xs text-slate-500 hover:text-teal-600"
                >
                  {r.is_active ? 'השבת' : 'הפעל'}
                </button>
                <Btn variant="secondary" onClick={() => openEdit(r)}>
                  עריכה
                </Btn>
              </div>
            )}
          </RowShell>
        ))}
      </ListShell>

      <Modal
        open={editing !== null}
        title={editing === 'new' ? 'ספק חדש' : 'עריכת ספק'}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Btn onClick={handleSave} disabled={saving}>
              {saving ? 'שומר…' : 'שמירה'}
            </Btn>
            <Btn variant="secondary" onClick={() => setEditing(null)}>
              ביטול
            </Btn>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}
          <Field label="שם ספק" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label="מחלקה">
            <input
              className={inputCls}
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
              placeholder="אופציונלי"
            />
          </Field>
          <Field label="קטגוריית ברירת מחדל">
            <select
              className={selectCls}
              value={form.default_category_id}
              onChange={(e) =>
                setForm({ ...form, default_category_id: e.target.value })
              }
            >
              <option value="">— ללא —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="הערות">
            <textarea
              className={`${inputCls} resize-y`}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="אופציונלי"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            ספק פעיל
          </label>
        </form>
      </Modal>
    </div>
  )
}

// ── Shared admin layout bits (used by the other admin screens too) ──
export function AdminHeader({ title, subtitle, onAdd, addLabel }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {onAdd && <Btn onClick={onAdd}>{addLabel}</Btn>}
    </div>
  )
}

export function ListShell({ loading, empty, children }) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-400">
        טוען…
      </div>
    )
  }
  if (empty) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-slate-400">
        אין רשומות להצגה.
      </div>
    )
  }
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {children}
    </div>
  )
}

export function RowShell({ children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      {children}
    </div>
  )
}

export function translateError(err) {
  const m = (err?.message || '').toLowerCase()
  if (m.includes('row-level security') || m.includes('violates row-level'))
    return 'אין לך הרשאה לבצע פעולה זו.'
  if (m.includes('duplicate') || m.includes('unique'))
    return 'רשומה עם שם זה כבר קיימת.'
  if (m.includes('foreign key'))
    return 'לא ניתן למחוק — הרשומה בשימוש ברשומות אחרות.'
  return err?.message || 'הפעולה נכשלה.'
}
