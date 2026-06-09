import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Editor from '@monaco-editor/react';
import { api } from '@/services/api';
import { sessionsService } from '@/services/sessions.service';
import { DAILY_SPEND_QUERY_KEY } from '@components/layout/DailySpendBadge';
import { snapshotsService } from '@/services/snapshots.service';
import { useSessionStore, computeElapsedMs } from '@/store/sessionStore';
import { HintChatPanel } from '@/components/HintChatPanel';
import { MermaidBlock } from '@/components/MermaidBlock';
import { describeError } from '@/lib/error';

type ViewMode = 'edit' | 'split' | 'preview';

const PREVIEW_DEBOUNCE_MS = 300;

const CHAT_EXPANDED_KEY = 'app-chat-expanded';
const CHAT_HEIGHT_KEY = 'app-chat-height';
const CHAT_MIN_HEIGHT = 180;
const CHAT_DEFAULT_HEIGHT = 360;
const CHAT_MAX_DEFAULT_HEIGHT = 460;
const CHAT_COLLAPSE_THRESHOLD = 150;

const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatRelative(ts: number, now: number): string {
  const sec = Math.floor((now - ts) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

export function ActiveSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clearStore = useSessionStore((s) => s.clear);
  const initPauseState = useSessionStore((s) => s.initPauseState);
  const pauseAction = useSessionStore((s) => s.pause);
  const resumeAction = useSessionStore((s) => s.resume);
  const pauseState = useSessionStore((s) => (id ? s.pauseStates[id] : undefined));
  const isPaused = pauseState?.runStartedAt === null && pauseState !== undefined;
  const [now, setNow] = useState(() => Date.now());
  const [content, setContent] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [previewContent, setPreviewContent] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(CHAT_EXPANDED_KEY) === '1';
  });
  const [chatHeight, setChatHeight] = useState<number>(() => {
    if (typeof window === 'undefined') return CHAT_DEFAULT_HEIGHT;
    const stored = Number(window.localStorage.getItem(CHAT_HEIGHT_KEY));
    return Number.isFinite(stored) && stored >= CHAT_MIN_HEIGHT
      ? Math.min(stored, CHAT_MAX_DEFAULT_HEIGHT)
      : CHAT_DEFAULT_HEIGHT;
  });
  useEffect(() => {
    window.localStorage.setItem(CHAT_EXPANDED_KEY, chatExpanded ? '1' : '0');
  }, [chatExpanded]);
  useEffect(() => {
    window.localStorage.setItem(CHAT_HEIGHT_KEY, String(Math.round(chatHeight)));
  }, [chatHeight]);

  const startChatResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = chatHeight;
    let lastHeight = startHeight;
    const maxHeight = Math.floor(window.innerHeight * 0.68);
    const onMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const next = Math.max(72, Math.min(maxHeight, startHeight + delta));
      lastHeight = next;
      setChatHeight(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (lastHeight < CHAT_COLLAPSE_THRESHOLD) {
        setChatExpanded(false);
        setChatHeight(CHAT_DEFAULT_HEIGHT);
      } else if (lastHeight < CHAT_MIN_HEIGHT) {
        setChatHeight(CHAT_MIN_HEIGHT);
      }
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };
  const lastSavedContentRef = useRef<string | null>(null);
  const seededRef = useRef(false);

  const sessionQuery = useQuery({
    queryKey: ['session', id],
    queryFn: () => sessionsService.get(id!),
    enabled: !!id,
    retry: false,
  });

  useEffect(() => {
    if (sessionQuery.isError) {
      clearStore();
      navigate('/home', { replace: true });
    }
  }, [sessionQuery.isError, clearStore, navigate]);

  useEffect(() => {
    if (sessionQuery.data && sessionQuery.data.status !== 'active' && id) {
      navigate(`/sessions/${id}`, { replace: true });
    }
  }, [sessionQuery.data, id, navigate]);

  const latestSnapshotQuery = useQuery({
    queryKey: ['snapshot-latest', id],
    queryFn: () => snapshotsService.latest(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (seededRef.current) return;
    if (latestSnapshotQuery.isPending) return;
    const seeded = latestSnapshotQuery.data?.artifacts?.planMd ?? '';
    setContent(seeded);
    setPreviewContent(seeded);
    lastSavedContentRef.current = seeded;
    if (latestSnapshotQuery.data) {
      setLastSavedAt(new Date(latestSnapshotQuery.data.takenAt).getTime());
    }
    seededRef.current = true;
  }, [latestSnapshotQuery.isPending, latestSnapshotQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!id || !sessionQuery.data) throw new Error('No active session');
      const elapsedMs = computeElapsedMs(
        useSessionStore.getState().pauseStates[id],
        sessionQuery.data.startedAt,
      );
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      return snapshotsService.capture(id, elapsedMinutes, { planMd: text });
    },
    onSuccess: (snap) => {
      lastSavedContentRef.current = snap.artifacts.planMd ?? '';
      setLastSavedAt(new Date(snap.takenAt).getTime());
    },
  });

  const saveIfDirty = useCallback(() => {
    if (!seededRef.current) return;
    if (saveMutation.isPending) return;
    if (content === lastSavedContentRef.current) return;
    saveMutation.mutate(content);
  }, [content, saveMutation]);

  const endMutation = useMutation({
    mutationFn: async (status: 'completed' | 'abandoned') => {
      if (!id) throw new Error('No active session');
      if (seededRef.current && content !== lastSavedContentRef.current) {
        await saveMutation.mutateAsync(content);
      }
      return sessionsService.end(id, status);
    },
    onSuccess: (_result, status) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['evals', id] });
      queryClient.invalidateQueries({ queryKey: DAILY_SPEND_QUERY_KEY });
      clearStore();
      if (status === 'completed' && id) {
        navigate(`/sessions/${id}`, { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    },
  });

  const handleEnd = () => {
    if (endMutation.isPending) return;
    endMutation.mutate('completed');
  };

  const handleCancel = () => {
    if (endMutation.isPending) return;
    setCancelDialogOpen(true);
  };

  const confirmCancel = () => {
    setCancelDialogOpen(false);
    endMutation.mutate('abandoned');
  };

  const dirtyNow = seededRef.current && content !== lastSavedContentRef.current;

  const timerStopped = isPaused || endMutation.isPending || endMutation.isSuccess;
  useEffect(() => {
    if (timerStopped) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timerStopped]);

  useEffect(() => {
    if (!id || !sessionQuery.data) return;
    initPauseState(id, sessionQuery.data.startedAt);
  }, [id, sessionQuery.data, initPauseState]);

  useEffect(() => {
    const t = setInterval(saveIfDirty, AUTOSAVE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [saveIfDirty]);

  useEffect(() => {
    const t = setTimeout(() => setPreviewContent(content), PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [content]);

  const contentRef = useRef(content);
  useEffect(() => {
    contentRef.current = content;
  }, [content]);
  const sessionRef = useRef(sessionQuery.data);
  useEffect(() => {
    sessionRef.current = sessionQuery.data;
  }, [sessionQuery.data]);

  useEffect(() => {
    if (!id) return;
    const flushOnExit = () => {
      if (!seededRef.current) return;
      if (!sessionRef.current) return;
      if (contentRef.current === lastSavedContentRef.current) return;

      const elapsedMs = computeElapsedMs(
        useSessionStore.getState().pauseStates[id],
        sessionRef.current.startedAt,
      );
      const elapsedMinutes = Math.floor(elapsedMs / 60000);

      const baseURL = api.defaults.baseURL ?? '/api';
      const url = `${baseURL}/sessions/${id}/snapshots`;
      const body = JSON.stringify({
        elapsedMinutes,
        artifacts: { planMd: contentRef.current },
      });
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    };

    window.addEventListener('beforeunload', flushOnExit);
    window.addEventListener('pagehide', flushOnExit);
    return () => {
      window.removeEventListener('beforeunload', flushOnExit);
      window.removeEventListener('pagehide', flushOnExit);
    };
  }, [id]);

  if (!id) return <div>Missing session id.</div>;
  if (sessionQuery.isError) return null;
  if (sessionQuery.isPending) return <div>Loading session…</div>;

  const session = sessionQuery.data;
  void now;
  const elapsed = computeElapsedMs(pauseState, session.startedAt);
  const dirty = seededRef.current && content !== lastSavedContentRef.current;

  const handlePauseToggle = () => {
    if (!id) return;
    if (isPaused) resumeAction(id);
    else pauseAction(id);
  };

  return (
    <div className="mx-auto flex h-full min-h-[640px] w-full max-w-7xl flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.16),_transparent_34%),linear-gradient(135deg,_#020617,_#0f172a_46%,_#111827)] dark:shadow-2xl dark:ring-1 dark:ring-slate-800/70">
      <header className="shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-r from-white via-slate-50 to-teal-50 shadow-sm dark:border-white/10 dark:bg-none dark:bg-white/5 dark:backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-3 text-gray-950 dark:text-white lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_16px_rgba(52,211,153,0.55)]" />
              <h2 className="text-base font-semibold leading-tight">Planning workspace</h2>
              <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800 dark:border-teal-300/20 dark:bg-teal-300/10 dark:text-teal-100">
                plan.md
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-gray-600 dark:text-teal-100">
              {session.question.prompt}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
            <span
              className={`inline-flex h-8 min-w-24 items-center justify-center rounded-md border px-3 font-mono text-sm font-semibold tabular-nums shadow-inner ${
                isPaused
                  ? 'border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-300/40 dark:bg-amber-300/15 dark:text-amber-100'
                  : 'border-teal-200 bg-white text-gray-950 dark:border-teal-300/20 dark:bg-teal-300/10 dark:text-white'
              }`}
              title={isPaused ? 'Timer paused' : 'Elapsed time'}
            >
              {formatElapsed(elapsed)}
            </span>
            <button
              type="button"
              onClick={handlePauseToggle}
              disabled={endMutation.isPending}
              className={`inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-semibold shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                isPaused
                  ? 'bg-amber-400 text-gray-950 hover:bg-amber-300'
                  : 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-100 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20'
              }`}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button
              type="button"
              onClick={handleEnd}
              disabled={endMutation.isPending}
              className="inline-flex h-8 items-center justify-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            >
              {endMutation.isPending && endMutation.variables === 'completed'
                ? 'Evaluating...'
                : 'End session'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={endMutation.isPending}
              className="inline-flex h-8 items-center justify-center rounded-md border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-200/60 dark:bg-white/10 dark:text-rose-100 dark:hover:bg-rose-500/20"
            >
              {endMutation.isPending && endMutation.variables === 'abandoned'
                ? 'Cancelling...'
                : 'Cancel'}
            </button>
          </div>
        </div>
      </header>

      {endMutation.isError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 shrink-0">
          Failed to end session: {describeError(endMutation.error)}
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-slate-700/80 dark:bg-slate-950/95 dark:shadow-2xl">
        <div className="flex shrink-0 flex-col gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/95 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600 dark:text-slate-300">
              Plan.md
            </h3>
            <ViewModeToggle mode={viewMode} onChange={setViewMode} />
            <button
              type="button"
              onClick={() => setPromptOpen((open) => !open)}
              className="inline-flex h-7 items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-expanded={promptOpen}
            >
              {promptOpen ? 'Hide prompt' : 'Show prompt'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
            {saveMutation.isPending ? (
              <span className="font-medium text-teal-700 dark:text-teal-300">Saving...</span>
            ) : lastSavedAt ? (
              <span>
                Last saved {formatRelative(lastSavedAt, now)}
                {dirty && <span className="font-medium text-amber-700 dark:text-amber-300"> · unsaved changes</span>}
              </span>
            ) : (
              <span>Not saved yet</span>
            )}
            <button
              type="button"
              onClick={saveIfDirty}
              disabled={!seededRef.current || saveMutation.isPending || !dirty}
              className="inline-flex h-8 items-center justify-center rounded-md bg-teal-700 px-3 text-xs font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
            >
              Save now
            </button>
          </div>
        </div>
        {promptOpen && (
          <div className="shrink-0 border-b border-gray-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="max-h-20 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs leading-relaxed text-gray-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              {session.question.prompt}
            </div>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col gap-2 bg-white p-2 dark:bg-slate-950 lg:flex-row">
          {viewMode !== 'preview' && (
            <div
              className={`${
                viewMode === 'split' ? 'lg:w-1/2' : 'flex-1'
              } min-h-[360px] overflow-hidden rounded-lg border border-slate-700 bg-gray-950 shadow-[0_24px_70px_rgba(0,0,0,0.35)]`}
            >
              <Editor
                height="100%"
                language="markdown"
                value={content}
                onChange={(v) => setContent(v ?? '')}
                theme="vs-dark"
                options={{
                  wordWrap: 'on',
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          )}
          {viewMode !== 'edit' && (
            <div
              className={`${
                viewMode === 'split' ? 'lg:w-1/2' : 'flex-1'
              } min-h-[360px] overflow-x-auto overflow-y-auto rounded-lg border border-slate-700 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.28)]`}
            >
              <PreviewPane
                content={previewContent}
                onInsertExample={(snippet) => {
                  const firstFence = content.search(/```\s*mermaid/i);
                  const next =
                    firstFence === -1
                      ? (content.endsWith('\n') ? content : content + '\n') + snippet
                      : content.slice(0, firstFence) + snippet + content.slice(firstFence);
                  setContent(next);
                  setPreviewContent(next);
                  saveMutation.mutate(next);
                }}
                onDeleteBlock={(index) => {
                  const re = /```\s*mermaid\s*\n[\s\S]*?```\n?/gi;
                  let count = 0;
                  const next = content
                    .replace(re, (match) => (count++ === index ? '' : match))
                    .replace(/\n{3,}/g, '\n\n');
                  setContent(next);
                  setPreviewContent(next);
                  saveMutation.mutate(next);
                }}
              />
            </div>
          )}
        </div>
        {saveMutation.isError && (
          <div className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shrink-0">
            Save failed: {describeError(saveMutation.error)}
          </div>
        )}
      </section>

      <aside
        className="fixed bottom-4 right-4 z-40 w-[min(440px,calc(100vw-2rem))]"
        style={chatExpanded ? { height: `${chatHeight}px` } : undefined}
      >
        {chatExpanded && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize chat panel"
            onMouseDown={startChatResize}
            title="Drag to resize"
            className="mx-auto mb-1 h-1.5 w-24 cursor-row-resize rounded-full bg-teal-300/70 transition-colors hover:bg-teal-400 active:bg-teal-500"
          />
        )}
        <HintChatPanel
          sessionId={id}
          expanded={chatExpanded}
          onToggleExpanded={() => setChatExpanded((v) => !v)}
        />
      </aside>

      {cancelDialogOpen && (
        <ConfirmCancelDialog
          dirty={dirtyNow}
          pending={endMutation.isPending}
          onConfirm={confirmCancel}
          onDismiss={() => setCancelDialogOpen(false)}
        />
      )}
    </div>
  );
}

const MERMAID_PLACEHOLDER = `flowchart LR
  Client -->|HTTPS| API[API Gateway]
  API --> Cache[(Redis cache)]
  API --> DB[(Primary DB)]
  Cache -.->|miss| DB`;

function extractMermaidBlocks(md: string): string[] {
  const blocks: string[] = [];
  const re = /```\s*mermaid\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(md)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function mermaidLiveUrl(code: string): string {
  const state = {
    code,
    mermaid: '{\n  "theme": "default"\n}',
    autoSync: true,
    updateDiagram: true,
  };
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return `https://mermaid.live/edit#base64:${btoa(binary)}`;
}

function PreviewPane({
  content,
  onInsertExample,
  onDeleteBlock,
}: {
  content: string;
  onInsertExample: (snippet: string) => void;
  onDeleteBlock: (index: number) => void;
}) {
  const blocks = extractMermaidBlocks(content);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  const handlePasteInsert = (raw: string) => {
    const cleaned = raw
      .trim()
      .replace(/^```\s*mermaid\s*\n?/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    if (!cleaned) return;
    onInsertExample(`\`\`\`mermaid\n${cleaned}\n\`\`\`\n`);
    setPasteOpen(false);
  };

  if (blocks.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-700">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="font-medium text-amber-900">No diagram in this plan</span>
          <a
            href="https://mermaid.js.org/intro/"
            target="_blank"
            rel="noreferrer"
            className="text-teal-700 hover:underline text-[11px]"
          >
            Mermaid docs ↗
          </a>
        </div>
        <p className="text-[11px] text-gray-600 leading-snug mb-2">
          Paste your Mermaid source below — flowchart, sequenceDiagram,
          erDiagram, classDiagram and more are supported. Triple-backtick
          fences are added for you.
        </p>
        <InlineDiagramComposer onInsert={handlePasteInsert} />
        <div className="mt-2">
          <a
            href={mermaidLiveUrl('flowchart LR\n  A --> B')}
            target="_blank"
            rel="noreferrer"
            className="inline-block rounded border border-teal-300 text-teal-700 bg-white px-2.5 py-1 text-[11px] font-medium hover:bg-teal-50"
            title="Build your diagram visually in the official editor, then paste back"
          >
            Open Mermaid Live Editor ↗
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">
          {blocks.length} diagram{blocks.length === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            className="rounded border border-gray-300 bg-white text-gray-700 px-2 py-0.5 text-[11px] font-medium hover:bg-gray-100"
            title="Paste mermaid source from mermaid.live or anywhere else"
          >
            + Add diagram
          </button>
          <a
            href={mermaidLiveUrl('flowchart LR\n  A --> B')}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-teal-300 bg-white text-teal-700 px-2 py-0.5 text-[11px] font-medium hover:bg-teal-50"
            title="Build a new diagram in the official editor, then paste back"
          >
            Mermaid Live ↗
          </a>
        </div>
      </div>
      {blocks.map((src, i) => (
        <div key={`${i}-${src.length}`} className="relative group">
          <div className="absolute top-1 right-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <a
              href={mermaidLiveUrl(src)}
              target="_blank"
              rel="noreferrer"
              title="Open this diagram in the official Mermaid Live Editor"
              aria-label={`Open diagram ${i + 1} in Mermaid Live Editor`}
              className="inline-flex items-center justify-center h-6 px-2 rounded border border-gray-300 bg-white text-[11px] text-teal-700 hover:border-teal-300 hover:bg-teal-50"
            >
              Edit ↗
            </a>
            <button
              type="button"
              onClick={() => setPendingDeleteIndex(i)}
              title="Delete this diagram"
              aria-label={`Delete diagram ${i + 1}`}
              className="inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 bg-white text-gray-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50"
            >
              ×
            </button>
          </div>
          <MermaidBlock source={src} />
        </div>
      ))}
      {pasteOpen && (
        <div className="rounded border border-teal-200 bg-teal-50/30 p-2">
          <div className="text-[11px] font-medium text-gray-700 mb-1.5">
            Paste a new diagram
          </div>
          <InlineDiagramComposer
            onInsert={handlePasteInsert}
            onCancel={() => setPasteOpen(false)}
            showCancel
          />
        </div>
      )}
      {pendingDeleteIndex !== null && (
        <ConfirmDeleteDiagramDialog
          index={pendingDeleteIndex}
          onConfirm={() => {
            onDeleteBlock(pendingDeleteIndex);
            setPendingDeleteIndex(null);
          }}
          onDismiss={() => setPendingDeleteIndex(null)}
        />
      )}
    </div>
  );
}

function InlineDiagramComposer({
  onInsert,
  onCancel,
  showCancel = false,
}: {
  onInsert: (source: string) => void;
  onCancel?: () => void;
  showCancel?: boolean;
}) {
  const [value, setValue] = useState('');
  const canInsert = value.trim().length > 0;

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder={MERMAID_PLACEHOLDER}
        spellCheck={false}
        className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-[11px] font-mono leading-snug resize-y focus:outline-none focus:ring-2 focus:ring-teal-600"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onInsert(value);
            setValue('');
          }}
          disabled={!canInsert}
          className="rounded bg-teal-700 text-white px-2.5 py-1 text-[11px] font-medium hover:bg-teal-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Insert into plan
        </button>
        {showCancel && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 bg-white text-gray-700 px-2.5 py-1 text-[11px] font-medium hover:bg-gray-100"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function ConfirmDeleteDiagramDialog({
  index,
  onConfirm,
  onDismiss,
}: {
  index: number;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white shadow-xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-900">
            Delete diagram #{index + 1}?
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            This will remove the{' '}
            <code className="font-mono bg-gray-100 px-1 rounded text-xs">```mermaid</code>{' '}
            block from your plan.md. You can undo from the editor (Cmd/Ctrl-Z) if needed.
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="rounded bg-rose-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-rose-700"
          >
            Delete diagram
          </button>
        </div>
      </div>
    </div>
  );
}

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const options: Array<{ value: ViewMode; label: string; title: string }> = [
    { value: 'edit', label: 'Edit', title: 'Editor only' },
    { value: 'split', label: 'Split', title: 'Editor on top, live preview below' },
    { value: 'preview', label: 'Preview', title: 'Rendered preview only' },
  ];
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-gray-300 bg-white p-0.5 text-[11px] shadow-sm dark:border-slate-700 dark:bg-slate-950">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          title={o.title}
          aria-pressed={mode === o.value}
          className={`rounded px-3 py-1 font-semibold transition-colors ${
            mode === o.value
              ? 'bg-teal-700 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
          } ${i > 0 ? 'ml-0.5' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ConfirmCancelDialog({
  dirty,
  pending,
  onConfirm,
  onDismiss,
}: {
  dirty: boolean;
  pending: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white shadow-xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-900">Cancel this session?</h2>
          <p className="mt-1 text-sm text-gray-600">
            {dirty
              ? 'Your latest changes (including any diagrams) will be saved so a retry can inherit them. The attempt will be marked abandoned and won’t be evaluated.'
              : 'The attempt will be marked abandoned and won’t be evaluated.'}
          </p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-lg">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            Keep working
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded bg-rose-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? 'Cancelling…' : 'Cancel session'}
          </button>
        </div>
      </div>
    </div>
  );
}
