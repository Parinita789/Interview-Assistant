import { Rubric } from '../types/rubric.types';
import { ToolDefinition } from '../../llm/types/llm.types';
import { GAP_TOPIC_SUB_SCHEMA } from './_shared-schema-atoms';

export const SUBMIT_PLAN_DETAILS_TOOL_NAME = 'submit_plan_details';

const SIGNAL_DETAIL_SUB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reasoning', 'evidence'],
  properties: {
    reasoning: {
      type: 'string',
      maxLength: 400,
      description:
        'Brief reasoning for the verdict the prior pass committed to for this signal. Useful for the audit trail; not used in scoring.',
    },
    evidence: {
      type: 'string',
      maxLength: 150,
      description:
        'Verbatim quote from artifacts (≤150 chars — a short citation, not a summary). For cannot_evaluate, briefly explain why the signal is not applicable.',
    },
  },
} as const;

const SIGNAL_REF = { $ref: '#/$defs/signal_detail' } as const;

// Call B of the two-call plan eval split. Receives the per-signal
// verdicts from Call A injected into the user prompt as ground truth,
// and is asked to fill in the supporting evidence + feedback +
// top_actions + gap_topics. Output is roughly 10-30x larger than
// Call A's, so this is the slower of the two calls — but the UI is
// already showing score + signals while it runs.
export function buildPlanDetailsTool(rubric: Rubric): ToolDefinition {
  const signalIds = rubric.signals.map((s) => s.id);
  const signalProperties: Record<string, unknown> = {};
  for (const id of signalIds) {
    signalProperties[id] = SIGNAL_REF;
  }

  return {
    name: SUBMIT_PLAN_DETAILS_TOOL_NAME,
    description:
      "Submit reasoning + evidence per signal, plus narrative feedback, top actionable items, and gap topics. The per-signal verdicts (hit/partial/miss/cannot_evaluate) were committed by a prior pass and ARE NOT yours to revise — your job is to back them up with quotes and synthesize the holistic feedback.",
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['signals', 'feedback', 'top_actions', 'gap_topics'],
      $defs: {
        signal_detail: SIGNAL_DETAIL_SUB_SCHEMA,
        gap_topic: GAP_TOPIC_SUB_SCHEMA,
      },
      properties: {
        signals: {
          type: 'object',
          additionalProperties: false,
          required: signalIds,
          properties: signalProperties,
        },
        feedback: { type: 'string', maxLength: 3000 },
        top_actions: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', maxLength: 200 },
        },
        gap_topics: {
          type: 'array',
          maxItems: 5,
          items: { $ref: '#/$defs/gap_topic' },
          description:
            'Up to 5 system-design topics directly relevant to THIS question that the candidate missed or only lightly touched. Empty array is valid when nothing is missing.',
        },
      },
    },
  };
}
