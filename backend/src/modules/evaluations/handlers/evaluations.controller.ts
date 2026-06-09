import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LLM_POST_THROTTLE } from '../../throttling/throttle-presets';
import { EvaluationsService } from '../services/evaluations.service';
import { RunEvaluationDto } from '../dto/run-evaluation.dto';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/types/auth.types';
import { OwnershipService } from '../../auth/services/ownership.service';

@ApiTags('evaluations')
@Controller()
export class EvaluationsController {
  constructor(
    private readonly evaluationsService: EvaluationsService,
    private readonly ownership: OwnershipService,
  ) {}

  @Post('sessions/:sessionId/evaluate')
  @Throttle(LLM_POST_THROTTLE)
  @ApiOperation({
    summary: 'Re-run the plan-phase evaluation for a session',
    description:
      'Queues plan/build evaluation work and returns immediately. Clients poll evaluations/status for progress. Optional model override.',
  })
  async runForSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body?: RunEvaluationDto,
  ) {
    await this.ownership.assertOwnsSession(sessionId, user.id);
    return this.evaluationsService.enqueueForSession(sessionId, body?.model);
  }

  @Get('sessions/:sessionId/evaluations')
  @ApiOperation({
    summary: 'List every evaluation for a session, newest first',
    description: 'Each Re-evaluate inserts a new row; history is preserved.',
  })
  async listForSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ownership.assertOwnsSession(sessionId, user.id);
    return this.evaluationsService.getBySession(sessionId);
  }

  @Get('sessions/:sessionId/evaluation-jobs')
  @ApiOperation({ summary: 'List queued evaluation jobs for a session, newest first' })
  async listJobsForSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ownership.assertOwnsSession(sessionId, user.id);
    return this.evaluationsService.getJobsForSession(sessionId);
  }

  @Get('evaluations/:id/status')
  @ApiOperation({ summary: 'Evaluation status, including async details state' })
  async status(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ownership.assertOwnsEvaluation(id, user.id);
    return this.evaluationsService.getStatus(id);
  }

  @Get('evaluation-jobs/:jobId/status')
  @ApiOperation({ summary: 'Queued evaluation job status' })
  async jobStatus(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const row = await this.evaluationsService.getJobStatus(jobId);
    await this.ownership.assertOwnsSession(row.sessionId, user.id);
    return row;
  }

  @Get('evaluations/:id')
  @ApiOperation({ summary: 'Get a single evaluation by id' })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ownership.assertOwnsEvaluation(id, user.id);
    return this.evaluationsService.getById(id);
  }

  @Get('evaluations/:id/audit')
  @ApiOperation({
    summary: 'Get the LLM audit trail for an evaluation',
    description:
      'Returns the rendered prompt, raw LLM response, model used, token counts, cache hit/miss tokens, and latency. The bytes the parser ate, not summary metadata.',
  })
  async getAudit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.ownership.assertOwnsEvaluation(id, user.id);
    return this.evaluationsService.getAudit(id);
  }
}
