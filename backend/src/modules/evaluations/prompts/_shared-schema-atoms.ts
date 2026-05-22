import { CANONICAL_TOPICS } from '../helpers/canonical-topics';

export const RESULT_ENUM = ['hit', 'partial', 'miss', 'cannot_evaluate'] as const;
export type SignalResultKind = (typeof RESULT_ENUM)[number];

export const GAP_TOPIC_SUB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'coverage', 'why_expected'],
  properties: {
    name: {
      type: 'string',
      enum: [...CANONICAL_TOPICS],
      description: 'Topic id from the canonical system-design vocabulary.',
    },
    coverage: {
      type: 'string',
      enum: ['missed', 'lightly_touched'],
    },
    why_expected: {
      type: 'string',
      maxLength: 400,
      description:
        '1-2 sentences naming what about THIS question (stated NFRs, scale, domain, or the candidate plan/code itself) makes this topic expected.',
    },
  },
} as const;
