import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { BackgroundTaskTracker } from '../../../common/background-task-tracker.service';
import {
  EvaluationCompletedEvent,
  PlanEvalDetailsCompletedEvent,
} from '../../../common/events/evaluation-events';
import { ChatRole } from '../../llm/constants';
import { LlmService } from '../../llm/services/llm.service';
import { SignalResult } from '../../evaluations/types/evaluation.types';
import { RubricLoaderService } from '../../evaluations/services/rubric-loader.service';
import { QuestionKind, Seniority } from '../../evaluations/types/rubric.types';
import { FeedbackRepository } from '../repositories/feedback.repository';
import {
  FeedbackConcept,
  FeedbackProjectionState,
  FeedbackRefreshEvidenceRow,
  FeedbackSeverity,
  FeedbackSourceRef,
  FeedbackStudyPlanStep,
  FeedbackSummaryPayload,
  GroupedFeedbackConcept,
} from '../types/feedback.types';
import { labelForTopic, normalizeTopicName, topicForSignal } from '../helpers/feedback-topic-map';

const MAX_CONCEPTS = 8;
const MAX_SOURCE_REFS_PER_CONCEPT = 6;
const MAX_EVIDENCE_SNIPPETS_PER_CONCEPT = 4;
const REFRESH_ROUTE = 'feedback.refresh';

@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly repo: FeedbackRepository,
    private readonly llm: LlmService,
    private readonly tasks: BackgroundTaskTracker,
    private readonly rubricLoader: RubricLoaderService,
  ) {}

  async getFeedback(userId: string): Promise<FeedbackSummaryPayload> {
    const summary = await this.repo.getSummary(userId);
    if (summary) return summary.payload as unknown as FeedbackSummaryPayload;

    const state = await this.repo.getState(userId);
    return emptyPayload(state?.version ?? 0);
  }

  async invalidateForUser(userId: string): Promise<FeedbackProjectionState> {
    const state = await this.repo.incrementVersion(userId);
    this.enqueueRefresh(userId, state.version);
    return state;
  }

  enqueueRefresh(userId: string, version: number): void {
    const key = `${userId}:${version}`;
    if (this.inFlight.has(key)) return;
    this.inFlight.add(key);
    this.tasks
      .track(
        this.refreshIfStale(userId, version).finally(() => this.inFlight.delete(key)),
        `feedback.refresh(${userId},v${version})`,
        { timeoutMs: 120_000 },
      )
      .catch(() => undefined);
  }

  async refreshIfStale(userId: string, requestedVersion?: number): Promise<FeedbackSummaryPayload | null> {
    const state = await this.repo.getState(userId);
    const version = state?.version ?? requestedVersion ?? 0;
    if (requestedVersion !== undefined && version !== requestedVersion) {
      return null;
    }

    const summary = await this.repo.getSummary(userId);
    if (summary && summary.computedForVersion >= version) {
      return summary.payload as unknown as FeedbackSummaryPayload;
    }

    const rows = await this.repo.loadEvidence(userId);
    const payload = rows.length === 0
      ? emptyPayload(version)
      : await this.buildPayload(userId, version, rows);
    await this.repo.upsertSummary(userId, payload);
    return payload;
  }

  @OnEvent(EvaluationCompletedEvent.eventName)
  async handleEvaluationCompleted(event: EvaluationCompletedEvent): Promise<void> {
    const userId = await this.repo.findEvaluationUserId(event.evaluationId);
    if (userId) await this.invalidateForUser(userId);
  }

  @OnEvent(PlanEvalDetailsCompletedEvent.eventName)
  async handlePlanDetailsCompleted(event: PlanEvalDetailsCompletedEvent): Promise<void> {
    if (!event.succeeded) return;
    const userId = await this.repo.findEvaluationUserId(event.evaluationId);
    if (userId) await this.invalidateForUser(userId);
  }

  async noteMentorArtifactChanged(userId: string): Promise<void> {
    await this.invalidateForUser(userId);
  }

  async noteSignalMentorArtifactChanged(userId: string): Promise<void> {
    await this.invalidateForUser(userId);
  }

  private async buildPayload(
    userId: string,
    version: number,
    rows: FeedbackRefreshEvidenceRow[],
  ): Promise<FeedbackSummaryPayload> {
    const signalPolarity = await this.loadSignalPolarity(rows);
    const grouped = groupEvidence(rows, signalPolarity);
    const phrasing = await this.phraseConcepts(userId, grouped).catch((err) => {
      this.logger.warn(`Feedback LLM phrasing failed: ${(err as Error).message}`);
      return new Map<string, ConceptPhrasing>();
    });

    const concepts: FeedbackConcept[] = grouped.map((group) => {
      const text = phrasing.get(group.topicId);
      return {
        topicId: group.topicId,
        label: group.label,
        severity: group.severity,
        count: group.count,
        summary: text?.summary ?? fallbackSummary(group),
        sourceRefs: group.sourceRefs.slice(0, MAX_SOURCE_REFS_PER_CONCEPT),
      };
    });

    const studyPlan: FeedbackStudyPlanStep[] = grouped.slice(0, 5).map((group) => {
      const text = phrasing.get(group.topicId);
      return {
        topicId: group.topicId,
        title: text?.studyPlanStep ?? `Practice ${group.label}`,
        why: text?.why ?? fallbackWhy(group),
        sourceRefs: group.sourceRefs.slice(0, 3).map(refKey),
      };
    });

    const generatedAt = new Date().toISOString();
    const sessionIds = new Set(rows.map((row) => row.sessionId));
    const mentorCount = rows.filter((row) => row.mentorContent).length;
    const signalMentorCount = rows.filter((row) => hasSignalMentor(row.signalMentorAnnotations)).length;

    return {
      scope: { kind: 'all_sessions' },
      computedForVersion: version,
      generatedAt,
      sourceCounts: {
        sessions: sessionIds.size,
        evaluations: rows.length,
        mentorArtifacts: mentorCount,
        signalMentorArtifacts: signalMentorCount,
      },
      overview: {
        sessionsAnalyzed: sessionIds.size,
        evaluationsAnalyzed: rows.length,
        topThemes: concepts.slice(0, 3).map((concept) => concept.label),
      },
      concepts,
      studyPlan,
    };
  }

  private async loadSignalPolarity(
    rows: FeedbackRefreshEvidenceRow[],
  ): Promise<Map<string, Map<string, 'good' | 'bad'>>> {
    const out = new Map<string, Map<string, 'good' | 'bad'>>();
    for (const row of rows) {
      try {
        const rubric = await this.rubricLoader.load(
          row.rubricVersion,
          row.phase as 'plan' | 'build' | 'validate' | 'wrap',
          row.kind as QuestionKind | undefined,
          row.seniority as Seniority | undefined,
        );
        out.set(
          row.evaluationId,
          new Map(rubric.signals.map((signal) => [signal.id, signal.polarity])),
        );
      } catch (err) {
        this.logger.warn(
          `Could not load rubric for feedback eval ${row.evaluationId}: ${(err as Error).message}`,
        );
      }
    }
    return out;
  }

  private async phraseConcepts(
    userId: string,
    concepts: GroupedFeedbackConcept[],
  ): Promise<Map<string, ConceptPhrasing>> {
    if (concepts.length === 0) return new Map();
    const res = await this.llm.call(
      [
        {
          role: ChatRole.User,
          content:
            'Rewrite these grouped system-design feedback facts into concise coaching copy. ' +
            'Do not add new topics or claims. Return JSON only with shape ' +
            '{"concepts":[{"topicId":"...","summary":"...","studyPlanStep":"...","why":"..."}]}.\n\n' +
            JSON.stringify(
              concepts.map((concept) => ({
                topicId: concept.topicId,
                label: concept.label,
                severity: concept.severity,
                count: concept.count,
                evidence: concept.evidenceSnippets,
              })),
            ),
        },
      ],
      {
        maxTokens: 1400,
        temperature: 0.2,
        userId,
        route: REFRESH_ROUTE,
      },
    );

    return parsePhrasing(res.text);
  }
}

interface ConceptPhrasing {
  summary: string;
  studyPlanStep: string;
  why: string;
}

export function groupEvidence(
  rows: FeedbackRefreshEvidenceRow[],
  signalPolarityByEvaluation = new Map<string, Map<string, 'good' | 'bad'>>(),
  options: { includeRawSignals?: boolean } = {},
): GroupedFeedbackConcept[] {
  const groups = new Map<string, GroupedFeedbackConcept>();
  for (const row of rows) {
    const base = {
      sessionId: row.sessionId,
      evaluationId: row.evaluationId,
      questionId: row.questionId,
    };

    for (const topic of asArray(row.gapTopics)) {
      if (!isObject(topic) || typeof topic.name !== 'string') continue;
      const topicId = normalizeTopicName(topic.name);
      const coverage = typeof topic.coverage === 'string' ? topic.coverage : 'missed';
      addEvidence(groups, topicId, {
        ...base,
        label: `${labelForTopic(topicId)} (${coverage})`,
        sourceKind: 'gap_topic',
      }, textSnippet(topic.whyExpected ?? topic.why_expected ?? ''));
    }

    if (options.includeRawSignals) {
      const signals = isObject(row.signalResults) ? row.signalResults : {};
      const signalPolarity = signalPolarityByEvaluation.get(row.evaluationId);
      for (const [signalId, result] of Object.entries(signals)) {
        if (!isObject(result)) continue;
        if (!isGapSignal(result.result, signalPolarity?.get(signalId))) continue;
        const topicId = topicForSignal(signalId);
        addEvidence(
          groups,
          topicId,
          {
            ...base,
            label: `${signalId}: ${result.result}`,
            sourceKind: 'signal',
          },
          textSnippet(result.evidence ?? result.reasoning ?? row.feedbackText),
        );
      }
    }

    if (row.mentorContent) {
      for (const group of groups.values()) {
        if (group.sourceRefs.some((ref) => ref.evaluationId === row.evaluationId)) {
          group.sourceRefs.push({
            ...base,
            label: 'Mentor notes',
            sourceKind: 'mentor',
          });
        }
      }
    }

    const annotations = isObject(row.signalMentorAnnotations) ? row.signalMentorAnnotations : {};
    for (const [signalId, annotation] of Object.entries(annotations)) {
      if (typeof annotation !== 'string' || !annotation.trim()) continue;
      const topicId = topicForSignal(signalId);
      addEvidence(groups, topicId, {
        ...base,
        label: `${signalId} coaching`,
        sourceKind: 'signal_mentor',
      }, textSnippet(annotation));
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      count: uniqueEvaluationCount(group.sourceRefs),
      severity: severityFor(uniqueEvaluationCount(group.sourceRefs)),
    }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        Number(hasSourceKind(b, 'gap_topic')) - Number(hasSourceKind(a, 'gap_topic')) ||
        a.label.localeCompare(b.label),
    )
    .slice(0, MAX_CONCEPTS);
}

function isGapSignal(result: unknown, polarity: 'good' | 'bad' | undefined): boolean {
  if (result === 'cannot_evaluate') return false;
  if (polarity === 'bad') return result === 'hit' || result === 'partial';
  if (polarity === 'good') return result === 'miss';
  if (result === 'miss') return true;
  return false;
}

function addEvidence(
  groups: Map<string, GroupedFeedbackConcept>,
  topicId: string,
  ref: FeedbackSourceRef,
  snippet: string,
): void {
  const group = groups.get(topicId) ?? {
    topicId,
    label: labelForTopic(topicId),
    severity: 'low' as FeedbackSeverity,
    count: 0,
    sourceRefs: [],
    evidenceSnippets: [],
  };
  if (!group.sourceRefs.some((existing) => refKey(existing) === refKey(ref))) {
    group.sourceRefs.push(ref);
  }
  pushSnippet(group, snippet);
  groups.set(topicId, group);
}

function pushSnippet(group: GroupedFeedbackConcept, snippet: string): void {
  if (!snippet) return;
  if (group.evidenceSnippets.includes(snippet)) return;
  if (group.evidenceSnippets.length >= MAX_EVIDENCE_SNIPPETS_PER_CONCEPT) return;
  group.evidenceSnippets.push(snippet);
}

function severityFor(count: number): FeedbackSeverity {
  if (count >= 4) return 'high';
  if (count >= 2) return 'medium';
  return 'low';
}

function parsePhrasing(text: string): Map<string, ConceptPhrasing> {
  const parsed = JSON.parse(extractJson(text)) as unknown;
  const concepts = isObject(parsed) && Array.isArray(parsed.concepts) ? parsed.concepts : [];
  const out = new Map<string, ConceptPhrasing>();
  for (const item of concepts) {
    if (!isObject(item) || typeof item.topicId !== 'string') continue;
    if (
      typeof item.summary !== 'string' ||
      typeof item.studyPlanStep !== 'string' ||
      typeof item.why !== 'string'
    ) continue;
    out.set(item.topicId, {
      summary: item.summary.slice(0, 300),
      studyPlanStep: item.studyPlanStep.slice(0, 160),
      why: item.why.slice(0, 220),
    });
  }
  return out;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return trimmed;
  return trimmed.slice(start, end + 1);
}

function fallbackSummary(group: GroupedFeedbackConcept): string {
  const examples = group.evidenceSnippets
    .filter((snippet) => !isGenericEvidence(snippet))
    .slice(0, 2);
  if (examples.length > 0) {
    return examples.join(' ');
  }
  if (group.count === 1) return `${group.label} should be tightened in future designs.`;
  return `${group.label} is recurring across ${group.count} evaluated attempts and should be tightened in future designs.`;
}

function fallbackWhy(group: GroupedFeedbackConcept): string {
  const first = group.evidenceSnippets.find((snippet) => !isGenericEvidence(snippet));
  if (first) {
    return `This matters because the feedback repeatedly cites concrete gaps like: ${first}`;
  }
  return `This matters because repeated ${group.label.toLowerCase()} gaps make otherwise strong designs harder to evaluate and operate.`;
}

function emptyPayload(version: number): FeedbackSummaryPayload {
  const generatedAt = new Date().toISOString();
  return {
    scope: { kind: 'all_sessions' },
    computedForVersion: version,
    generatedAt,
    sourceCounts: {
      sessions: 0,
      evaluations: 0,
      mentorArtifacts: 0,
      signalMentorArtifacts: 0,
    },
    overview: {
      sessionsAnalyzed: 0,
      evaluationsAnalyzed: 0,
      topThemes: [],
    },
    concepts: [],
    studyPlan: [],
    empty: {
      reason: 'no_completed_data',
      message: 'Complete an evaluated session to build universal feedback.',
    },
  };
}

function refKey(ref: Pick<FeedbackSourceRef, 'sessionId' | 'evaluationId' | 'sourceKind' | 'label'>): string {
  return `${ref.sessionId}:${ref.evaluationId}:${ref.sourceKind}:${ref.label}`;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textSnippet(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, 220);
}

function hasSignalMentor(value: unknown): boolean {
  return isObject(value) && Object.keys(value).length > 0;
}

function uniqueEvaluationCount(refs: FeedbackSourceRef[]): number {
  const keys = new Set(
    refs
      .filter((ref) => ref.sourceKind !== 'mentor')
      .map((ref) => `${ref.sessionId}:${ref.evaluationId}`),
  );
  return keys.size;
}

function isGenericEvidence(snippet: string): boolean {
  return snippet.length < 20 || /^because reasons$/i.test(snippet);
}

function hasSourceKind(group: GroupedFeedbackConcept, kind: FeedbackSourceRef['sourceKind']): boolean {
  return group.sourceRefs.some((ref) => ref.sourceKind === kind);
}
