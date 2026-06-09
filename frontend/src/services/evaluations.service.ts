import { api } from './api';
import {
  EvaluationAudit,
  EvaluationJobStatus,
  EvaluationQueueResponse,
  PhaseEvaluation,
} from '@/types/evaluation';

export const evaluationsService = {
  runForSession(sessionId: string, model?: string) {
    return api
      .post<EvaluationQueueResponse>(`/sessions/${encodeURIComponent(sessionId)}/evaluate`, model ? { model } : {})
      .then((r) => r.data);
  },
  listForSession(sessionId: string) {
    return api
      .get<PhaseEvaluation[]>(`/sessions/${encodeURIComponent(sessionId)}/evaluations`)
      .then((r) => r.data);
  },
  listJobsForSession(sessionId: string) {
    return api
      .get<EvaluationJobStatus[]>(`/sessions/${encodeURIComponent(sessionId)}/evaluation-jobs`)
      .then((r) => r.data);
  },
  getJobStatus(jobId: string) {
    return api
      .get<EvaluationJobStatus>(`/evaluation-jobs/${encodeURIComponent(jobId)}/status`)
      .then((r) => r.data);
  },
  get(id: string) {
    return api.get<PhaseEvaluation>(`/evaluations/${encodeURIComponent(id)}`).then((r) => r.data);
  },
  getAudit(id: string) {
    return api.get<EvaluationAudit>(`/evaluations/${encodeURIComponent(id)}/audit`).then((r) => r.data);
  },
};
