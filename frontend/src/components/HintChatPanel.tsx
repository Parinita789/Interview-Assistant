import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hintsService } from '@/services/hints.service';
import { describeError } from '@/lib/error';
import { DAILY_SPEND_QUERY_KEY } from '@components/layout/DailySpendBadge';

interface HintChatPanelProps {
  sessionId: string;
  expanded: boolean;
  onToggleExpanded: () => void;
}

export function HintChatPanel({
  sessionId,
  expanded,
  onToggleExpanded,
}: HintChatPanelProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [draft, expanded]);

  const historyQuery = useQuery({
    queryKey: ['hints', sessionId],
    queryFn: () => hintsService.list(sessionId),
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) => hintsService.send(sessionId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hints', sessionId] });
      queryClient.invalidateQueries({ queryKey: DAILY_SPEND_QUERY_KEY });
      setDraft('');
    },
  });

  const messages = historyQuery.data ?? [];

  useEffect(() => {
    if (!expanded) return;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, sendMutation.isPending, expanded]);

  const trySend = () => {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    trySend();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      trySend();
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={false}
        className="ml-auto flex h-12 items-center gap-3 rounded-full border border-teal-300/30 bg-slate-950 px-4 text-left text-white shadow-2xl ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-slate-900"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-400 text-slate-950 shadow-[0_0_24px_rgba(45,212,191,0.45)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight">Coach</span>
          <span className="block text-[11px] text-teal-100">
            {messages.length ? `${messages.length} messages` : 'Ask for a hint'}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-700 bg-white shadow-2xl ring-1 ring-black/5">
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2 text-left text-white hover:bg-slate-900"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-teal-400 text-slate-950"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </span>
          <span className="shrink-0 text-sm font-semibold text-white">Ask the Coach</span>
          <span className="hidden truncate text-[11px] text-slate-400 sm:inline">
            for hints or clarifications
          </span>
          {messages.length > 0 && (
            <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
              · {messages.length} message{messages.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <span className="ml-3 shrink-0 text-xs text-slate-300" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {expanded && (
        <>
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-3 text-sm"
          >
            {historyQuery.isPending && (
              <div className="text-xs text-gray-500">Loading…</div>
            )}

            {!historyQuery.isPending && messages.length === 0 && (
              <div className="rounded-md border border-dashed border-teal-200 bg-white px-3 py-2 text-xs italic text-gray-500">
                No messages yet. Ask something like "What's the first thing I should pin down?"
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <div className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-teal-700 px-3 py-2 text-white shadow-sm">
                    {m.prompt}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-gray-900">
                    {m.response}
                  </div>
                </div>
              </div>
            ))}

            {sendMutation.isPending && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-gray-100 text-gray-500 px-3 py-2 italic">
                  Thinking…
                </div>
              </div>
            )}

            {sendMutation.isError && (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
                Failed to get hint: {describeError(sendMutation.error)}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="shrink-0 border-t border-gray-200 bg-white p-3">
            <div className="flex items-stretch rounded-md border border-gray-300 bg-white shadow-sm focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Ask a clarifying question… (Enter to send, Shift+Enter for newline)"
                className="max-h-40 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-2 text-sm leading-snug focus:outline-none"
                disabled={sendMutation.isPending}
              />
              <button
                type="submit"
                disabled={!draft.trim() || sendMutation.isPending}
                aria-label="Send message"
                title="Send (Enter)"
                className="m-1 inline-flex h-8 w-8 self-end items-center justify-center rounded-md bg-teal-700 text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-3.5 h-3.5"
                  aria-hidden="true"
                >
                  <path d="M3.4 20.4 21 12 3.4 3.6c-.3-.1-.7.2-.6.5L5 11l11 1-11 1-2.2 6.9c-.1.3.3.6.6.5Z" />
                </svg>
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
