import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { EvaluationJobRepository } from './repositories/evaluation-job.repository';
import { EvaluationQueueService } from './services/evaluation-queue.service';

@Module({
  imports: [DatabaseModule],
  providers: [EvaluationJobRepository, EvaluationQueueService],
  exports: [EvaluationJobRepository, EvaluationQueueService],
})
export class EvaluationQueueModule {}
