import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const CARDS = [
  {
    to: '/admin/suppliers',
    title: 'ספקים',
    desc: 'ניהול רשימת הספקים — הוספה, עריכה והפעלה/השבתה.',
    icon: '🏢',
    need: 'edit',
  },
  {
    to: '/admin/categories',
    title: 'קטגוריות',
    desc: 'ניהול קטגוריות ההוצאות וההיררכיה שלהן.',
    icon: '🗂️',
    need: 'edit',
  },
  {
    to: '/admin/members',
    title: 'חברי ארגון',
    desc: 'ניהול חברים והרשאות (owner / admin / editor / viewer).',
    icon: '👥',
    need: 'admin',
  },
]

export default function AdminHome() {
  const { canEdit, isAdmin, role } = useAuth()

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">ניהול</h1>
        <p className="mt-1 text-sm text-slate-500">
          הגדרות ונתוני יסוד של TalkOn.
          {role && (
            <span className="ms-1">
              ההרשאה שלך: <span className="font-medium">{role}</span>.
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => {
          const allowed = c.need === 'admin' ? isAdmin : canEdit
          return (
            <Link
              key={c.to}
              to={c.to}
              className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:shadow-sm"
            >
              <div className="text-2xl">{c.icon}</div>
              <div className="mt-3 font-semibold text-slate-800 group-hover:text-teal-700">
                {c.title}
              </div>
              <p className="mt-1 text-sm text-slate-500">{c.desc}</p>
              {!allowed && (
                <p className="mt-2 text-xs text-amber-600">
                  צפייה בלבד — נדרשת הרשאת {c.need === 'admin' ? 'מנהל' : 'עורך'}.
                </p>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
