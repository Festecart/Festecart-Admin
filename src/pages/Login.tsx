import { useEffect, useState, FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'

type View = 'login' | 'forgot'

const RESEND_COOLDOWN_S = 60
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputCls =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent'

export default function Login() {
  const { user, isAdmin, loading, error, login, resetPassword } = useAuth()

  const [view,         setView]         = useState<View>('login')
  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting,   setSubmitting]   = useState(false)

  // Forgot-password state
  const [resetSent,  setResetSent]  = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)
  const [cooldown,   setCooldown]   = useState(0)

  // Resend cooldown timer (hooks must stay above any early return)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (!loading && user && isAdmin) return <Navigate to="/" replace />

  const switchView = (next: View) => {
    setView(next)
    setPassword('')
    setShowPassword(false)
    setResetSent(false)
    setResetError(null)
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await login(email.trim(), password)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting || cooldown > 0) return

    const trimmed = email.trim()
    if (!EMAIL_RE.test(trimmed)) {
      setResetError('Please enter a valid email address.')
      return
    }

    setSubmitting(true)
    setResetError(null)
    setResetSent(false)
    try {
      await resetPassword(trimmed)
      setResetSent(true)
      setCooldown(RESEND_COOLDOWN_S)
    } catch {
      setResetError('Unable to send the reset link right now. Please try again shortly.')
    } finally {
      setSubmitting(false)
    }
  }

  const isForgot = view === 'forgot'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-red-600 rounded-xl mb-3">
            <span className="text-white font-bold text-xl">F</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Festecart Admin</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isForgot ? 'Reset your password' : 'Sign in to manage orders'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {!isForgot ? (
            /* ───────────── Sign in ───────────── */
            <form onSubmit={handleLogin} className="space-y-4" noValidate={false}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="admin@festecart.com"
                  className={inputCls}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => switchView('forgot')}
                    className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    onMouseDown={e => e.preventDefault()} // keep caret in the input
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:text-red-600 rounded-r-lg"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || loading}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
              >
                {(submitting || loading) && <Loader2 size={16} className="animate-spin" />}
                Sign In
              </button>
            </form>
          ) : (
            /* ───────────── Forgot password ───────────── */
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter the email linked to your admin account and we'll send you a link to reset your password.
              </p>

              <div>
                <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email address
                </label>
                <input
                  id="reset-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="admin@festecart.com"
                  className={inputCls}
                />
              </div>

              {resetError && (
                <div role="alert" className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle size={16} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{resetError}</p>
                </div>
              )}

              {resetSent && (
                <div role="status" className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 size={16} className="text-green-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-green-700">
                    If an account exists for this email, a reset link has been sent. Check your inbox and spam folder.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || cooldown > 0}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 disabled:cursor-not-allowed text-white font-medium py-2.5 px-4 rounded-lg transition-colors text-sm"
              >
                {submitting && <Loader2 size={16} className="animate-spin" />}
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : resetSent
                    ? 'Resend reset link'
                    : 'Send reset link'}
              </button>

              <button
                type="button"
                onClick={() => switchView('login')}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
              >
                <ArrowLeft size={14} />
                Back to sign in
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Only super_admin accounts can access this panel
        </p>
      </div>
    </div>
  )
}