import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Wordmark } from '../components/Logo'
import { Btn, Field, inputCls } from '../components/ui'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('הסיסמה צריכה להכיל לפחות 6 תווים.')
      return
    }
    if (password !== confirmation) {
      setError('הסיסמאות אינן תואמות.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setSubmitting(false)
      return
    }

    await supabase.auth.signOut()
    navigate('/login', {
      replace: true,
      state: { info: 'הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.' },
    })
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <p className="text-sm text-slate-500">טוען...</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <div className="w-full max-w-sm rounded-lg border border-hairline bg-surface p-6 text-center shadow-lg">
          <Wordmark className="!text-[2.2rem]" />
          <h1 className="mt-6 text-lg font-semibold text-slate-800">
            קישור האיפוס אינו תקף
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            ייתכן שהקישור פג. אפשר לבקש קישור חדש ממסך ההתחברות.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-block text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            חזרה להתחברות
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Wordmark className="!text-[2.6rem]" />
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-lg border border-hairline bg-surface p-6 shadow-lg"
        >
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              קביעת סיסמה חדשה
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              בחרי סיסמה חדשה לחשבון שלך.
            </p>
          </div>

          <Field label="סיסמה חדשה">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </Field>

          <Field label="אימות סיסמה">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </Field>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-100">
              {error}
            </div>
          )}

          <Btn
            type="submit"
            size="lg"
            disabled={submitting}
            className="w-full"
          >
            {submitting ? 'מעדכן...' : 'עדכון סיסמה'}
          </Btn>
        </form>
      </div>
    </main>
  )
}
