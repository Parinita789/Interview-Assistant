import { Module } from '@nestjs/common';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { DashboardController } from './handlers/dashboard.controller';
import { DashboardService } from './services/dashboard.service';
import { DashboardRepository } from './repositories/dashboard.repository';
import { FeedbackService } from './services/feedback.service';
import { FeedbackRepository } from './repositories/feedback.repository';

@Module({
  imports: [EvaluationsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardRepository, FeedbackService, FeedbackRepository],
  exports: [DashboardService, FeedbackService],
})
export class DashboardModule {}
