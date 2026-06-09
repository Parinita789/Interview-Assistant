import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { EvaluationQueueService } from '../../evaluation-queue/services/evaluation-queue.service';
import { EVALUATION_JOB_TYPES } from '../../evaluation-queue/evaluation-queue.constants';
import { EvaluationQueueJobData } from '../../evaluation-queue/types/evaluation-job.types';
import { SignalMentorService } from '../services/signal-mentor.service';

@Injectable()
export class SignalMentorWorker implements OnModuleInit {
  constructor(
    private readonly queue: EvaluationQueueService,
    private readonly signalMentor: SignalMentorService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.queue.registerWorker(
      EVALUATION_JOB_TYPES.signalMentor,
      async (job: Job<EvaluationQueueJobData>) => {
        const data = job.data as { evaluationId: string; model?: string };
        await this.signalMentor.generate(data.evaluationId, data.model);
        return data.evaluationId;
      },
      Number(this.config.get<string>('EVAL_SIGNAL_MENTOR_CONCURRENCY') ?? 2),
    );
  }
}
