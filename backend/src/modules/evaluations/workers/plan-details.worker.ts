import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OrchestratorService } from '../services/orchestrator.service';
import { EvaluationQueueService } from '../../evaluation-queue/services/evaluation-queue.service';
import { EVALUATION_JOB_TYPES } from '../../evaluation-queue/evaluation-queue.constants';
import { EvaluationQueueJobData } from '../../evaluation-queue/types/evaluation-job.types';

@Injectable()
export class PlanDetailsWorker implements OnModuleInit {
  constructor(
    private readonly queue: EvaluationQueueService,
    private readonly orchestrator: OrchestratorService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.queue.registerWorker(
      EVALUATION_JOB_TYPES.planDetails,
      async (job: Job<EvaluationQueueJobData>) => {
        const data = job.data as { evaluationId: string; model?: string };
        await this.orchestrator.runPlanDetailsForEvaluation(data.evaluationId, data.model);
        return data.evaluationId;
      },
      Number(this.config.get<string>('EVAL_PLAN_DETAILS_CONCURRENCY') ?? 2),
    );
  }
}
