import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/authStore';
import { describeError } from '@/lib/error';

// Mirrors the backend SignupDto: email + password (8–50 chars,
// matching the @MinLength(8) + @MaxLength(50) on the DTO) + displayName
// (1–50 chars, required, trimmed before send).
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 50;
const NAME_MIN = 1;
const NAME_MAX = 50;

const HIGHLIGHTS = [
  {
    emoji: '✨',
    title: 'Create your workspace',
    text: 'Start with a fresh account and keep your progress separate.',
    className: 'bg-sky-50 text-sky-900 border-sky-100',
  },
  {
    emoji: '🛠',
    title: 'Build faster',
    text: 'Store questions, attempts, and mentor feedback in one place.',
    className: 'bg-amber-50 text-amber-900 border-amber-100',
  },
  {
    emoji: '📊',
    title: 'Watch your usage',
    text: 'See spend, scores, and session history as you go.',
    className: 'bg-emerald-50 text-emerald-900 border-emerald-100',
  },
] as const;

export function SignupPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: authService.signup,
    onSuccess: ({ user, token }) => {
      // See LoginPage — wipe any cached data from a previous session
      // before storing the new token.
      queryClient.clear();
      setAuth(user, token);
      navigate('/home', { replace: true });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      email: email.trim(),
      password,
      displayName: displayName.trim(),
    });
  };

  const trimmedName = displayName.trim();
  const nameOk = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX;
  const passwordOk = password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eef4ff_38%,#ecfeff_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-stretch gap-5 lg:grid-cols-[minmax(0,1.1fr)_420px]">
        <aside className="flex flex-col justify-between overflow-hidden rounded-2xl border border-blue-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(239,246,255,0.9)_100%)] p-8 shadow-sm backdrop-blur">
          <div>
            <div className="mt-6 inline-flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-cyan-500 to-emerald-400 text-xl font-bold text-white shadow-lg shadow-blue-200">
                DC
              </span>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-700">
                  Design Coach
                </div>
                <div className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
                  Start your system design workspace.
                </div>
              </div>
            </div>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
              Create an account and keep every attempt in one place.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-gray-600 sm:text-base">
              Set up your workspace to capture questions, mentor feedback, and scores without
              losing context between sessions.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {HIGHLIGHTS.map((item) => (
              <div
                key={item.title}
                className={`rounded-xl border px-4 py-4 text-sm shadow-sm ${item.className}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/90 text-lg shadow-sm">
                    <span aria-hidden="true">{item.emoji}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-1 text-sm leading-5 text-gray-600">{item.text}</div>
                  </div>
                </div>
              </div>
            ))}
            <div className="sm:col-span-2 rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                <span aria-hidden="true">🚀</span>
                Ready after signup
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-700">
                <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">Questions</span>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-violet-700">Mentor feedback</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Daily spend</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Session history</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex items-center">
          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 bg-gradient-to-r from-slate-950 via-blue-900 to-cyan-900 px-6 py-5 text-white">
              <h2 className="text-2xl font-semibold tracking-tight">✨ Create an account</h2>
              <p className="mt-1 text-sm text-blue-100">
                Already have one?{' '}
                <Link to="/login" className="font-medium text-white hover:text-blue-100">
                  Sign in
                </Link>
                .
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 px-6 py-6">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Name</span>
                <div className="mt-1 flex h-11 items-center rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                  <span className="flex h-full items-center px-3 text-gray-400" aria-hidden="true">
                    👤
                  </span>
                  <input
                    type="text"
                    autoComplete="name"
                    required
                    minLength={NAME_MIN}
                    maxLength={NAME_MAX}
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="h-full w-full border-0 bg-transparent px-0 text-sm outline-none ring-0 placeholder:text-gray-400 focus:ring-0"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email</span>
                <div className="mt-1 flex h-11 items-center rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                  <span className="flex h-full items-center px-3 text-gray-400" aria-hidden="true">
                    @
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-full w-full border-0 bg-transparent px-0 text-sm outline-none ring-0 placeholder:text-gray-400 focus:ring-0"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">
                  Password{' '}
                  <span className="text-xs font-normal text-gray-500">
                    ({PASSWORD_MIN}–{PASSWORD_MAX} characters)
                  </span>
                </span>
                <div className="mt-1 flex h-11 items-center rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                  <span className="flex h-full items-center px-3 text-gray-400" aria-hidden="true">
                    🔒
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={PASSWORD_MIN}
                    maxLength={PASSWORD_MAX}
                    placeholder="Create a password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-full w-full border-0 bg-transparent px-0 text-sm outline-none ring-0 placeholder:text-gray-400 focus:ring-0"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="flex h-full items-center px-3 text-gray-500 hover:text-gray-800"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span aria-hidden="true">{showPassword ? '🙈' : '👁'}</span>
                  </button>
                </div>
                {password.length > 0 && !passwordOk && (
                  <span className="mt-1 block text-xs text-red-600">
                    Password must be {PASSWORD_MIN}–{PASSWORD_MAX} characters.
                  </span>
                )}
              </label>

              {mutation.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {describeError(mutation.error)}
                </div>
              )}

              <button
                type="submit"
                disabled={mutation.isPending || !nameOk || !email || !passwordOk}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {mutation.isPending ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
