import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { Wordmark } from '../components/Logo'
import { Btn, Field, inputCls } from '../components/ui'

export default function Login() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const from = location.state?.from?.pathname || '/expenses/new'

  // Already logged in → bounce to the app.
  if (!loading && session) {
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setSubmitting(true)

    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        navigate(from, { replace: true })
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) throw error
        if (data.session) {
          navigate(from, { replace: true })
        } else {
          setInfo('נרשמת בהצלחה. ייתכן שנדרש אימות אימייל לפני התחברות.')
          setMode('signin')
        }
      }
    } catch (err) {
      setError(translateAuthError(err?.message))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      {/* Ambient brand backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-canvas" />
      <div className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-teal-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-[-10%] h-96 w-96 rounded-full bg-gold-400/20 blur-3xl" />

      <div className="animate-scale-in relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Wordmark className="!text-[2.6rem]" />
          <p className="mt-2 text-sm text-slate-500">מערכת ניהול הוצאות</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-hairline bg-surface/80 p-6 shadow-lg backdrop-blur-xl"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              {mode === 'signin' ? 'התחברות לחשבון' : 'יצירת חשבון'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              {mode === 'signin'
                ? 'הזן את פרטי ההתחברות שלך'
                : 'הרשמה למערכת ההוצאות'}
            </p>
          </div>

          <Field label="אימייל">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@company.com"
              dir="ltr"
            />
          </Field>

          <Field label="סיסמה">
            <input
              type="password"
              required
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
              dir="ltr"
            />
          </Field>

          {error && (
            <div className="animate-fade-in rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          )}
          {info && (
            <div className="animate-fade-in rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-100">
              {info}
            </div>
          )}

          <Btn
            type="submit"
            size="lg"
            disabled={submitting}
            className="w-full"
          >
            {submitting
              ? 'רגע…'
              : mode === 'signin'
                ? 'התחברות'
                : 'הרשמה'}
          </Btn>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError('')
              setInfo('')
            }}
            className="w-full text-sm text-slate-500 transition hover:text-teal-600"
          >
            {mode === 'signin'
              ? 'אין לך משתמש? להרשמה'
              : 'כבר יש לך משתמש? להתחברות'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          TalkOn · Reclaim your time, deliver better care
        </p>
      </div>
    </div>
  )
}

function translateAuthError(message) {
  if (!message) return 'אירעה שגיאה. נסה שוב.'
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'אימייל או סיסמה שגויים.'
  if (m.includes('email not confirmed')) return 'האימייל טרם אומת.'
  if (m.includes('user already registered')) return 'המשתמש כבר קיים. נסה להתחבר.'
  if (m.includes('password should be at least'))
    return 'הסיסמה קצרה מדי (לפחות 6 תווים).'
  return message
}
