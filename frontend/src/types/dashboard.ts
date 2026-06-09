import { Phase } from './evaluation';

export interface TrendPoint {
  sessionId: string;
  endedAt: string;
  overallScore: number;
}

export interface HeatmapCell {
  signalId: string;
  phase: Phase;
  hitRate: number;
  totalEvaluations: number;
}

export interface WeaknessSummary {
  signalId: string;
  phase: Phase;
  missCount: number;
  exampleEvidence: string[];
}

export type FeedbackSeverity = 'high' | 'medium' | 'low';
export type FeedbackSourceKind = 'gap_topic' | 'signal' | 'mentor' | 'signal_mentor';

export interface FeedbackSourceRef {
  sessionId: string;
  evaluationId: string;
  questionId: string;
  label: string;
  sourceKind: FeedbackSourceKind;
}

export interface FeedbackConcept {
  topicId: string;
  label: string;
  severity: FeedbackSeverity;
  count: number;
  summary: string;
  sourceRefs: FeedbackSourceRef[];
}

export interface FeedbackStudyPlanStep {
  topicId: string;
  title: string;
  why: string;
  sourceRefs: string[];
}

export interface FeedbackSummary {
  scope: { kind: 'all_sessions' };
  computedForVersion: number;
  generatedAt: string;
  sourceCounts: {
    sessions: number;
    evaluations: number;
    mentorArtifacts: number;
    signalMentorArtifacts: number;
  };
  overview: {
    sessionsAnalyzed: number;
    evaluationsAnalyzed: number;
    topThemes: string[];
  };
  concepts: FeedbackConcept[];
  studyPlan: FeedbackStudyPlanStep[];
  empty?: {
    reason: 'no_completed_data';
    message: string;
  };
}
