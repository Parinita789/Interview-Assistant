import { Phase } from '../../phase-tagger/types/phase.types';

export interface PhaseEvaluationJobData {
  sessionId: string;
  phase: Phase;
  model?: string;
}

export interface EvaluationArtifactJobData {
  sessionId: string;
  evaluationId: string;
  model?: string;
}

export type EvaluationQueueJobData = PhaseEvaluationJobData | EvaluationArtifactJobData;
