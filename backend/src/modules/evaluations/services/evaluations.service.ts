import { Injectable, NotFoundException } from '@nestjs/common';
import { Phase } from '../../phase-tagger/types/phase.types';
import { OrchestratorService } from './orchestrator.service';
import { EvaluationsRepository } from '../repositories/evaluations.repository';
import { SessionReadService } from '../../session-read/services/session-read.service';
import { SnapshotsService } from '../../snapshots/services/snapshots.service';
import { BuildContextService } from './build-context.service';
import { EvaluationQueueService } from '../../evaluation-queue/services/evaluation-queue.service';
import { EvaluationJobRepository } from '../../evaluation-queue/repositories/evaluation-job.repository';
import { computeFingerprint } from '../helpers/compute-fingerprint';
import { AGENTS_CONFIG } from '../../../config/llm-tunables.config';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly evalsRepo: EvaluationsRepository,
    private readonly sessionReadService: SessionReadService,
    private readonly snapshotsService: SnapshotsService,
    private readonly buildContextSvc: BuildContextService,
    private readonly queue: EvaluationQueueService,
    private readonly jobsRepo: EvaluationJobRepository,
  ) {}

  async runForSession(sessionId: string, model?: string) {
    const session = await this.sessionReadService.getWithQuestion(sessionId);
    const phases: Phase[] = ['plan'];
    if (session.buildEndedAt) phases.push('build');
    return this.orchestrator.run(sessionId, phases, { model });
  }

  async enqueueForSession(sessionId: string, model?: string) {
    const session = await this.sessionReadService.getWithQuestion(sessionId);
    const phases: Phase[] = ['plan'];
    if (session.buildEndedAt) phases.push('build');
    const latestSnapshot = await this.snapshotsService.latest(sessionId);
    const planMd =
      (latestSnapshot?.artifacts as { planMd?: string | null } | null)?.planMd ?? null;

    const jobIds: string[] = [];
    for (const phase of phases) {
      const resolvedModel = this.fingerprintModelFor(phase, model);
      const buildContext =
        phase === 'build' ? await this.buildContextSvc.load(sessionId, session) : undefined;
      const fingerprint = computeFingerprint(phase, {
        planMd,
        model: resolvedModel,
        buildContext,
      });
      const id =
        phase === 'plan'
          ? await this.queue.enqueuePlanScore({
              sessionId,
              model,
              resolvedModel,
              fingerprint,
            })
          : await this.queue.enqueueBuildEvaluation({
              sessionId,
              model,
              resolvedModel,
              fingerprint,
            });
      jobIds.push(id);
    }
    return { status: 'queued' as const, jobIds };
  }

  getBySession(sessionId: string) {
    return this.evalsRepo.findBySession(sessionId);
  }

  async getById(evaluationId: string) {
    const row = await this.evalsRepo.findById(evaluationId);
    if (!row) throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    return row;
  }

  async getAudit(evaluationId: string) {
    const row = await this.evalsRepo.findAuditByEvaluation(evaluationId);
    if (!row) {
      throw new NotFoundException(
        `No audit row for evaluation ${evaluationId} — it predates the audit-trail feature`,
      );
    }
    return row;
  }

  async getJobStatus(jobId: string) {
    const row = await this.jobsRepo.findById(jobId);
    if (!row) throw new NotFoundException(`Evaluation job ${jobId} not found`);
    return row;
  }

  getJobsForSession(sessionId: string) {
    return this.jobsRepo.findForSession(sessionId);
  }

  async getStatus(evaluationId: string) {
    const row = await this.getById(evaluationId);
    const latestJob = await this.jobsRepo.findLatestForEvaluation(evaluationId);
    const detailsState = row.detailsCompletedAt
      ? 'completed'
      : row.detailsError
        ? 'failed'
        : 'pending';
    return {
      state: latestJob?.state ?? 'completed',
      detailsState,
      detailsError: row.detailsError,
      latestJob,
    };
  }

  private fingerprintModelFor(phase: Phase, overrideModel: string | undefined): string {
    if (overrideModel) return overrideModel;
    if (phase === 'plan') return AGENTS_CONFIG.planAgent.defaultModel;
    if (phase === 'build') return AGENTS_CONFIG.buildAgent.defaultModel;
    return AGENTS_CONFIG.planAgent.defaultModel;
  }
}
