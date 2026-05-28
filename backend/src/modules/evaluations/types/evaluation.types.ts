import { Phase } from '../../phase-tagger/types/phase.types';
import { QuestionKind, Seniority } from './rubric.types';

export interface PhaseEvalInput {
  session: {
    id: string;
    prompt: string;
    startedAt: Date;
    endedAt: Date | null;
  };
  // Real user behind the eval; threaded into LlmService.call's
  // cost-cap routing. Optional because dev tooling (eval-harness)
  // exists outside the user-session model — LlmService skips cap
  // accounting when userId is absent.
  userId?: string;
  planMd: string | null;
  snapshots: Array<{
    takenAt: Date;
    elapsedMinutes: number;
    planMdSize: number;
  }>;
  hints: Array<{
    occurredAt: Date;
    elapsedMinutes: number;
    prompt: string;
    response: string;
  }>;
  rubricVersion: string;
  kind?: QuestionKind | null;
  seniority?: Seniority | null;
  model?: string;
  buildContext?: BuildContext;
}

export interface BuildContext {
  startedAt: Date | null;
  endedAt: Date | null;
  events: Array<{
    filePath: string;
    action: 'created' | 'modified' | 'deleted';
    contentDiff: string | null;
    occurredAt: Date;
  }>;
  finalTree: Array<{
    path: string;
    size: number;
    sha1: string;
  }>;
  keyFileSnippets: Array<{
    path: string;
    content: string;
  }>;
  allFileContents: Array<{
    path: string;
    content: string;
  }>;
  aiTurns: Array<{
    externalSessionId: string;
    turnIndex: number;
    role: 'user' | 'assistant' | 'tool';
    text: string | null;
    toolName: string | null;
    toolInputSummary: string | null;
    toolResultSummary: string | null;
    occurredAt: Date;
  }>;
}

export interface SignalResult {
  result: 'hit' | 'miss' | 'partial' | 'cannot_evaluate';
  evidence: string;
  reasoning?: string;
}

export interface PhaseEvaluationResult {
  phase: Phase;
  score: number;
  signalResults: Record<string, SignalResult>;
  feedbackText: string;
  topActionableItems: string[];
  gapTopics: GapTopic[];
  audit: EvaluationAuditPayload;
}

// Two-call plan eval. PlanAgent.evaluateResults runs Call A (fast,
// score-only) and emits PlanResultsPayload; the orchestrator persists
// a row with score + signalResults from this payload, leaving the
// detail fields empty. PlanAgent.evaluateDetails runs Call B (slow,
// in background) with Call A's verdicts injected as ground truth and
// emits PlanDetailsPayload; the orchestrator merges evidence into
// signalResults, sets feedback/top_actions/gap_topics, and stamps
// detailsCompletedAt. The two payloads are intentionally NOT a
// single PhaseEvaluationResult — the splits' atomicity differs.
export interface PlanResultsPayload {
  // Score computed deterministically from the verdicts the LLM
  // committed — the agent does this so the orchestrator stays a pure
  // I/O layer.
  score: number;
  signalResults: Record<string, SignalResult>;
  audit: EvaluationAuditPayload;
}

export interface PlanDetailsPayload {
  // Merged signal results: prior verdicts (from Call A) carry their
  // result, plus reasoning + evidence from Call B; possibly downgraded
  // by validateEvidence when the LLM-quoted evidence isn't grounded.
  signalResults: Record<string, SignalResult>;
  // Re-computed score after evidence validation. May differ by ±1
  // from Call A's score when the validator downgraded any signals.
  score: number;
  // Signal ids that the evidence validator downgraded (hit → partial
  // or partial → miss). Empty when nothing was downgraded.
  downgradedSignalIds: string[];
  feedbackText: string;
  topActionableItems: string[];
  gapTopics: GapTopic[];
  audit: EvaluationAuditPayload;
}

export interface GapTopic {
  name: string;
  coverage: 'missed' | 'lightly_touched';
  whyExpected: string;
}

export interface EvaluationAuditPayload {
  prompt: string;
  rawResponse: string;
  modelUsed: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  latencyMs?: number;
  llmScore?: number;
}

export interface SynthesisResult {
  overallScore: number;
  overallFeedback: string;
  recurringWeaknesses: string[];
}
