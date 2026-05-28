import { ConfigService } from '@nestjs/config';
import * as path from 'node:path';
import { PlanAgent } from './plan.agent';
import { LlmService } from '../../llm/services/llm.service';
import { RubricLoaderService } from '../services/rubric-loader.service';
import { PhaseEvalInput, SignalResult } from '../types/evaluation.types';
import { LlmResponse } from '../../llm/types/llm.types';
import { SUBMIT_PLAN_RESULTS_TOOL_NAME } from '../prompts/plan-results-tool-schema';
import { SUBMIT_PLAN_DETAILS_TOOL_NAME } from '../prompts/plan-details-tool-schema';

// Make an LlmService that records all .call(...) invocations and
// returns the queued responses in order. Useful for verifying Call A
// vs Call B receive their respective tool schemas.
function makeLlm(responses: LlmResponse[]): { svc: LlmService; calls: jest.Mock } {
  const queue = [...responses];
  const calls = jest.fn().mockImplementation(async () => {
    const r = queue.shift();
    if (!r) throw new Error('LlmService.call invoked more times than queued responses');
    return r;
  });
  const svc = {
    call: calls,
    supportsToolUse: () => true,
  } as unknown as LlmService;
  return { svc, calls };
}

function makeInput(overrides: Partial<PhaseEvalInput> = {}): PhaseEvalInput {
  return {
    session: {
      id: 'sid',
      prompt: 'Design a URL shortener with scale to 10K rps.',
      startedAt: new Date('2026-05-07T09:00:00Z'),
      endedAt: new Date('2026-05-07T10:00:00Z'),
    },
    userId: 'uid-1',
    planMd:
      '# Plan\n\nScope: implement /shorten and /:slug.\n\n## Capacity\nExpecting 10K rps read-heavy.\n\n## Components\nhandlers -> services -> repos.\n\n## Caching\nWe will add a read-through cache for slug lookups.',
    snapshots: [],
    hints: [],
    rubricVersion: 'v2.0',
    kind: 'traditional_design',
    seniority: 'mid',
    ...overrides,
  };
}

function makeRubricLoader(): RubricLoaderService {
  const cfg = new ConfigService({
    rubric: { dir: path.resolve(__dirname, '../../../../rubrics') },
  });
  return new RubricLoaderService(cfg);
}

function baseLlmResponse(extras: Partial<LlmResponse>): LlmResponse {
  return {
    text: '',
    modelUsed: 'claude-opus-4-7',
    tokensIn: 5,
    tokensOut: 100,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    ...extras,
  };
}

describe('PlanAgent.evaluateResults (Call A)', () => {
  it('forces the submit_plan_results tool and returns score + signalResults with empty evidence', async () => {
    // Real rubric load — see which signals are required.
    const loader = makeRubricLoader();
    const rubric = await loader.load('v2.0', 'plan', 'traditional_design', 'mid');
    const signalsPayload: Record<string, { result: SignalResult['result'] }> = {};
    for (const s of rubric.signals) {
      signalsPayload[s.id] = { result: 'cannot_evaluate' };
    }
    const { svc, calls } = makeLlm([
      baseLlmResponse({
        toolUse: { name: SUBMIT_PLAN_RESULTS_TOOL_NAME, input: { signals: signalsPayload } },
      }),
    ]);

    const agent = new PlanAgent(svc, loader);
    const result = await agent.evaluateResults(makeInput());

    expect(calls).toHaveBeenCalledTimes(1);
    const callOpts = calls.mock.calls[0][1];
    expect(callOpts.toolChoice).toEqual({
      type: 'tool',
      name: SUBMIT_PLAN_RESULTS_TOOL_NAME,
    });
    expect(callOpts.route).toBe('plan.evaluate.results');

    expect(typeof result.score).toBe('number');
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.score).toBeLessThanOrEqual(5);
    // signalResults populated for every rubric signal, each with evidence=''
    for (const s of rubric.signals) {
      expect(result.signalResults[s.id]).toBeDefined();
      expect(result.signalResults[s.id].evidence).toBe('');
    }
  });

  it('throws when the LLM omits a rubric signal id (strict validation)', async () => {
    const loader = makeRubricLoader();
    const rubric = await loader.load('v2.0', 'plan', 'traditional_design', 'mid');
    const partialPayload: Record<string, { result: SignalResult['result'] }> = {};
    // Skip the first signal on purpose
    for (const [i, s] of rubric.signals.entries()) {
      if (i === 0) continue;
      partialPayload[s.id] = { result: 'cannot_evaluate' };
    }
    const { svc } = makeLlm([
      baseLlmResponse({
        toolUse: { name: SUBMIT_PLAN_RESULTS_TOOL_NAME, input: { signals: partialPayload } },
      }),
    ]);

    const agent = new PlanAgent(svc, loader);
    await expect(agent.evaluateResults(makeInput())).rejects.toThrow(/missing signal/i);
  });
});

describe('PlanAgent.evaluateDetails (Call B)', () => {
  async function buildCommonInputs() {
    const loader = makeRubricLoader();
    const rubric = await loader.load('v2.0', 'plan', 'traditional_design', 'mid');
    // Pretend Call A returned: first half hit, second half cannot_evaluate.
    const priorSignalResults: Record<string, SignalResult> = {};
    const half = Math.floor(rubric.signals.length / 2);
    for (const [i, s] of rubric.signals.entries()) {
      priorSignalResults[s.id] = {
        result: i < half ? 'hit' : 'cannot_evaluate',
        evidence: '',
      };
    }
    return { loader, rubric, priorSignalResults };
  }

  it('forces the submit_plan_details tool, injects knownResults, and merges evidence into the prior results', async () => {
    const { loader, rubric, priorSignalResults } = await buildCommonInputs();

    // The "evidence" the LLM produces — phrases that ARE in the input planMd
    // so the evidence validator does not downgrade.
    const planMd = makeInput().planMd!;
    const evidenceQuote = planMd.slice(planMd.indexOf('cache for slug lookups'), planMd.indexOf('cache for slug lookups') + 30);
    const detailsSignals: Record<string, { reasoning: string; evidence: string }> = {};
    for (const s of rubric.signals) {
      detailsSignals[s.id] = { reasoning: 'r-' + s.id, evidence: evidenceQuote };
    }

    const { svc, calls } = makeLlm([
      baseLlmResponse({
        toolUse: {
          name: SUBMIT_PLAN_DETAILS_TOOL_NAME,
          input: {
            signals: detailsSignals,
            feedback: 'traditional_design: shows capacity + caching basics, weak on data model.',
            top_actions: ['sketch the slug->target table'],
            gap_topics: [],
          },
        },
      }),
    ]);

    const agent = new PlanAgent(svc, loader);
    const details = await agent.evaluateDetails(makeInput(), priorSignalResults);

    expect(calls).toHaveBeenCalledTimes(1);
    const callOpts = calls.mock.calls[0][1];
    expect(callOpts.toolChoice).toEqual({
      type: 'tool',
      name: SUBMIT_PLAN_DETAILS_TOOL_NAME,
    });
    expect(callOpts.route).toBe('plan.evaluate.details');

    // Verdicts are PRESERVED from priorSignalResults (Call B cannot revise).
    for (const s of rubric.signals) {
      expect(details.signalResults[s.id].result).toBe(priorSignalResults[s.id].result);
      // Evidence + reasoning now populated.
      expect(details.signalResults[s.id].evidence).toContain('cache');
      expect(details.signalResults[s.id].reasoning).toBe('r-' + s.id);
    }

    expect(details.feedbackText).toMatch(/traditional_design/);
    expect(details.topActionableItems).toEqual(['sketch the slug->target table']);

    // The prompt sent to the LLM should contain the verdict-only block.
    const userMessage = calls.mock.calls[0][0][0].content as string;
    expect(userMessage).toMatch(/Known per-signal verdicts/);
  });

  it('flags downgraded signals when evidence is not grounded in plan.md', async () => {
    const { loader, rubric, priorSignalResults } = await buildCommonInputs();

    // Evidence that is NOT in the input planMd — validator should downgrade.
    const detailsSignals: Record<string, { reasoning: string; evidence: string }> = {};
    for (const s of rubric.signals) {
      detailsSignals[s.id] = {
        reasoning: 'r',
        evidence: 'this exact phrase is not in plan.md whatsoever and is long enough to fail grounding heuristics',
      };
    }
    const { svc } = makeLlm([
      baseLlmResponse({
        toolUse: {
          name: SUBMIT_PLAN_DETAILS_TOOL_NAME,
          input: {
            signals: detailsSignals,
            feedback: 'fb',
            top_actions: [],
            gap_topics: [],
          },
        },
      }),
    ]);

    const agent = new PlanAgent(svc, loader);
    const details = await agent.evaluateDetails(makeInput(), priorSignalResults);

    // At least one of the "hit" signals from Call A should have been
    // downgraded since the evidence does not appear in plan.md.
    expect(details.downgradedSignalIds.length).toBeGreaterThan(0);
  });
});
