import { FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/authStore';
import { describeError } from '@/lib/error';

const HIGHLIGHTS = [
  {
    emoji: '🧠',
    title: 'Review feedback',
    text: 'Mentor notes and deep dives stay easy to scan.',
    className: 'bg-sky-50 text-sky-900 border-sky-100',
  },
  {
    emoji: '⚡',
    title: 'Resume quickly',
    text: 'Jump back into active sessions without friction.',
    className: 'bg-amber-50 text-amber-900 border-amber-100',
  },
  {
    emoji: '📈',
    title: 'Track progress',
    text: 'Keep attempts, scores, and spend visible together.',
    className: 'bg-emerald-50 text-emerald-900 border-emerald-100',
  },
] as const;

// Returns to the originally-requested location after a successful
// login, falling back to /home if there's no prior route in state.
function useReturnTo(): string {
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return from ?? '/home';
}

export function LoginPage() {
  const navigate = useNavigate();
  const returnTo = useReturnTo();
  const setAuth = useAuthStore((s) => s.setAuth);
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({
    mutationFn: authService.login,
    onSuccess: ({ user, token }) => {
      // Wipe any cached data from a previous session before storing
      // the new token. Without this, TanStack Query would briefly
      // show the previous user's questions/sessions in the sidebar
      // until the new fetches return — a display-only leak (backend
      // ownership filters block the actual data) but jarring UX.
      queryClient.clear();
      setAuth(user, token);
      navigate(returnTo, { replace: true });
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate({ email: email.trim(), password });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#f2f7f5_38%,#fff7ed_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-stretch gap-5 lg:grid-cols-[minmax(0,1.1fr)_420px]">
        <aside className="flex flex-col justify-between overflow-hidden rounded-2xl border border-teal-100 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(240,253,250,0.82)_100%)] p-8 shadow-sm backdrop-blur">
          <div>
            <div className="mt-6 inline-flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-xl font-bold text-white shadow-sm ring-2 ring-teal-500/20">
                DC
              </span>
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.28em] text-teal-700">
                  Design Coach
                </div>
                <div className="text-2xl font-semibold tracking-tight text-gray-950 sm:text-3xl">
                  The workspace for system prompts.
                </div>
              </div>
            </div>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
              Design and review system prompts with a cleaner workspace.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-gray-600 sm:text-base">
              Sign in to continue where you left off, review mentor feedback, and keep your session
              history in one place.
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
                <span aria-hidden="true">✨</span>
                What you get after sign in
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-700">
                <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">Questions</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Mentor feedback</span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Daily spend</span>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Session history</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex items-center">
          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
            <div className="border-b border-gray-100 bg-gradient-to-r from-slate-950 via-slate-800 to-teal-900 px-6 py-5 text-white">
              <h2 className="text-2xl font-semibold tracking-tight">🔐 Sign in</h2>
              <p className="mt-1 text-sm text-teal-100">
                New here?{' '}
                <Link to="/signup" className="font-medium text-white hover:text-teal-100">
                  Create an account
                </Link>
                .
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5 px-6 py-6">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email</span>
                <div className="mt-1 flex h-11 items-center rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-100">
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
                <span className="text-sm font-medium text-gray-700">Password</span>
                <div className="mt-1 flex h-11 items-center rounded-lg border border-gray-300 bg-white shadow-sm focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-100">
                  <span className="flex h-full items-center px-3 text-gray-400" aria-hidden="true">
                    🔒
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
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
              </label>

              {mutation.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {describeError(mutation.error)}
                </div>
              )}

              <button
                type="submit"
                disabled={mutation.isPending || !email || !password}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {mutation.isPending ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
