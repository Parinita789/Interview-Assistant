import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { truncateAll, prismaOf } from './helpers/db';
import { authHeader, signupUser, type TestUser } from './helpers/users';

describe('Dashboard feedback (e2e)', () => {
  let app: INestApplication;
  let llmCall: jest.Mock;

  beforeAll(async () => {
    ({ app, llmCall } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
    llmCall.mockClear();
  });

  it('returns an empty-state payload for a user with no computed data and does not call the LLM', async () => {
    const user = await signupUser(app);

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/feedback')
      .set(authHeader(user))
      .expect(200);

    expect(res.body).toMatchObject({
      scope: { kind: 'all_sessions' },
      computedForVersion: 0,
      overview: { sessionsAnalyzed: 0, evaluationsAnalyzed: 0, topThemes: [] },
      concepts: [],
      studyPlan: [],
      empty: { reason: 'no_completed_data' },
    });
    expect(llmCall).not.toHaveBeenCalled();
  });

  it('returns only the current user stored summary', async () => {
    const userA = await signupUser(app);
    const userB = await signupUser(app);
    await seedSummary(userA, 'capacity_estimation');
    await seedSummary(userB, 'sharding');

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/feedback')
      .set(authHeader(userA))
      .expect(200);

    expect(res.body.computedForVersion).toBe(7);
    expect(res.body.concepts).toHaveLength(1);
    expect(res.body.concepts[0]).toMatchObject({
      topicId: 'capacity_estimation',
      sourceRefs: [
        {
          sessionId: expect.any(String),
          evaluationId: expect.any(String),
          questionId: expect.any(String),
          sourceKind: 'gap_topic',
        },
      ],
    });
    expect(res.body.concepts[0].topicId).not.toBe('sharding');
    expect(llmCall).not.toHaveBeenCalled();
  });

  async function seedSummary(user: TestUser, topicId: string) {
    const prisma = prismaOf(app);
    const question = await prisma.question.create({
      data: {
        prompt: 'Design a read-heavy URL shortener.',
        rubricVersion: 'v2.0',
        kind: 'traditional_design',
        userId: user.id,
      },
    });
    const session = await prisma.session.create({
      data: {
        questionId: question.id,
        userId: user.id,
        status: 'completed',
        endedAt: new Date(),
      },
    });
    const evaluation = await prisma.phaseEvaluation.create({
      data: {
        sessionId: session.id,
        phase: 'plan',
        score: 3,
        signalResults: {},
        feedbackText: 'Feedback',
        topActionableItems: [],
        gapTopics: [],
        detailsCompletedAt: new Date(),
      },
    });
    const payload = {
      scope: { kind: 'all_sessions' },
      computedForVersion: 7,
      generatedAt: new Date().toISOString(),
      sourceCounts: {
        sessions: 1,
        evaluations: 1,
        mentorArtifacts: 0,
        signalMentorArtifacts: 0,
      },
      overview: {
        sessionsAnalyzed: 1,
        evaluationsAnalyzed: 1,
        topThemes: [topicId],
      },
      concepts: [
        {
          topicId,
          label: topicId,
          severity: 'medium',
          count: 1,
          summary: 'Stored summary',
          sourceRefs: [
            {
              sessionId: session.id,
              evaluationId: evaluation.id,
              questionId: question.id,
              label: 'Stored source',
              sourceKind: 'gap_topic',
            },
          ],
        },
      ],
      studyPlan: [
        {
          topicId,
          title: 'Study topic',
          why: 'It recurs.',
          sourceRefs: [`${session.id}:${evaluation.id}:gap_topic:Stored source`],
        },
      ],
    };

    await prisma.feedbackProjectionState.create({
      data: { userId: user.id, version: 7 },
    });
    await prisma.feedbackSummary.create({
      data: {
        userId: user.id,
        computedForVersion: 7,
        generatedAt: new Date(payload.generatedAt),
        payload,
      },
    });
  }
});
