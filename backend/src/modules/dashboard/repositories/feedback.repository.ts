import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { FeedbackSummaryPayload } from '../types/feedback.types';

@Injectable()
export class FeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  getState(userId: string) {
    return this.prisma.feedbackProjectionState.findUnique({ where: { userId } });
  }

  incrementVersion(userId: string) {
    return this.prisma.feedbackProjectionState.upsert({
      where: { userId },
      create: { userId, version: 1 },
      update: { version: { increment: 1 } },
    });
  }

  getSummary(userId: string) {
    return this.prisma.feedbackSummary.findUnique({ where: { userId } });
  }

  upsertSummary(userId: string, payload: FeedbackSummaryPayload) {
    return this.prisma.feedbackSummary.upsert({
      where: { userId },
      create: {
        userId,
        computedForVersion: payload.computedForVersion,
        generatedAt: new Date(payload.generatedAt),
        payload: payload as unknown as Prisma.InputJsonValue,
      },
      update: {
        computedForVersion: payload.computedForVersion,
        generatedAt: new Date(payload.generatedAt),
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async loadEvidence(userId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        status: 'completed',
        phaseEvaluations: { some: {} },
      },
      select: {
        id: true,
        questionId: true,
        seniority: true,
        question: {
          select: {
            rubricVersion: true,
            kind: true,
          },
        },
        phaseEvaluations: {
          where: {
            OR: [
              { phase: 'build' },
              { detailsCompletedAt: { not: null } },
              { feedbackText: { not: '' } },
            ],
          },
          orderBy: { evaluatedAt: 'desc' },
          select: {
            id: true,
            phase: true,
            signalResults: true,
            gapTopics: true,
            feedbackText: true,
            evaluatedAt: true,
            mentor: { select: { content: true } },
            signalMentor: { select: { annotations: true } },
          },
        },
      },
      orderBy: { endedAt: 'desc' },
    });

    return sessions.flatMap((session) => {
      const latestByPhase = new Map<string, (typeof session.phaseEvaluations)[number]>();
      for (const evaluation of session.phaseEvaluations) {
        if (!latestByPhase.has(evaluation.phase)) {
          latestByPhase.set(evaluation.phase, evaluation);
        }
      }

      return [...latestByPhase.values()].map((evaluation) => ({
        sessionId: session.id,
        questionId: session.questionId,
        rubricVersion: session.question.rubricVersion,
        kind: session.question.kind,
        seniority: session.seniority,
        phase: evaluation.phase,
        evaluationId: evaluation.id,
        signalResults: evaluation.signalResults,
        gapTopics: evaluation.gapTopics,
        feedbackText: evaluation.feedbackText,
        evaluatedAt: evaluation.evaluatedAt,
        mentorContent: evaluation.mentor?.content ?? null,
        signalMentorAnnotations: evaluation.signalMentor?.annotations ?? null,
      }));
    });
  }

  async findEvaluationUserId(evaluationId: string): Promise<string | null> {
    const row = await this.prisma.phaseEvaluation.findUnique({
      where: { id: evaluationId },
      select: { session: { select: { userId: true } } },
    });
    return row?.session.userId ?? null;
  }
}
