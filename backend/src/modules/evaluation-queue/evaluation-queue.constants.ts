export const EVALUATION_QUEUE_NAME = 'evaluation-work';

export const EVALUATION_JOB_TYPES = {
  planScore: 'plan-score',
  planDetails: 'plan-details',
  buildEvaluation: 'build-evaluation',
  mentor: 'mentor',
  signalMentor: 'signal-mentor',
} as const;

export type EvaluationJobType =
  (typeof EVALUATION_JOB_TYPES)[keyof typeof EVALUATION_JOB_TYPES];

export const EVALUATION_QUEUE_DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 7 * 24 * 60 * 60 },
  removeOnFail: false,
} as const;
