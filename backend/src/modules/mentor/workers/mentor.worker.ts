import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EvaluationQueueService } from '../../evaluation-queue/services/evaluation-queue.service';
import { EVALUATION_JOB_TYPES } from '../../evaluation-queue/evaluation-queue.constants';
import { EvaluationQueueJobData } from '../../evaluation-queue/types/evaluation-job.types';
import { MentorService } from '../services/mentor.service';

@Injectable()
export class MentorWorker implements OnModuleInit {
  constructor(
    private readonly queue: EvaluationQueueService,
    private readonly mentor: MentorService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.queue.registerWorker(
      EVALUATION_JOB_TYPES.mentor,
      async (job: Job<EvaluationQueueJobData>) => {
        const data = job.data as { evaluationId: string; model?: string };
        await this.mentor.generate(data.evaluationId, data.model);
        return data.evaluationId;
      },
      Number(this.config.get<string>('EVAL_MENTOR_CONCURRENCY') ?? 2),
    );
  }
}
