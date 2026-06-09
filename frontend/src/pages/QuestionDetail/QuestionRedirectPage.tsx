import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { questionsService } from '@/services/questions.service';
import { useSessionStore } from '@/store/sessionStore';
import { extractApiError } from '@/lib/error';
import type { PhaseEvaluation } from '@/types/evaluation';
import type { QuestionWithSessions, Seniority } from '@/types/question';

export function QuestionRedirectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActive = useSessionStore((s) => s.setActive);

  const questionQuery = useQuery({
    queryKey: ['question', id],
    queryFn: () => questionsService.get(id!),
    enabled: !!id,
  });

  const retryMutation = useMutation({
    mutationFn: (seniority?: Seniority) => questionsService.startAttempt(id!, seniority),
    onSuccess: (newSession) => {
      setActive(newSession.id, newSession.startedAt);
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      queryClient.invalidateQueries({ queryKey: ['question', id] });
      navigate(`/sessions/${newSession.id}/active`);
    },
  });

  if (!id) return <div className="text-sm text-red-600">Missing question id.</div>;
  if (questionQuery.isPending) return <QuestionSkeleton />;
  if (questionQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Failed to load question: {extractApiError(questionQuery.error)}
      </div>
    );
  }

  const question = questionQuery.data;
  const stats = buildQuestionStats(question);
  const error = retryMutation.isError ? extractApiError(retryMutation.error) : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:text-teal-900"
        >
          <span aria-hidden="true">←</span>
          Back to questions
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {stats.latestActive && (
            <Link
              to={`/sessions/${stats.latestActive.id}/active`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-800 hover:bg-teal-100"
            >
              Resume active attempt
            </Link>
          )}
          <button
            type="button"
            onClick={() => retryMutation.mutate(undefined)}
            disabled={retryMutation.isPending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {retryMutation.isPending ? 'Starting…' : '+ New attempt'}
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-gray-950 via-slate-800 to-teal-900 px-5 py-5 text-white">
          <p className="max-w-4xl whitespace-pre-wrap text-sm leading-6 text-teal-50">
            {question.prompt}
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon="🎯" label="Attempts" value={question.sessions.length.toString()} detail="Total runs" accent="from-teal-500 to-slate-700" />
        <MetricCard icon="✅" label="Completed" value={stats.completedCount.toString()} detail="Finished attempts" accent="from-amber-500 to-teal-700" />
        <MetricCard icon="⚡" label="Active" value={stats.activeCount.toString()} detail="In progress" accent="from-amber-500 to-rose-500" />
        <MetricCard
          icon="🏆"
          label="Best score"
          value={stats.bestScore === null ? '—' : stats.bestScore.toFixed(2)}
          detail="Highest evaluation"
          accent="from-amber-400 to-orange-500"
        />
      </section>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Couldn't start a new attempt: {error}
        </div>
      )}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-700">
              ≡
            </span>
            Attempts
          </div>
          <div className="text-xs text-gray-500">Review completed attempts or continue active sessions.</div>
        </div>
          {question.sessions.length === 0 ? (
            <div className="m-4 rounded-lg border border-dashed border-teal-200 bg-teal-50/60 px-4 py-12 text-center">
              <div className="text-3xl" aria-hidden="true">📝</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">No attempts for this question</div>
              <p className="mt-1 text-sm text-gray-600">
                Start a fresh attempt to make this question actionable.
              </p>
            </div>
          ) : (
            <AttemptsTable attempts={stats.attempts} />
          )}
      </section>
    </div>
  );
}

function buildQuestionStats(question: QuestionWithSessions) {
  const attempts = [...question.sessions]
    .map((session) => ({
      ...session,
      score: bestScore(session.phaseEvaluations),
    }))
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const completed = attempts.filter((attempt) => attempt.status === 'completed');
  const active = attempts.filter((attempt) => attempt.status === 'active');
  const scores = attempts
    .map((attempt) => attempt.score)
    .filter((score): score is number => score !== null);
  const latestCompleted = completed[0] ?? null;

  return {
    attempts,
    activeCount: active.length,
    completedCount: completed.length,
    bestScore: scores.length ? Math.max(...scores) : null,
    latestScore: latestCompleted?.score ?? null,
    latestActive: active[0] ?? null,
  };
}

function bestScore(evaluations: PhaseEvaluation[]): number | null {
  const scores = evaluations
    .map((evaluation) => Number(evaluation.score))
    .filter((score) => Number.isFinite(score));
  return scores.length ? Math.max(...scores) : null;
}

function relativeTime(iso: string): string {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: string;
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <div className="group overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={`h-1 bg-gradient-to-r ${accent}`} />
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-50 text-base">
            <span aria-hidden="true">{icon}</span>
          </div>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-950">{value}</div>
        <div className="mt-1 text-xs text-gray-500">{detail}</div>
      </div>
    </div>
  );
}

function AttemptsTable({
  attempts,
}: {
  attempts: Array<QuestionWithSessions['sessions'][number] & { score: number | null }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Seniority</th>
            <th className="px-3 py-2 text-right font-medium">Score</th>
            <th className="px-3 py-2 font-medium">Started</th>
            <th className="px-3 py-2 font-medium">Ended</th>
            <th className="px-3 py-2 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {attempts.map((attempt) => {
            const href =
              attempt.status === 'active'
                ? `/sessions/${attempt.id}/active`
                : `/sessions/${attempt.id}`;
            return (
              <tr key={attempt.id} className="hover:bg-teal-50/60">
                <td className="px-3 py-3">
                  <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium capitalize text-gray-700">
                    {attempt.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-gray-700">{attempt.seniority ?? '—'}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">
                  {attempt.score === null ? '—' : attempt.score.toFixed(2)}
                </td>
                <td className="px-3 py-3 text-gray-500">{relativeTime(attempt.startedAt)}</td>
                <td className="px-3 py-3 text-gray-500">
                  {attempt.endedAt ? relativeTime(attempt.endedAt) : '—'}
                </td>
                <td className="px-3 py-3 text-right">
                  <Link
                    to={href}
                    className="text-sm font-medium text-teal-700 hover:underline"
                  >
                    {attempt.status === 'active' ? 'Resume' : 'Review'}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function QuestionSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="h-8 w-64 animate-pulse rounded bg-gray-100" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-72 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
    </div>
  );
}
