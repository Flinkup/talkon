import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { ORGANIZATION_ID } from '../lib/constants'
import { Field, inputCls, selectCls, Btn, Feedback } from '../components/ui'
import Modal from '../components/Modal'
import {
  AdminHeader,
  ListShell,
  RowShell,
  translateError,
} from './SuppliersAdmin'

const emptyForm = () => ({
  name: '',
  parent_id: '',
  sort_order: 100,
  is_active: true,
})

// Order categories parent-then-children with a depth for indentation.
function buildTree(categories) {
  const byParent = new Map()
  for (const c of categories) {
    const key = c.parent_id ?? 'root'
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(c)
  }
  const sortFn = (a, b) =>
    (a.sort_order ?? 100) - (b.sort_order ?? 100) ||
    a.name.localeCompare(b.name, 'he')
  const out = []
  const walk = (key, depth) => {
    const kids = (byParent.get(key) ?? []).slice().sort(sortFn)
    for (const c of kids) {
      out.push({ ...c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk('root', 0)
  const seen = new Set(out.map((c) => c.id))
  for (const c of categories) if (!seen.has(c.id)) out.push({ ...c, depth: 0 })
  return out
}

export default function CategoriesAdmin() {
  const { canEdit } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)

  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('expense_categories')
      .select('id, name, parent_id, sort_order, is_active')
      .order('sort_order')
    if (error) setFeedback({ type: 'error', text: error.message })
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const tree = useMemo(() => buildTree(rows), [rows])
  const nameById = useMemo(
    () => new Map(rows.map((r) => [r.id, r.name])),
    [rows],
  )

  function openNew() {
    setForm(emptyForm())
    setFormError('')
    setEditing('new')
  }
  function openEdit(row) {
    setForm({
      name: row.name ?? '',
      parent_id: row.parent_id ?? '',
      sort_order: row.sort_order ?? 100,
      is_active: row.is_active,
    })
    setFormError('')
    setEditing(row)
  }

  // Valid parents = all active categories except self (prevents trivial cycles).
  const parentOptions = useMemo(
    () =>
      rows
        .filter((r) => r.is_active && (editing === 'new' || r.id !== editing?.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [rows, editing],
  )

  async function handleSave(e) {
    e.preventDefault()
    if (!form.name.trim()) {
      setFormError('שם קטגוריה הוא שדה חובה')
      return
    }
    setSaving(true)
    setFormError('')
    const payload = {
      name: form.name.trim(),
      parent_id: form.parent_id || null,
      sort_order: Number(form.sort_order) || 100,
      is_active: form.is_active,
    }
    try {
      let error
      if (editing === 'new') {
        ;({ error } = await supabase
          .from('expense_categories')
          .insert({ ...payload, organization_id: ORGANIZATION_ID }))
      } else {
        ;({ error } = await supabase
          .from('expense_categories')
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
      .from('expense_categories')
      .update({ is_active: !row.is_active })
      .eq('id', row.id)
    if (error) setFeedback({ type: 'error', text: translateError(error) })
    else
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)),
      )
  }

  return (
    <div>
      <AdminHeader
        title="ניהול קטגוריות"
        subtitle={`${rows.length} קטגוריות`}
        onAdd={canEdit ? openNew : null}
        addLabel="+ קטגוריה חדשה"
      />

      <Feedback feedback={feedback} />

      <ListShell loading={loading} empty={tree.length === 0}>
        {tree.map((r) => (
          <RowShell key={r.id}>
            <div className="min-w-0" style={{ paddingInlineStart: r.depth * 20 }}>
              <div className="flex items-center gap-2">
                {r.depth > 0 && <span className="text-slate-300">↳</span>}
                <span className="truncate font-medium text-slate-800">
                  {r.name}
                </span>
                {!r.is_active && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    מושבת
                  </span>
                )}
              </div>
            </div>
            {canEdit && (
              <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
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
        title={editing === 'new' ? 'קטגוריה חדשה' : 'עריכת קטגוריה'}
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
          <Field label="שם קטגוריה" required>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </Field>
          <Field label="קטגוריית אב">
            <select
              className={selectCls}
              value={form.parent_id}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
            >
              <option value="">— קטגוריה ראשית —</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="סדר תצוגה">
            <input
              type="number"
              className={inputCls}
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            קטגוריה פעילה
          </label>
        </form>
      </Modal>
    </div>
  )
}
