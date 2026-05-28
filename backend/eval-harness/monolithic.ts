// Monolithic single-call comparator. Reconstructs the pre-split LLM
// shape — one call that returns signals (with reasoning + result +
// evidence each), feedback, top_actions, and gap_topics — so the
// harness can A/B the new two-call split against the old behavior on
// the same fixtures.
//
// Lives in eval-harness/ on purpose: production code only emits
// 'results' (Call A) or 'details' (Call B); the monolithic shape is
// strictly for regression-checking.

import { ChatRole } from '../src/modules/llm/constants';
import { LlmService } from '../src/modules/llm/services/llm.service';
import { RubricLoaderService } from '../src/modules/evaluations/services/rubric-loader.service';
import { buildPlanPrompt } from '../src/modules/evaluations/prompts/plan-prompt';
import {
  PhaseEvalInput,
  PhaseEvaluationResult,
  SignalResult,
} from '../src/modules/evaluations/types/evaluation.types';
import {
  GAP_TOPIC_SUB_SCHEMA,
  RESULT_ENUM,
} from '../src/modules/evaluations/prompts/_shared-schema-atoms';
import { ToolDefinition } from '../src/modules/llm/types/llm.types';
import { Rubric } from '../src/modules/evaluations/types/rubric.types';
import { truncatePlanMd } from '../src/modules/evaluations/helpers/truncate-plan-md';
import {
  AGENTS_CONFIG,
  planMdCapFor,
} from '../src/config/llm-tunables.config';
import { validateEvidence } from '../src/modules/evaluations/validators/evidence-validator';
import { computeScore } from '../src/modules/evaluations/services/score-computer';
import { EvaluationParseError } from '../src/modules/evaluations/validators/eval-output.shared';

export const SUBMIT_MONOLITHIC_TOOL_NAME = 'submit_plan_evaluation_monolithic';

const SIGNAL_SUB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reasoning', 'result', 'evidence'],
  properties: {
    reasoning: { type: 'string', maxLength: 400 },
    result: { type: 'string', enum: RESULT_ENUM },
    evidence: { type: 'string', maxLength: 150 },
  },
} as const;

function buildMonolithicTool(rubric: Rubric): ToolDefinition {
  const signalIds = rubric.signals.map((s) => s.id);
  const signalProperties: Record<string, unknown> = {};
  for (const id of signalIds) {
    signalProperties[id] = { $ref: '#/$defs/signal' };
  }
  return {
    name: SUBMIT_MONOLITHIC_TOOL_NAME,
    description:
      'Submit a single-call structured evaluation (monolithic shape — eval-harness compare mode).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['signals', 'feedback', 'top_actions', 'gap_topics'],
      $defs: {
        signal: SIGNAL_SUB_SCHEMA,
        gap_topic: GAP_TOPIC_SUB_SCHEMA,
      },
      properties: {
        signals: {
          type: 'object',
          additionalProperties: false,
          required: signalIds,
          properties: signalProperties,
        },
        feedback: { type: 'string', maxLength: 3000 },
        top_actions: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', maxLength: 200 },
        },
        gap_topics: {
          type: 'array',
          maxItems: 5,
          items: { $ref: '#/$defs/gap_topic' },
        },
      },
    },
  };
}

interface MonolithicArgs {
  signals: Record<string, { reasoning: string; result: string; evidence: string }>;
  feedback: string;
  top_actions: string[];
  gap_topics: Array<{ name: string; coverage: string; why_expected: string }>;
}

export async function runPlanMonolithic(
  llm: LlmService,
  rubricLoader: RubricLoaderService,
  input: PhaseEvalInput,
): Promise<PhaseEvaluationResult> {
  const rubric = await rubricLoader.load(
    input.rubricVersion,
    'plan',
    input.kind ?? undefined,
    input.seniority ?? undefined,
  );
  const useTools = llm.supportsToolUse();
  const tool = useTools ? buildMonolithicTool(rubric) : null;

  const intendedModel = input.model ?? AGENTS_CONFIG.planAgent.defaultModel;
  const truncated = truncatePlanMd(
    input.planMd,
    planMdCapFor(intendedModel, 'PLAN_MD_TRUNCATION_CAP'),
  );
  const inputForPrompt: PhaseEvalInput = { ...input, planMd: truncated.text };

  const { systemBlocks, userMessage } = buildPlanPrompt(rubric, inputForPrompt, {
    useTools,
    callKind: 'monolithic',
  });

  const llmStart = performance.now();
  const response = await llm.call(
    [{ role: ChatRole.User, content: userMessage }],
    {
      system: systemBlocks,
      maxTokens: AGENTS_CONFIG.planAgent.maxTokens,
      temperature: 0,
      ...(tool
        ? {
            tools: [tool],
            toolChoice: { type: 'tool', name: SUBMIT_MONOLITHIC_TOOL_NAME },
          }
        : {}),
      model: intendedModel,
      userId: input.userId,
      route: 'plan.evaluate.monolithic',
    },
  );
  const latencyMs = Math.round(performance.now() - llmStart);

  const expectedSignalIds = new Set(rubric.signals.map((s) => s.id));
  const args: MonolithicArgs =
    response.toolUse && response.toolUse.name === SUBMIT_MONOLITHIC_TOOL_NAME
      ? (response.toolUse.input as MonolithicArgs)
      : (extractJsonObject(response.text) as MonolithicArgs);

  const signalResults: Record<string, SignalResult> = {};
  for (const [id, raw] of Object.entries(args.signals)) {
    if (!expectedSignalIds.has(id)) {
      throw new EvaluationParseError(
        `monolithic: unknown signal id "${id}" not in rubric`,
        JSON.stringify(args).slice(0, 500),
      );
    }
    if (!(RESULT_ENUM as readonly string[]).includes(raw.result)) {
      throw new EvaluationParseError(
        `monolithic: signal "${id}".result must be one of ${RESULT_ENUM.join('|')}`,
        JSON.stringify(args).slice(0, 500),
      );
    }
    signalResults[id] = {
      result: raw.result as SignalResult['result'],
      evidence: raw.evidence,
      reasoning: raw.reasoning,
    };
  }
  // Lenient: claude_cli (no tool-schema enforcement) sometimes drops a
  // signal from its JSON output. Treat the missing signal as
  // cannot_evaluate so the A/B comparison can still proceed —
  // crashing the whole sweep over one missing key would discard work
  // from every other fixture in the run.
  const missing: string[] = [];
  for (const id of expectedSignalIds) {
    if (!(id in signalResults)) {
      missing.push(id);
      signalResults[id] = {
        result: 'cannot_evaluate',
        evidence: '[monolithic compare: signal omitted by LLM — defaulted to cannot_evaluate]',
      };
    }
  }
  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `   [monolithic] LLM omitted ${missing.length} signal(s); defaulted to cannot_evaluate: ${missing.join(', ')}`,
    );
  }

  // Same post-LLM pipeline as the original PlanAgent.evaluate: evidence
  // validator may downgrade, then deterministic score.
  const validated = validateEvidence(signalResults, truncated.text, input.hints);
  const score = computeScore(rubric, validated.signals).score;

  return {
    phase: 'plan',
    score,
    signalResults: validated.signals,
    feedbackText: args.feedback,
    topActionableItems: args.top_actions,
    gapTopics: (args.gap_topics ?? []).map((g) => ({
      name: g.name,
      coverage: g.coverage as 'missed' | 'lightly_touched',
      whyExpected: g.why_expected,
    })),
    audit: {
      prompt: '(monolithic compare mode — prompt suppressed in harness output)',
      rawResponse:
        response.toolUse && response.toolUse.name === SUBMIT_MONOLITHIC_TOOL_NAME
          ? JSON.stringify(response.toolUse.input, null, 2)
          : response.text,
      modelUsed: response.modelUsed,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      cacheReadTokens: response.cacheReadTokens,
      cacheCreationTokens: response.cacheCreationTokens,
      latencyMs,
    },
  };
}

function extractJsonObject(rawText: string): unknown {
  const stripped = rawText
    .trim()
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    if (start === -1) {
      throw new EvaluationParseError(
        'monolithic: LLM did not return any JSON object',
        rawText,
      );
    }
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(stripped.slice(start, i + 1));
      }
    }
    throw new EvaluationParseError(
      'monolithic: LLM JSON object never closed',
      rawText,
    );
  }
}
