import { Rubric } from '../types/rubric.types';
import { ToolDefinition } from '../../llm/types/llm.types';
import { RESULT_ENUM } from './_shared-schema-atoms';

export const SUBMIT_PLAN_RESULTS_TOOL_NAME = 'submit_plan_results';

const SIGNAL_RESULT_SUB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['result'],
  properties: {
    result: {
      type: 'string',
      enum: RESULT_ENUM,
    },
  },
} as const;

const SIGNAL_REF = { $ref: '#/$defs/signal_result' } as const;

// Call A of the two-call plan eval split. Returns per-signal verdicts
// (hit / partial / miss / cannot_evaluate) only — no reasoning, no
// evidence quote. The deterministic score is computed from this
// payload alone (see score-computer.ts), so the UI can render score +
// signal cards as soon as this call lands (~5-15s). Call B then runs
// in the background to attach evidence + feedback + gaps.
export function buildPlanResultsTool(rubric: Rubric): ToolDefinition {
  const signalIds = rubric.signals.map((s) => s.id);
  const signalProperties: Record<string, unknown> = {};
  for (const id of signalIds) {
    signalProperties[id] = SIGNAL_REF;
  }

  return {
    name: SUBMIT_PLAN_RESULTS_TOOL_NAME,
    description:
      "Submit per-signal verdicts (hit / partial / miss / cannot_evaluate) for the candidate's plan.md. Score is computed deterministically from these. Do NOT include evidence or reasoning here — a follow-up tool call will collect those.",
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['signals'],
      $defs: {
        signal_result: SIGNAL_RESULT_SUB_SCHEMA,
      },
      properties: {
        signals: {
          type: 'object',
          additionalProperties: false,
          required: signalIds,
          properties: signalProperties,
        },
      },
    },
  };
}
