// Call B (Plan two-call split): validates the submit_plan_details
// tool args. Per-signal {reasoning, evidence} (no result — that was
// committed by Call A) + feedback + top_actions + gap_topics.

import { GapTopic } from '../types/evaluation.types';
import {
  EvaluationParseError,
  extractGapTopics,
} from './eval-output.shared';

export interface ParsedPlanDetails {
  evidenceBySignal: Record<string, { reasoning: string; evidence: string }>;
  feedback: string;
  topActions: string[];
  gapTopics: GapTopic[];
  droppedTopicNames?: string[];
}

export function validatePlanDetailsArgs(
  rawArgs: unknown,
  expectedSignalIds: ReadonlySet<string>,
): ParsedPlanDetails {
  const rawText = safeStringify(rawArgs);

  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    throw new EvaluationParseError('Call B tool args were not a JSON object', rawText);
  }
  const obj = rawArgs as Record<string, unknown>;

  if (!obj.signals || typeof obj.signals !== 'object' || Array.isArray(obj.signals)) {
    throw new EvaluationParseError('Call B: missing or invalid "signals" object', rawText);
  }

  const evidenceBySignal: Record<string, { reasoning: string; evidence: string }> = {};
  for (const [id, val] of Object.entries(obj.signals as Record<string, unknown>)) {
    if (!expectedSignalIds.has(id)) {
      throw new EvaluationParseError(
        `Call B: unknown signal id "${id}" not in rubric`,
        rawText,
      );
    }
    if (!val || typeof val !== 'object') {
      throw new EvaluationParseError(`Call B: signal "${id}" is not an object`, rawText);
    }
    const v = val as Record<string, unknown>;
    // Defensive: on non-tool-use providers (e.g. claude_cli) the model
    // sometimes echoes the old monolithic shape — { result, evidence }
    // without reasoning — because the rubric system prompt narrative
    // still discusses verdicts. The verdicts came from Call A and are
    // authoritative; any `result` field the model emits here is
    // ignored. We treat the missing reasoning as empty string instead
    // of crashing; the audit still records the raw tool args.
    const reasoning = typeof v.reasoning === 'string' ? v.reasoning : '';
    if (typeof v.evidence !== 'string') {
      throw new EvaluationParseError(
        `Call B: signal "${id}".evidence must be a string`,
        rawText,
      );
    }
    evidenceBySignal[id] = { reasoning, evidence: v.evidence };
  }

  for (const id of expectedSignalIds) {
    if (!(id in evidenceBySignal)) {
      throw new EvaluationParseError(
        `Call B: missing signal "${id}" in tool args`,
        rawText,
      );
    }
  }

  if (typeof obj.feedback !== 'string') {
    throw new EvaluationParseError('Call B: missing or non-string "feedback"', rawText);
  }

  const topActionsRaw = (obj.top_actions ?? obj.topActions) as unknown;
  if (!Array.isArray(topActionsRaw)) {
    throw new EvaluationParseError('Call B: missing or non-array "top_actions"', rawText);
  }
  const topActions: string[] = [];
  for (const item of topActionsRaw) {
    if (typeof item !== 'string') {
      throw new EvaluationParseError(
        'Call B: "top_actions" must contain only strings',
        rawText,
      );
    }
    topActions.push(item);
  }

  const gap = extractGapTopics(obj, rawText);

  return {
    evidenceBySignal,
    feedback: obj.feedback,
    topActions,
    gapTopics: gap.topics,
    droppedTopicNames: gap.dropped,
  };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
