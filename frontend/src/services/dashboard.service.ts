import { api } from './api';
import {
  FeedbackSummary,
  HeatmapCell,
  TrendPoint,
  WeaknessSummary,
} from '@/types/dashboard';

export const dashboardService = {
  trend(rubricVersion?: string) {
    return api
      .get<TrendPoint[]>('/dashboard/trend', { params: { rubricVersion } })
      .then((r) => r.data);
  },
  heatmap(rubricVersion?: string) {
    return api
      .get<HeatmapCell[]>('/dashboard/heatmap', { params: { rubricVersion } })
      .then((r) => r.data);
  },
  weaknesses(rubricVersion?: string) {
    return api
      .get<WeaknessSummary[]>('/dashboard/weaknesses', { params: { rubricVersion } })
      .then((r) => r.data);
  },
  feedback() {
    return api.get<FeedbackSummary>('/dashboard/feedback').then((r) => r.data);
  },
};
