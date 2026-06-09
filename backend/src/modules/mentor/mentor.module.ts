import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { SessionReadModule } from '../session-read/session-read.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { EvaluationQueueModule } from '../evaluation-queue/evaluation-queue.module';
import { MentorController } from './handlers/mentor.controller';
import { MentorService } from './services/mentor.service';
import { MentorAgent } from './agents/mentor.agent';
import { MentorRepository } from './repositories/mentor.repository';
import { MentorWorker } from './workers/mentor.worker';

@Module({
  imports: [
    LlmModule,
    EvaluationsModule,
    SessionReadModule,
    SnapshotsModule,
    AuthModule,
    DashboardModule,
    EvaluationQueueModule,
  ],
  controllers: [MentorController],
  providers: [MentorService, MentorAgent, MentorRepository, MentorWorker],
  exports: [MentorService],
})
export class MentorModule {}
