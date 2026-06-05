import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { DailySpendBadge } from '@components/layout/DailySpendBadge';
import { useAuthStore } from '@/store/authStore';

const SIDEBAR_COLLAPSED_KEY = 'app-sidebar-collapsed';

export function AppLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const homeMatch = useMatch('/home');
  const questionMatch = useMatch('/questions/:id');
  const newPracticeMatch = useMatch('/practice/new');
  const isQuestionsActive = !!homeMatch || !!questionMatch || !!newPracticeMatch;
  const currentUser = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    if (!profileOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) return;
      setProfileOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [profileOpen]);

  const onLogout = () => {
    clearAuth();
    queryClient.clear();
    setProfileOpen(false);
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/home" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-cyan-500 to-emerald-400 text-sm font-bold text-white shadow-lg shadow-blue-100">
              DC
            </span>
            <span className="truncate text-base font-semibold text-gray-950">
              Design Coach
            </span>
          </Link>
        </div>

        <div className="flex min-w-0 items-center gap-3">
          {currentUser && (
            <div ref={profileMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-gray-100"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold uppercase text-white">
                  {(currentUser.displayName || currentUser.email).slice(0, 1)}
                </div>
                <div className="hidden min-w-0 text-left sm:block">
                  <div className="truncate text-sm font-medium text-gray-950">
                    {currentUser.displayName || currentUser.email}
                  </div>
                  <div className="truncate text-xs text-gray-500">{currentUser.email}</div>
                </div>
              </button>

              {profileOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
                >
                  <div className="bg-gradient-to-r from-gray-950 to-blue-900 px-4 py-4 text-white">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-semibold uppercase ring-1 ring-white/25">
                        {(currentUser.displayName || currentUser.email).slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {currentUser.displayName || currentUser.email}
                        </div>
                        <div className="truncate text-xs text-blue-100">{currentUser.email}</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3">
                    <DailySpendBadge variant="menu" />
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={onLogout}
                        className="flex h-9 w-full items-center justify-center rounded-md bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`relative shrink-0 border-r border-gray-200 bg-white transition-[width] duration-150 ease-in-out ${
            collapsed ? 'w-12' : 'w-60'
          }`}
        >
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`absolute top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-100 hover:text-gray-900 ${
              collapsed ? '-right-4' : '-right-4'
            }`}
          >
            <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          </button>
          <nav className="p-2">
            <Link
              to="/home"
              title="Questions"
              aria-label="Questions"
              className={`flex h-9 items-center rounded-md text-sm font-medium transition-colors ${
                collapsed ? 'justify-center px-0' : 'gap-2 px-3'
              } ${
                isQuestionsActive
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-950'
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex h-5 w-5 items-center justify-center rounded text-xs font-semibold ${
                  isQuestionsActive ? 'bg-white/15 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                Q
              </span>
              {!collapsed && <span>Questions</span>}
            </Link>
          </nav>
        </aside>

        <main className="flex-1 overflow-y-auto px-4 py-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
