import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OrchestratorService } from '../services/orchestrator.service';
import { EvaluationQueueService } from '../../evaluation-queue/services/evaluation-queue.service';
import { EVALUATION_JOB_TYPES } from '../../evaluation-queue/evaluation-queue.constants';
import { EvaluationQueueJobData } from '../../evaluation-queue/types/evaluation-job.types';

@Injectable()
export class PlanScoreWorker implements OnModuleInit {
  constructor(
    private readonly queue: EvaluationQueueService,
    private readonly orchestrator: OrchestratorService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.queue.registerWorker(
      EVALUATION_JOB_TYPES.planScore,
      async (job: Job<EvaluationQueueJobData>) => {
        const data = job.data as { sessionId: string; model?: string };
        const rows = await this.orchestrator.run(data.sessionId, ['plan'], {
          model: data.model,
        });
        return rows[0]?.id;
      },
      Number(this.config.get<string>('EVAL_PLAN_SCORE_CONCURRENCY') ?? 3),
    );
  }
}
