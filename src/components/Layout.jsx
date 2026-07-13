import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import Logo from './Logo'

const NAV = [
  { to: '/expenses', label: 'הוצאות' },
  { to: '/admin', label: 'ניהול' },
]

const linkCls = ({ isActive }) =>
  `rounded-full px-3.5 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-teal-50 text-teal-700'
      : 'text-ink-600 hover:bg-slate-100 hover:text-ink-800'
  }`

export default function Layout() {
  const { user, role, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  return (
    <div className="min-h-screen bg-canvas">
      {/* ---- Top navigation (talkon.health style) ---- */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:h-16 sm:px-6">
          {/* Start (RTL right): logo + inline nav */}
          <div className="min-w-0 flex items-center gap-3 sm:gap-6">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `shrink-0 rounded-full px-1.5 py-1 transition sm:px-2 sm:py-1.5 ${
                  isActive ? 'bg-teal-50 ring-1 ring-teal-100' : 'hover:bg-slate-100'
                }`
              }
              aria-label="מסך הבית"
              title="מסך הבית"
            >
              <Logo />
            </NavLink>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkCls}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* End (RTL left): user + logout, mobile toggle */}
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2.5 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500 text-sm font-semibold text-white">
                {(user?.email?.[0] || '?').toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="max-w-[11rem] truncate text-sm font-medium text-ink-800">
                  {user?.email}
                </div>
                {role && (
                  <div className="text-xs capitalize text-slate-400">{role}</div>
                )}
              </div>
            </div>
            <button
              onClick={signOut}
              title="התנתקות"
              aria-label="התנתקות"
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-ink-800"
            >
              <IconLogout />
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="תפריט"
              className="rounded-full p-2 text-ink-700 transition hover:bg-slate-100 md:hidden"
            >
              {menuOpen ? <IconClose /> : <IconMenu />}
            </button>
          </div>
        </div>

        {/* ---- Mobile menu ---- */}
        {menuOpen && (
          <nav className="animate-fade-in border-t border-hairline bg-white px-3 py-2 shadow-sm md:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-ink-700 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mt-1 flex items-center gap-2 border-t border-hairline px-3 pt-2 text-xs text-slate-500">
              {user?.email}
              {role && <span className="capitalize">· {role}</span>}
            </div>
          </nav>
        )}
      </header>

      {/* ---- Main content ---- */}
      <main>
        <div
          key={location.pathname}
          className="animate-fade-in mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-8"
        >
          <Outlet />
        </div>
      </main>
    </div>
  )
}

/* ---- Icons ---- */
function IconMenu() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  )
}





