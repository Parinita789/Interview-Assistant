export type FeedbackSourceKind = 'gap_topic' | 'signal' | 'mentor' | 'signal_mentor';
export type FeedbackSeverity = 'high' | 'medium' | 'low';

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

export interface FeedbackSummaryPayload {
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

export interface FeedbackProjectionState {
  userId: string;
  version: number;
  updatedAt: Date;
}

export interface FeedbackRefreshEvidenceRow {
  sessionId: string;
  questionId: string;
  rubricVersion: string;
  kind: string | null;
  seniority: string | null;
  phase: string;
  evaluationId: string;
  signalResults: unknown;
  gapTopics: unknown;
  feedbackText: string;
  evaluatedAt: Date;
  mentorContent: string | null;
  signalMentorAnnotations: unknown;
}

export interface GroupedFeedbackConcept {
  topicId: string;
  label: string;
  severity: FeedbackSeverity;
  count: number;
  sourceRefs: FeedbackSourceRef[];
  evidenceSnippets: string[];
}
