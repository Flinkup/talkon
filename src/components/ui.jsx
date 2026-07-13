// Shared UI primitives — TalkOn design system.

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-xs outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-100'

export const selectCls = `${inputCls} bg-white`

export function Field({ label, required, error, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-teal-500"> *</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-400">{hint}</span>
      ) : null}
    </label>
  )
}

const BTN_VARIANTS = {
  primary:
    'bg-teal-700 text-white shadow-sm hover:bg-teal-800 active:bg-teal-900',
  gold: 'bg-gold-500 text-ink-800 shadow-sm hover:bg-gold-600 active:bg-gold-700',
  secondary:
    'border border-slate-300 bg-white text-ink-700 shadow-xs hover:bg-slate-50 active:bg-slate-100',
  ghost: 'text-ink-600 hover:bg-slate-100 active:bg-slate-200',
  danger:
    'border border-red-200 bg-white text-red-600 hover:bg-red-50 active:bg-red-100',
}
const BTN_SIZES = {
  sm: 'px-3.5 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

// Pill-shaped buttons are the TalkOn brand signature.
export function Btn({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-150 ease-[cubic-bezier(0.2,0.8,0.2,1)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`}
      {...props}
    />
  )
}

export function Card({ className = '', children }) {
  return (
    <div
      className={`rounded-2xl border border-hairline bg-surface shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-600',
  brand: 'bg-teal-50 text-teal-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-600',
}
export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Feedback({ feedback }) {
  if (!feedback) return null
  const tone =
    feedback.type === 'success'
      ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
      : feedback.type === 'error'
        ? 'bg-red-50 text-red-700 ring-red-100'
        : 'bg-amber-50 text-amber-800 ring-amber-100'
  return (
    <div
      className={`animate-fade-in mb-4 rounded-xl px-4 py-3 text-sm ring-1 ${tone}`}
    >
      {feedback.text}
    </div>
  )
}

// A shimmering skeleton row block.
export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-lg ${className}`} />
}
