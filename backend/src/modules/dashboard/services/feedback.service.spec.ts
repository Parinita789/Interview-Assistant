import { BackgroundTaskTracker } from '../../../common/background-task-tracker.service';
import { LlmService } from '../../llm/services/llm.service';
import { FeedbackRepository } from '../repositories/feedback.repository';
import { FeedbackService, groupEvidence } from './feedback.service';

describe('feedback grouping', () => {
  it('collapses repeated gapTopics into one concept and preserves source refs', () => {
    const grouped = groupEvidence([
      {
        sessionId: 's1',
        questionId: 'q1',
        rubricVersion: 'v2.0',
        kind: 'traditional_design',
        seniority: 'mid',
        phase: 'plan',
        evaluationId: 'e1',
        signalResults: {},
        gapTopics: [
          { name: 'capacity_estimation', coverage: 'missed', whyExpected: 'Scale math was absent.' },
        ],
        feedbackText: '',
        evaluatedAt: new Date(),
        mentorContent: null,
        signalMentorAnnotations: null,
      },
      {
        sessionId: 's2',
        questionId: 'q2',
        rubricVersion: 'v2.0',
        kind: 'traditional_design',
        seniority: 'mid',
        phase: 'build',
        evaluationId: 'e2',
        signalResults: {},
        gapTopics: [
          { name: 'capacity_estimation', coverage: 'lightly_touched', whyExpected: 'Only a rough QPS guess.' },
        ],
        feedbackText: '',
        evaluatedAt: new Date(),
        mentorContent: null,
        signalMentorAnnotations: null,
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].topicId).toBe('capacity_estimation');
    expect(grouped[0].count).toBe(2);
    expect(grouped[0].sourceRefs.map((ref) => ref.sessionId)).toEqual(['s1', 's2']);
  });

  it('maps signal failures to canonical topics', () => {
    const polarity = new Map([
      [
        'e1',
        new Map<string, 'good' | 'bad'>([
          ['read_write_path_differentiation', 'good'],
          ['scale_pretense', 'bad'],
        ]),
      ],
    ]);
    const grouped = groupEvidence(
      [
        {
          sessionId: 's1',
          questionId: 'q1',
          rubricVersion: 'v2.0',
          kind: 'traditional_design',
          seniority: 'mid',
          phase: 'plan',
          evaluationId: 'e1',
          signalResults: {
            read_write_path_differentiation: {
              result: 'miss',
              evidence: 'Read and write paths were blended together.',
            },
            scale_pretense: {
              result: 'miss',
              evidence: 'Candidate avoided fake scale claims.',
            },
          },
          gapTopics: [],
          feedbackText: '',
          evaluatedAt: new Date(),
          mentorContent: null,
          signalMentorAnnotations: null,
        },
      ],
      polarity,
      { includeRawSignals: true },
    );

    expect(grouped[0].topicId).toBe('read_write_path_separation');
    expect(grouped).toHaveLength(1);
    expect(grouped[0].sourceRefs[0]).toMatchObject({
      sessionId: 's1',
      questionId: 'q1',
      sourceKind: 'signal',
    });
  });
});

describe('FeedbackService projection state', () => {
  function makeService(repo: Partial<FeedbackRepository>, llmCall = jest.fn()) {
    const tasks = {
      track: jest.fn((promise: Promise<unknown>) => promise.then(() => undefined)),
    } as unknown as BackgroundTaskTracker;
    const llm = { call: llmCall } as unknown as LlmService;
    const rubricLoader = { load: jest.fn() };
    return {
      service: new FeedbackService(repo as FeedbackRepository, llm, tasks, rubricLoader as never),
      tasks,
    };
  }

  it('first read returns an empty-state payload without calling the LLM', async () => {
    const llmCall = jest.fn();
    const { service } = makeService(
      {
        getSummary: jest.fn().mockResolvedValue(null),
        getState: jest.fn().mockResolvedValue(null),
      },
      llmCall,
    );

    const payload = await service.getFeedback('u1');

    expect(payload.empty?.reason).toBe('no_completed_data');
    expect(payload.concepts).toEqual([]);
    expect(llmCall).not.toHaveBeenCalled();
  });

  it('skips refresh when the stored summary is already current', async () => {
    const stored = {
      payload: {
        scope: { kind: 'all_sessions' },
        computedForVersion: 3,
        generatedAt: new Date().toISOString(),
        sourceCounts: { sessions: 0, evaluations: 0, mentorArtifacts: 0, signalMentorArtifacts: 0 },
        overview: { sessionsAnalyzed: 0, evaluationsAnalyzed: 0, topThemes: [] },
        concepts: [],
        studyPlan: [],
      },
      computedForVersion: 3,
    };
    const repo = {
      getState: jest.fn().mockResolvedValue({ userId: 'u1', version: 3, updatedAt: new Date() }),
      getSummary: jest.fn().mockResolvedValue(stored),
      loadEvidence: jest.fn(),
      upsertSummary: jest.fn(),
    };
    const { service } = makeService(repo);

    await expect(service.refreshIfStale('u1', 3)).resolves.toBe(stored.payload);
    expect(repo.loadEvidence).not.toHaveBeenCalled();
    expect(repo.upsertSummary).not.toHaveBeenCalled();
  });

  it('invalidating increments version and enqueues the matching refresh', async () => {
    const repo = {
      incrementVersion: jest.fn().mockResolvedValue({ userId: 'u1', version: 4, updatedAt: new Date() }),
      getState: jest.fn().mockResolvedValue({ userId: 'u1', version: 4, updatedAt: new Date() }),
      getSummary: jest.fn().mockResolvedValue({ computedForVersion: 4, payload: { computedForVersion: 4 } }),
    };
    const { service, tasks } = makeService(repo);

    await service.invalidateForUser('u1');

    expect(repo.incrementVersion).toHaveBeenCalledWith('u1');
    expect(tasks.track).toHaveBeenCalledWith(
      expect.any(Promise),
      'feedback.refresh(u1,v4)',
      { timeoutMs: 120_000 },
    );
  });
});
