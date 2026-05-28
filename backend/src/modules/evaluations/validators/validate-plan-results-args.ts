// Call A (Plan two-call split): validates the submit_plan_results
// tool args (or JSON text in the non-tool-use fallback) and converts
// them into a SignalResult map with evidence=''. The deterministic
// score-computer is happy with this — it only reads `result`.

import { SignalResult } from '../types/evaluation.types';
import {
  EvaluationParseError,
  VALID_RESULTS,
} from './eval-output.shared';

export interface ParsedPlanResults {
  signals: Record<string, SignalResult>;
}

export function validatePlanResultsArgs(
  rawArgs: unknown,
  expectedSignalIds: ReadonlySet<string>,
): ParsedPlanResults {
  const rawText = safeStringify(rawArgs);

  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    throw new EvaluationParseError('Call A tool args were not a JSON object', rawText);
  }
  const obj = rawArgs as Record<string, unknown>;

  if (!obj.signals || typeof obj.signals !== 'object' || Array.isArray(obj.signals)) {
    throw new EvaluationParseError('Call A: missing or invalid "signals" object', rawText);
  }

  const signals: Record<string, SignalResult> = {};
  for (const [id, val] of Object.entries(obj.signals as Record<string, unknown>)) {
    if (!expectedSignalIds.has(id)) {
      throw new EvaluationParseError(
        `Call A: unknown signal id "${id}" not in rubric`,
        rawText,
      );
    }
    if (!val || typeof val !== 'object') {
      throw new EvaluationParseError(`Call A: signal "${id}" is not an object`, rawText);
    }
    const v = val as Record<string, unknown>;
    if (typeof v.result !== 'string' || !VALID_RESULTS.has(v.result)) {
      throw new EvaluationParseError(
        `Call A: signal "${id}".result must be one of ${[...VALID_RESULTS].join('|')}`,
        rawText,
      );
    }
    signals[id] = { result: v.result as SignalResult['result'], evidence: '' };
  }

  for (const id of expectedSignalIds) {
    if (!(id in signals)) {
      throw new EvaluationParseError(`Call A: missing signal "${id}" in tool args`, rawText);
    }
  }

  return { signals };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
