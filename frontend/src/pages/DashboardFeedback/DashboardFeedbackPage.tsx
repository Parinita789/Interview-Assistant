import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { dashboardService } from '@/services/dashboard.service';
import { FeedbackConcept, FeedbackSourceKind } from '@/types/dashboard';

const severityClass = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-sky-200 bg-sky-50 text-sky-700',
} as const;

const severityAccent = {
  high: 'bg-rose-500',
  medium: 'bg-amber-500',
  low: 'bg-sky-500',
} as const;

const sourceLabel: Record<FeedbackSourceKind, string> = {
  gap_topic: 'Gap',
  signal: 'Signal',
  mentor: 'Mentor',
  signal_mentor: 'Coach',
};

const sourceClass: Record<FeedbackSourceKind, string> = {
  gap_topic: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  signal: 'border-slate-200 bg-slate-50 text-slate-700',
  mentor: 'border-amber-200 bg-amber-50 text-amber-700',
  signal_mentor: 'border-teal-200 bg-teal-50 text-teal-700',
};

export function DashboardFeedbackPage() {
  const feedback = useQuery({
    queryKey: ['dashboard', 'feedback'],
    queryFn: () => dashboardService.feedback(),
  });

  if (feedback.isLoading) {
    return (
      <section className="mx-auto max-w-6xl">
        <div className="h-28 animate-pulse rounded-md bg-gray-200" />
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-36 animate-pulse rounded-md bg-gray-200" />
            ))}
          </div>
          <div className="h-80 animate-pulse rounded-md bg-gray-200" />
        </div>
      </section>
    );
  }

  if (feedback.isError || !feedback.data) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Feedback could not be loaded.
      </div>
    );
  }

  const data = feedback.data;
  if (data.empty || data.concepts.length === 0) {
    return (
      <section className="mx-auto max-w-5xl">
        <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-gray-950">Feedback</h1>
          <p className="mt-1 text-sm text-gray-600">
            Universal feedback appears after completed evaluated sessions.
          </p>
          <Link
            to="/home"
            className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"
          >
            Start a session
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl">
      <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gradient-to-r from-gray-950 via-slate-800 to-teal-900 px-5 py-5 text-white sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-teal-100">
                Universal feedback
              </div>
              <h1 className="mt-1 text-2xl font-semibold">Study Signals</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-teal-100">
                Gaps from completed sessions, grouped into study concepts with source markers.
              </p>
            </div>
            <div className="shrink-0 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-teal-50">
              v{data.computedForVersion} · {new Date(data.generatedAt).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-gray-200 sm:grid-cols-3">
          <Metric label="Sessions" value={data.sourceCounts.sessions} tone="emerald" />
          <Metric label="Evaluations" value={data.sourceCounts.evaluations} tone="sky" />
          <Metric
            label="Coaching artifacts"
            value={data.sourceCounts.mentorArtifacts + data.sourceCounts.signalMentorArtifacts}
            tone="amber"
          />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Ranked Concepts
            </h2>
            <div className="text-xs text-gray-500">{data.concepts.length} active signals</div>
          </div>

          {data.concepts.map((concept, index) => (
            <ConceptCard key={concept.topicId} concept={concept} rank={index + 1} />
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Top Themes
              </h2>
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {data.overview.topThemes.map((theme) => (
                <span
                  key={theme}
                  className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-800"
                >
                  {theme}
                </span>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Study Plan
              </h2>
              <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                {data.studyPlan.length} steps
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {data.studyPlan.map((step, index) => (
                <div
                  key={step.topicId}
                  className="rounded-md border border-gray-200 bg-gray-50 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-950 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <div className="min-w-0 truncate text-sm font-semibold text-gray-950">
                      {step.title}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{step.why}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'sky' | 'amber';
}) {
  const toneClass = {
    emerald: 'bg-emerald-500',
    sky: 'bg-sky-500',
    amber: 'bg-amber-500',
  }[tone];

  return (
    <div className="bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</div>
        <div className={`h-2 w-2 rounded-full ${toneClass}`} />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums text-gray-950">{value}</div>
    </div>
  );
}

function ConceptCard({ concept, rank }: { concept: FeedbackConcept; rank: number }) {
  const sourceCounts = concept.sourceRefs.reduce<Record<FeedbackSourceKind, number>>(
    (acc, ref) => {
      acc[ref.sourceKind] += 1;
      return acc;
    },
    { gap_topic: 0, signal: 0, mentor: 0, signal_mentor: 0 },
  );

  return (
    <article className="group overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className={`h-1 ${severityAccent[concept.severity]}`} />
      <div className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-sm font-semibold tabular-nums text-gray-700">
              {rank}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-950">{concept.label}</h3>
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold capitalize ${severityClass[concept.severity]}`}
                >
                  {concept.severity}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-700">{concept.summary}</p>
            </div>
          </div>
          <div className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-right">
            <div className="text-lg font-semibold tabular-nums text-gray-950">
              {concept.count}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {concept.count === 1 ? 'attempt' : 'attempts'}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
          {(Object.keys(sourceLabel) as FeedbackSourceKind[])
            .filter((kind) => sourceCounts[kind] > 0)
            .map((kind) => (
              <span
                key={kind}
                className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold ${sourceClass[kind]}`}
              >
                {sourceLabel[kind]} · {sourceCounts[kind]}
              </span>
            ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {concept.sourceRefs.slice(0, 5).map((ref) => (
            <Link
              key={`${ref.sessionId}:${ref.evaluationId}:${ref.sourceKind}:${ref.label}`}
              to={`/sessions/${ref.sessionId}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-950"
              title={`${ref.label} · question ${ref.questionId}`}
            >
              <span className="shrink-0 font-semibold">{sourceLabel[ref.sourceKind]}</span>
              <span className="truncate">{ref.label}</span>
            </Link>
          ))}
          {concept.sourceRefs.length > 5 && (
            <span className="inline-flex items-center rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-500">
              +{concept.sourceRefs.length - 5}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
