import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { ORGANIZATION_ID } from '../lib/constants'
import { Btn, Feedback, selectCls, inputCls, Field } from '../components/ui'
import Modal from '../components/Modal'
import { AdminHeader, ListShell, RowShell, translateError } from './SuppliersAdmin'

const ROLES = ['owner', 'admin', 'editor', 'viewer']
const ROLE_LABELS = {
  owner: 'בעלים',
  admin: 'מנהל',
  editor: 'עורך',
  viewer: 'צופה',
}

export default function MembersAdmin() {
  const { isAdmin, user } = useAuth()
  const [members, setMembers] = useState([])
  const [profiles, setProfiles] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const [addOpen, setAddOpen] = useState(false)
  const [addEmail, setAddEmail] = useState('')
  const [addRole, setAddRole] = useState('editor')

  async function load() {
    setLoading(true)
    const [mem, prof] = await Promise.all([
      supabase
        .from('organization_members')
        .select('user_id, role, is_active, created_at')
        .eq('organization_id', ORGANIZATION_ID),
      supabase.from('profiles').select('id, email, full_name'),
    ])
    if (mem.error) setFeedback({ type: 'error', text: mem.error.message })
    setMembers(
      (mem.data ?? []).sort(
        (a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role),
      ),
    )
    setProfiles(new Map((prof.data ?? []).map((p) => [p.id, p])))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const activeOwners = useMemo(
    () => members.filter((m) => m.role === 'owner' && m.is_active).length,
    [members],
  )

  function guardOwner(m) {
    if (m.role === 'owner' && m.is_active && activeOwners <= 1) {
      setFeedback({
        type: 'warning',
        text: 'לא ניתן — זהו הבעלים הפעיל האחרון בארגון.',
      })
      return false
    }
    return true
  }

  async function changeRole(m, role) {
    if (role === m.role) return
    if (m.role === 'owner' && role !== 'owner' && !guardOwner(m)) return
    setBusyId(m.user_id)
    const { error } = await supabase
      .from('organization_members')
      .update({ role })
      .eq('organization_id', ORGANIZATION_ID)
      .eq('user_id', m.user_id)
    if (error) setFeedback({ type: 'error', text: translateError(error) })
    else {
      setMembers((prev) =>
        prev.map((x) => (x.user_id === m.user_id ? { ...x, role } : x)),
      )
      setFeedback({ type: 'success', text: 'ההרשאה עודכנה ✓' })
    }
    setBusyId(null)
  }

  async function toggleActive(m) {
    if (m.user_id === user?.id) {
      setFeedback({ type: 'warning', text: 'לא ניתן להשבית את עצמך.' })
      return
    }
    if (m.is_active && !guardOwner(m)) return
    setBusyId(m.user_id)
    const { error } = await supabase
      .from('organization_members')
      .update({ is_active: !m.is_active })
      .eq('organization_id', ORGANIZATION_ID)
      .eq('user_id', m.user_id)
    if (error) setFeedback({ type: 'error', text: translateError(error) })
    else {
      setMembers((prev) =>
        prev.map((x) =>
          x.user_id === m.user_id ? { ...x, is_active: !x.is_active } : x,
        ),
      )
    }
    setBusyId(null)
  }

  async function removeMember(m) {
    if (m.user_id === user?.id) {
      setFeedback({ type: 'warning', text: 'לא ניתן להסיר את עצמך.' })
      return
    }
    if (!guardOwner(m)) return
    const p = profiles.get(m.user_id)
    if (!window.confirm(`להסיר את ${p?.email || 'החבר'} מהארגון?`)) return
    setBusyId(m.user_id)
    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', ORGANIZATION_ID)
      .eq('user_id', m.user_id)
    if (error) setFeedback({ type: 'error', text: translateError(error) })
    else {
      setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id))
      setFeedback({ type: 'success', text: 'החבר הוסר ✓' })
    }
    setBusyId(null)
  }

  const addSql = `insert into public.organization_members (organization_id, user_id, role, is_active)
select '${ORGANIZATION_ID}', u.id, '${addRole}', true
from auth.users u
where u.email = '${addEmail.trim() || 'user@example.com'}'
on conflict (organization_id, user_id)
do update set role = '${addRole}', is_active = true;`

  return (
    <div>
      <AdminHeader
        title="חברי ארגון"
        subtitle={`${members.length} חברים`}
        onAdd={isAdmin ? () => setAddOpen(true) : null}
        addLabel="+ הוספת חבר"
      />

      <Feedback feedback={feedback} />

      {!isAdmin && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          צפייה בלבד — ניהול חברים דורש הרשאת מנהל (admin / owner).
        </div>
      )}

      <ListShell loading={loading} empty={members.length === 0}>
        {members.map((m) => {
          const p = profiles.get(m.user_id)
          const isSelf = m.user_id === user?.id
          return (
            <RowShell key={m.user_id}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-800">
                    {p?.email || m.user_id}
                  </span>
                  {isSelf && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-600">
                      אתה
                    </span>
                  )}
                  {!m.is_active && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      מושבת
                    </span>
                  )}
                </div>
                {p?.full_name && (
                  <div className="mt-0.5 truncate text-xs text-slate-400">
                    {p.full_name}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {isAdmin ? (
                  <select
                    value={m.role}
                    disabled={busyId === m.user_id}
                    onChange={(e) => changeRole(m, e.target.value)}
                    className={`${selectCls} w-auto py-1 text-sm`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-slate-600">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                )}
                {isAdmin && !isSelf && (
                  <>
                    <button
                      onClick={() => toggleActive(m)}
                      disabled={busyId === m.user_id}
                      className="text-xs text-slate-500 hover:text-teal-600"
                    >
                      {m.is_active ? 'השבת' : 'הפעל'}
                    </button>
                    <button
                      onClick={() => removeMember(m)}
                      disabled={busyId === m.user_id}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      הסר
                    </button>
                  </>
                )}
              </div>
            </RowShell>
          )
        })}
      </ListShell>

      {/* Add-member: RLS can't discover a brand-new user client-side, so guide via SQL. */}
      <Modal
        open={addOpen}
        title="הוספת חבר לארגון"
        onClose={() => setAddOpen(false)}
        footer={
          <Btn variant="secondary" onClick={() => setAddOpen(false)}>
            סגירה
          </Btn>
        }
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            כדי לצרף חבר חדש, הוא צריך קודם <b>להירשם</b> למערכת (מסך ההתחברות →
            הרשמה). לאחר מכן, מטעמי אבטחה, הצירוף מתבצע דרך ה-SQL Editor של Supabase
            (הלקוח אינו יכול לאתר משתמש שאינו חבר עדיין).
          </p>
          <Field label="אימייל החבר">
            <input
              className={inputCls}
              dir="ltr"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </Field>
          <Field label="הרשאה">
            <select
              className={selectCls}
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]} ({r})
                </option>
              ))}
            </select>
          </Field>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-slate-700">SQL להרצה:</span>
              <button
                onClick={() => navigator.clipboard?.writeText(addSql)}
                className="text-xs text-teal-600 hover:underline"
              >
                העתק
              </button>
            </div>
            <pre
              dir="ltr"
              className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100"
            >
              {addSql}
            </pre>
          </div>
        </div>
      </Modal>
    </div>
  )
}
