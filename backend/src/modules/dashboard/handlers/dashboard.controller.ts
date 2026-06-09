import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/types/auth.types';
import { DashboardService } from '../services/dashboard.service';
import { FeedbackService } from '../services/feedback.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly feedbackService: FeedbackService,
  ) {}

  @Get('trend')
  @ApiOperation({ summary: 'Score-over-time trend across sessions' })
  @ApiQuery({ name: 'rubricVersion', required: false })
  trend(@Query('rubricVersion') rubricVersion?: string) {
    return this.dashboardService.scoreTrend(rubricVersion);
  }

  @Get('heatmap')
  @ApiOperation({ summary: 'Signal-by-signal hit/miss heatmap across sessions' })
  @ApiQuery({ name: 'rubricVersion', required: false })
  heatmap(@Query('rubricVersion') rubricVersion?: string) {
    return this.dashboardService.signalHeatmap(rubricVersion);
  }

  @Get('weaknesses')
  @ApiOperation({ summary: 'Signals the candidate keeps missing / firing badly' })
  @ApiQuery({ name: 'rubricVersion', required: false })
  weaknesses(@Query('rubricVersion') rubricVersion?: string) {
    return this.dashboardService.recurringWeaknesses(rubricVersion);
  }

  @Get('feedback')
  @ApiOperation({ summary: 'Cached universal feedback summary for the current user' })
  feedback(@CurrentUser() user: AuthenticatedUser) {
    return this.feedbackService.getFeedback(user.id);
  }
}
