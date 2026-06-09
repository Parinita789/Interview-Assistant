import { Injectable, OnModuleInit } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OrchestratorService } from '../services/orchestrator.service';
import { EvaluationQueueService } from '../../evaluation-queue/services/evaluation-queue.service';
import { EVALUATION_JOB_TYPES } from '../../evaluation-queue/evaluation-queue.constants';
import { EvaluationQueueJobData } from '../../evaluation-queue/types/evaluation-job.types';

@Injectable()
export class BuildEvaluationWorker implements OnModuleInit {
  constructor(
    private readonly queue: EvaluationQueueService,
    private readonly orchestrator: OrchestratorService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.queue.registerWorker(
      EVALUATION_JOB_TYPES.buildEvaluation,
      async (job: Job<EvaluationQueueJobData>) => {
        const data = job.data as { sessionId: string; model?: string };
        const rows = await this.orchestrator.run(data.sessionId, ['build'], {
          model: data.model,
        });
        return rows[0]?.id;
      },
      Number(this.config.get<string>('EVAL_BUILD_CONCURRENCY') ?? 2),
    );
  }
}
