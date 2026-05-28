import { Injectable, Logger } from '@nestjs/common';
import {
  PhaseEvalInput,
  PlanDetailsPayload,
  PlanResultsPayload,
  SignalResult,
} from '../types/evaluation.types';
import { ChatRole } from '../../llm/constants';
import { LlmService } from '../../llm/services/llm.service';
import { RubricLoaderService } from '../services/rubric-loader.service';
import { buildPlanPrompt, PlanCallKind } from '../prompts/plan-prompt';
import {
  buildPlanResultsTool,
  SUBMIT_PLAN_RESULTS_TOOL_NAME,
} from '../prompts/plan-results-tool-schema';
import {
  buildPlanDetailsTool,
  SUBMIT_PLAN_DETAILS_TOOL_NAME,
} from '../prompts/plan-details-tool-schema';
import {
  validatePlanResultsArgs,
  ParsedPlanResults,
} from '../validators/validate-plan-results-args';
import {
  validatePlanDetailsArgs,
  ParsedPlanDetails,
} from '../validators/validate-plan-details-args';
import { EvaluationParseError } from '../validators/eval-output.shared';
import { validateEvidence } from '../validators/evidence-validator';
import { computeScore } from '../services/score-computer';
import { truncatePlanMd } from '../helpers/truncate-plan-md';
import {
  AGENTS_CONFIG,
  inputTokenWarnThresholdFor,
  planMdCapFor,
} from '../../../config/llm-tunables.config';

// PlanAgent owns the two-call plan eval. Call A (evaluateResults)
// emits per-signal verdicts only — the deterministic score-computer
// reads those alone, so the orchestrator can persist a row and
// return to the HTTP caller in 5-15s. Call B (evaluateDetails) runs
// in the background, grounding on Call A's verdicts so the two are
// coherent, and patches the row with evidence + feedback + gaps.
//
// PlanAgent does NOT extend BasePhaseAgent: the abstract evaluate()
// contract assumed a single-call pipeline that's no longer true for
// plan. BuildAgent still uses the legacy single-call shape.
@Injectable()
export class PlanAgent {
  private readonly logger = new Logger(PlanAgent.name);

  constructor(
    private readonly llm: LlmService,
    private readonly rubricLoader: RubricLoaderService,
  ) {}

  // Call A: small, fast, results-only. Output is ~50-200 tokens.
  async evaluateResults(input: PhaseEvalInput): Promise<PlanResultsPayload> {
    const rubric = await this.rubricLoader.load(
      input.rubricVersion,
      'plan',
      input.kind ?? undefined,
      input.seniority ?? undefined,
    );
    const useTools = this.llm.supportsToolUse();
    const tool = useTools ? buildPlanResultsTool(rubric) : null;

    const intendedModel = input.model ?? AGENTS_CONFIG.planAgent.defaultModel;
    const truncated = truncatePlanMd(
      input.planMd,
      planMdCapFor(intendedModel, 'PLAN_MD_TRUNCATION_CAP'),
    );
    if (truncated.droppedChars > 0) {
      this.logger.warn(
        `[Call A] plan.md truncated: ${truncated.droppedChars.toLocaleString()} chars omitted ` +
          `(kept ${truncated.text.length.toLocaleString()} of ${truncated.originalLength.toLocaleString()})`,
      );
    }
    const inputForPrompt: PhaseEvalInput = { ...input, planMd: truncated.text };

    const { systemBlocks, userMessage, preprocessing } = buildPlanPrompt(rubric, inputForPrompt, {
      useTools,
      callKind: 'results',
    });

    this.logger.log(
      `[Call A] Evaluating session ${input.session.id} (planMd=${truncated.text.length} chars, ` +
        `${input.snapshots.length} snapshots, ${input.hints.length} hints, useTools=${useTools})`,
    );
    if (preprocessing.removedParagraphs > 0) {
      this.logger.log(
        `[Call A] Stripped ${preprocessing.removedParagraphs} duplicate paragraph(s) ` +
          `from plan.md (saved ${preprocessing.removedChars} chars)`,
      );
    }

    const llmStart = performance.now();
    const llm = await this.llm.call(
      [{ role: ChatRole.User, content: userMessage }],
      {
        system: systemBlocks,
        maxTokens: AGENTS_CONFIG.planAgent.maxTokens,
        temperature: 0,
        ...(tool
          ? {
              tools: [tool],
              toolChoice: { type: 'tool', name: SUBMIT_PLAN_RESULTS_TOOL_NAME },
            }
          : {}),
        model: intendedModel,
        userId: input.userId,
        route: 'plan.evaluate.results',
      },
    );
    const latencyMs = Math.round(performance.now() - llmStart);

    this.logger.log(
      `[Call A] LLM responded in ${latencyMs}ms (model=${llm.modelUsed}, in=${llm.tokensIn}, ` +
        `out=${llm.tokensOut}, cacheWrite=${llm.cacheCreationTokens}, ` +
        `cacheRead=${llm.cacheReadTokens})`,
    );

    this.warnIfOverInputBudget(llm);

    const expectedSignalIds = new Set(rubric.signals.map((s) => s.id));
    let parsed: ParsedPlanResults;
    let auditResponse: string;
    if (llm.toolUse && llm.toolUse.name === SUBMIT_PLAN_RESULTS_TOOL_NAME) {
      parsed = validatePlanResultsArgs(llm.toolUse.input, expectedSignalIds);
      auditResponse = JSON.stringify(llm.toolUse.input, null, 2);
    } else {
      parsed = validatePlanResultsArgs(extractJsonObject(llm.text), expectedSignalIds);
      auditResponse = llm.text;
    }

    const computed = computeScore(rubric, parsed.signals);

    return {
      score: computed.score,
      signalResults: parsed.signals,
      audit: {
        prompt: renderAuditPrompt(systemBlocks, userMessage, tool ? tool.name : null, tool),
        rawResponse: auditResponse,
        modelUsed: llm.modelUsed,
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        cacheReadTokens: llm.cacheReadTokens,
        cacheCreationTokens: llm.cacheCreationTokens,
        latencyMs,
        llmScore: computed.score,
      },
    };
  }

  // Call B: larger, slower. Takes the per-signal verdicts persisted
  // by Call A as ground truth (pinned in the user prompt), collects
  // evidence + feedback + top_actions + gap_topics, then runs the
  // evidence validator (which may downgrade unverifiable hits/partials)
  // and re-computes the score. The orchestrator just patches the row
  // with whatever this returns.
  async evaluateDetails(
    input: PhaseEvalInput,
    priorSignalResults: Record<string, SignalResult>,
  ): Promise<PlanDetailsPayload> {
    const rubric = await this.rubricLoader.load(
      input.rubricVersion,
      'plan',
      input.kind ?? undefined,
      input.seniority ?? undefined,
    );
    const useTools = this.llm.supportsToolUse();
    const tool = useTools ? buildPlanDetailsTool(rubric) : null;

    const intendedModel = input.model ?? AGENTS_CONFIG.planAgent.defaultModel;
    const truncated = truncatePlanMd(
      input.planMd,
      planMdCapFor(intendedModel, 'PLAN_MD_TRUNCATION_CAP'),
    );
    const inputForPrompt: PhaseEvalInput = { ...input, planMd: truncated.text };

    // Verdict-only map for prompt grounding. The LLM doesn't need the
    // priorSignalResults' (empty) evidence field — it's about to fill
    // that in. Just pin the verdicts.
    const knownVerdicts: Record<string, SignalResult['result']> = {};
    for (const [id, r] of Object.entries(priorSignalResults)) {
      knownVerdicts[id] = r.result;
    }

    const { systemBlocks, userMessage } = buildPlanPrompt(rubric, inputForPrompt, {
      useTools,
      callKind: 'details',
      knownResults: knownVerdicts,
    });

    this.logger.log(
      `[Call B] Generating details for session ${input.session.id} ` +
        `(${Object.keys(knownVerdicts).length} verdicts pinned, useTools=${useTools})`,
    );

    const llmStart = performance.now();
    const llm = await this.llm.call(
      [{ role: ChatRole.User, content: userMessage }],
      {
        system: systemBlocks,
        maxTokens: AGENTS_CONFIG.planAgent.maxTokens,
        temperature: 0,
        ...(tool
          ? {
              tools: [tool],
              toolChoice: { type: 'tool', name: SUBMIT_PLAN_DETAILS_TOOL_NAME },
            }
          : {}),
        model: intendedModel,
        userId: input.userId,
        route: 'plan.evaluate.details',
      },
    );
    const latencyMs = Math.round(performance.now() - llmStart);

    this.logger.log(
      `[Call B] LLM responded in ${latencyMs}ms (model=${llm.modelUsed}, in=${llm.tokensIn}, ` +
        `out=${llm.tokensOut}, cacheWrite=${llm.cacheCreationTokens}, ` +
        `cacheRead=${llm.cacheReadTokens})`,
    );

    this.warnIfOverInputBudget(llm);

    const expectedSignalIds = new Set(rubric.signals.map((s) => s.id));
    let parsed: ParsedPlanDetails;
    let auditResponse: string;
    if (llm.toolUse && llm.toolUse.name === SUBMIT_PLAN_DETAILS_TOOL_NAME) {
      parsed = validatePlanDetailsArgs(llm.toolUse.input, expectedSignalIds);
      auditResponse = JSON.stringify(llm.toolUse.input, null, 2);
    } else {
      parsed = validatePlanDetailsArgs(extractJsonObject(llm.text), expectedSignalIds);
      auditResponse = llm.text;
    }
    if (parsed.droppedTopicNames && parsed.droppedTopicNames.length > 0) {
      this.logger.warn(
        `[Call B] Dropped ${parsed.droppedTopicNames.length} gap_topic name(s) outside ` +
          `the canonical vocabulary: ${parsed.droppedTopicNames.join(', ')}`,
      );
    }

    // Merge Call B's reasoning + evidence into Call A's verdicts. The
    // verdicts are authoritative (per the prompt), so we never let
    // Call B's evidence imply a different result.
    const merged: Record<string, SignalResult> = {};
    for (const [id, prior] of Object.entries(priorSignalResults)) {
      const ev = parsed.evidenceBySignal[id];
      merged[id] = {
        result: prior.result,
        evidence: ev?.evidence ?? '',
        ...(ev?.reasoning ? { reasoning: ev.reasoning } : {}),
      };
    }

    // Evidence validator may downgrade hit → partial or partial → miss
    // when the LLM-quoted evidence isn't grounded in plan.md / hints.
    const validated = validateEvidence(merged, truncated.text, input.hints);
    if (validated.downgraded.length > 0) {
      this.logger.warn(
        `[Call B] Evidence validator downgraded ${validated.downgraded.length} signal(s) ` +
          `with unverifiable quotes: ${validated.downgraded.join(', ')}`,
      );
    }

    const rescored = computeScore(rubric, validated.signals);

    return {
      signalResults: validated.signals,
      score: rescored.score,
      downgradedSignalIds: validated.downgraded,
      feedbackText: parsed.feedback,
      topActionableItems: parsed.topActions,
      gapTopics: parsed.gapTopics,
      audit: {
        prompt: renderAuditPrompt(systemBlocks, userMessage, tool ? tool.name : null, tool),
        rawResponse: auditResponse,
        modelUsed: llm.modelUsed,
        tokensIn: llm.tokensIn,
        tokensOut: llm.tokensOut,
        cacheReadTokens: llm.cacheReadTokens,
        cacheCreationTokens: llm.cacheCreationTokens,
        latencyMs,
        llmScore: rescored.score,
      },
    };
  }

  private warnIfOverInputBudget(llm: { modelUsed: string; tokensIn: number; cacheCreationTokens: number; cacheReadTokens: number }): void {
    const totalInputTokens = llm.tokensIn + llm.cacheCreationTokens + llm.cacheReadTokens;
    const warnThreshold = inputTokenWarnThresholdFor(
      llm.modelUsed,
      'PLAN_AGENT_INPUT_TOKEN_WARN',
    );
    if (totalInputTokens > warnThreshold) {
      this.logger.warn(
        `Input tokens ${totalInputTokens.toLocaleString()} exceed ` +
          `${warnThreshold.toLocaleString()} threshold for model ${llm.modelUsed} — ` +
          `consider lowering PLAN_MD_TRUNCATION_CAP or selecting a larger-context model.`,
      );
    }
  }
}

function renderAuditPrompt(
  systemBlocks: Array<{ text: string }>,
  userMessage: string,
  toolName: string | null,
  tool: { inputSchema: unknown } | null,
): string {
  const sys = systemBlocks.map((b) => b.text).join('\n\n');
  const toolSuffix =
    tool && toolName ? `\n\n[tool: ${toolName}]\n${JSON.stringify(tool.inputSchema, null, 2)}` : '';
  return `${sys}\n\n---\n\n${userMessage}${toolSuffix}`;
}

// Minimal JSON-text extractor for the non-tool-use fallback (claude_cli).
// Mirrors the strip-fences-then-find-balanced-object behavior of
// parseEvalOutput but returns the parsed object so the new plan
// validators can consume it the same as tool args.
function extractJsonObject(rawText: string): unknown {
  const stripped = rawText.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```$/, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // Find first balanced {...}
    const start = stripped.indexOf('{');
    if (start === -1) {
      throw new EvaluationParseError('LLM did not return any JSON object', rawText);
    }
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < stripped.length; i++) {
      const ch = stripped[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(stripped.slice(start, i + 1));
          } catch (err) {
            throw new EvaluationParseError(
              `LLM returned malformed JSON: ${(err as Error).message}`,
              rawText,
            );
          }
        }
      }
    }
    throw new EvaluationParseError(
      'LLM JSON object never closed (unbalanced braces)',
      rawText,
    );
  }
}
