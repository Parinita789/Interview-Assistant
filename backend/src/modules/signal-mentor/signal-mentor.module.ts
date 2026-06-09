import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { SessionReadModule } from '../session-read/session-read.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { EvaluationQueueModule } from '../evaluation-queue/evaluation-queue.module';
import { SignalMentorController } from './handlers/signal-mentor.controller';
import { SignalMentorService } from './services/signal-mentor.service';
import { SignalMentorAgent } from './agents/signal-mentor.agent';
import { SignalMentorRepository } from './repositories/signal-mentor.repository';
import { SignalMentorWorker } from './workers/signal-mentor.worker';

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
  controllers: [SignalMentorController],
  providers: [SignalMentorService, SignalMentorAgent, SignalMentorRepository, SignalMentorWorker],
  exports: [SignalMentorService],
})
export class SignalMentorModule {}
