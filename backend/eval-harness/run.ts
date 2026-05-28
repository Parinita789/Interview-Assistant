/* eslint-disable no-console */
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PlanAgent } from '../src/modules/evaluations/agents/plan.agent';
import { BuildAgent } from '../src/modules/evaluations/agents/build.agent';
import { RubricLoaderService } from '../src/modules/evaluations/services/rubric-loader.service';
import {
  BuildContext,
  PhaseEvalInput,
  PhaseEvaluationResult,
} from '../src/modules/evaluations/types/evaluation.types';
import { gapSignalIds } from '../src/modules/evaluations/helpers/gap-signals';
import { reconstructBuildTree } from '../src/modules/evaluations/helpers/reconstruct-build-tree';
import { selectBuildContext } from '../src/modules/evaluations/helpers/select-build-context';
import { SignalMentorAgent } from '../src/modules/signal-mentor/agents/signal-mentor.agent';
import { GapSignalContext, SignalMentorInput } from '../src/modules/signal-mentor/types/signal-mentor.types';
import { MentorAgent } from '../src/modules/mentor/agents/mentor.agent';
import { MentorInput } from '../src/modules/mentor/types/mentor.types';
import { LLM_ENV } from '../src/modules/llm/constants';
import { Phase } from '../src/modules/phase-tagger/types/phase.types';
import { loadFixtures, validateAgainstRubric } from './fixture-loader';
import { compareResult } from './comparator';
import { printConsoleReport, writeJsonReport } from './reporter';
import {
  Fixture,
  FixturePhase,
  MonolithicDiff,
  PlanCallBreakdown,
  SuiteReport,
} from './types';
import { runPlanMonolithic } from './monolithic';
import { LlmService } from '../src/modules/llm/services/llm.service';

interface CliArgs {
  filter?: string;
  out?: string;
  withSignalMentor?: boolean;
  withMentor?: boolean;
  phase?: FixturePhase; // when set, only run fixtures matching this phase
  compareMonolithic?: boolean; // run plan fixtures through monolithic too + diff
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--filter=')) out.filter = arg.slice('--filter='.length);
    else if (arg.startsWith('--out=')) out.out = arg.slice('--out='.length);
    else if (arg === '--with-signal-mentor') out.withSignalMentor = true;
    else if (arg === '--with-mentor') out.withMentor = true;
    else if (arg === '--compare-monolithic') out.compareMonolithic = true;
    else if (arg.startsWith('--phase=')) {
      const v = arg.slice('--phase='.length);
      if (v !== 'plan' && v !== 'build') {
        console.error(`--phase must be plan or build (got "${v}")`);
        process.exit(2);
      }
      out.phase = v;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(2);
    }
  }
  return out;
}

function printHelp(): void {
  console.log(`Usage: ts-node eval-harness/run.ts [--filter=<substring>] [--phase=plan|build] [--out=<path.json>]

Runs the eval harness against the configured LLM provider. Provider
selection follows backend/.env (LLM_PROVIDER, OLLAMA_BASE_URL, ...).
Each fixture's own \`phase:\` field determines which agent runs (PlanAgent
or BuildAgent). Use --phase to run only fixtures of one phase; without
it, all matching fixtures run.

  --filter              Only run fixtures whose directory name contains this substring.
  --phase               Restrict to fixtures with this phase (plan or build).
  --out                 Write a JSON report to this path (in addition to console output).
  --with-signal-mentor  Also exercise the per-signal mentor agent against
                        each fixture's gap signals; print coverage per fixture.
                        Works for both plan and build fixtures.
  --with-mentor         Also exercise the deep-dive mentor agent. Prints
                        section count, word count, and cross-phase mention
                        per fixture as a cheap shape check.
  --compare-monolithic  For plan fixtures, also run a recreated single-call
                        monolithic shape against the same inputs and diff
                        the verdicts + score. Catches regressions where the
                        split changed what the model would have decided.
                        Roughly doubles per-fixture cost and latency.

Exit code: 0 if every (non-warnOnly) fixture passed, 1 otherwise.`);
}

// Harness omits userId so LlmService.call's cost-cap path skips
// accounting (it gates on `userId && route`). The cap exists for
// real user sessions; harness runs are dev/regression tooling and
// shouldn't ever spend against a real user's daily budget — and
// spoofing a fake UUID would violate the LlmSpend FK to users.

function buildInput(fx: Fixture): PhaseEvalInput {
  const now = new Date();
  const planSize = fx.planMd?.length ?? 0;
  const input: PhaseEvalInput = {
    session: {
      id: `harness-${fx.name}`,
      prompt: fx.question,
      startedAt: now,
      endedAt: now,
    },
    planMd: fx.planMd,
    snapshots: [{ takenAt: now, elapsedMinutes: 30, planMdSize: planSize }],
    hints:
      fx.hints?.map((h) => ({
        occurredAt: new Date(h.occurredAt),
        elapsedMinutes: h.elapsedMinutes,
        prompt: h.prompt,
        response: h.response,
      })) ?? [],
    rubricVersion: fx.rubricVersion,
    kind: fx.kind,
    seniority: fx.seniority ?? 'senior',
  };
  if (fx.phase === 'build') {
    input.buildContext = makeBuildContext(fx);
  }
  return input;
}

// Mirrors OrchestratorService.loadBuildContext: walk events into a tree,
// pick top-N high-churn snippets, slice recent K AI turns. Keeps the
// harness exercising the same code path the live pipeline uses.
function makeBuildContext(fx: Fixture): BuildContext {
  const events = (fx.events ?? []).map((e) => ({
    filePath: e.filePath,
    action: e.action,
    content: e.content,
    contentDiff: e.contentDiff,
    occurredAt: new Date(e.occurredAt),
  }));
  const aiTurns = (fx.aiTurns ?? []).map((t) => ({
    externalSessionId: t.externalSessionId,
    turnIndex: t.turnIndex,
    role: t.role,
    text: t.text,
    toolName: t.toolName,
    toolInputSummary: t.toolInputSummary,
    toolResultSummary: t.toolResultSummary,
    occurredAt: new Date(t.occurredAt),
  }));
  const reconstructed = reconstructBuildTree(events);
  const slim = events.map((e) => ({
    filePath: e.filePath,
    action: e.action,
    contentDiff: e.contentDiff,
    occurredAt: e.occurredAt,
  }));
  const { keyFileSnippets, aiTurnsForPrompt } = selectBuildContext({
    events: slim,
    aiTurns,
    contents: reconstructed.contents,
  });
  const allFileContents = [...reconstructed.contents.entries()].map(
    ([path, content]) => ({ path, content }),
  );
  return {
    startedAt: fx.buildStartedAt ? new Date(fx.buildStartedAt) : null,
    endedAt: fx.buildEndedAt ? new Date(fx.buildEndedAt) : null,
    events: slim,
    finalTree: reconstructed.tree,
    keyFileSnippets,
    allFileContents,
    aiTurns: aiTurnsForPrompt,
  };
}

function resolveProviderName(config: ConfigService): string {
  if (config.get<string>(LLM_ENV.LLM_PROVIDER) === 'claude_cli') return 'claude_cli';
  if (config.get<string>(LLM_ENV.OLLAMA_BASE_URL)) return 'ollama';
  return 'anthropic';
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const fixturesDir = path.join(__dirname, 'fixtures');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });
  try {
    const planAgent = app.get(PlanAgent);
    const buildAgent = app.get(BuildAgent);
    const rubricLoader = app.get(RubricLoaderService);
    const signalMentorAgent = args.withSignalMentor ? app.get(SignalMentorAgent) : null;
    const mentorAgent = args.withMentor ? app.get(MentorAgent) : null;
    const llmService = args.compareMonolithic ? app.get(LlmService) : null;
    const config = app.get(ConfigService);

    let fixtures = loadFixtures(fixturesDir, args.filter);
    if (args.phase) {
      fixtures = fixtures.filter((fx) => fx.phase === args.phase);
      if (fixtures.length === 0) {
        throw new Error(`No fixtures matched --phase=${args.phase} (filter=${args.filter ?? '(none)'})`);
      }
    }

    // Validate expected-signal ids against each fixture's resolved rubric
    // before any LLM call so typos fail fast. Build fixtures resolve the
    // build rubric; plan fixtures resolve the plan rubric.
    const rubricCache = new Map<string, ReadonlySet<string>>();
    for (const fx of fixtures) {
      const seniority = fx.seniority ?? 'senior';
      const cacheKey = `${fx.rubricVersion}/${fx.phase}/${fx.kind ?? 'default'}/${seniority}`;
      let ids = rubricCache.get(cacheKey);
      if (!ids) {
        const rubric = await rubricLoader.load(
          fx.rubricVersion,
          fx.phase as Phase,
          fx.kind,
          seniority,
        );
        ids = new Set(rubric.signals.map((s) => s.id));
        rubricCache.set(cacheKey, ids);
      }
      validateAgainstRubric(fx, ids);
    }

    console.log(
      `Running ${fixtures.length} fixture(s) on provider=${resolveProviderName(config)}…\n`,
    );

    const t0 = Date.now();
    const results = [];
    let modelUsed = '';
    for (const fx of fixtures) {
      const input = buildInput(fx);
      const start = Date.now();
      let out: PhaseEvaluationResult;
      let planBreakdown: PlanCallBreakdown | undefined;
      if (fx.phase === 'build') {
        out = await buildAgent.evaluate(input);
      } else {
        const composed = await runPlanTwoCall(planAgent, input);
        out = composed.result;
        planBreakdown = composed.breakdown;
      }
      const elapsed = Date.now() - start;
      modelUsed = out.audit.modelUsed;

      let monolithicDiff: MonolithicDiff | undefined;
      if (args.compareMonolithic && llmService && fx.phase === 'plan') {
        try {
          const mono = await runPlanMonolithic(llmService, rubricLoader, input);
          monolithicDiff = diffSplitVsMonolithic(out, mono);
        } catch (err) {
          // Per-fixture monolithic failures (LLM timeout, parse error)
          // are non-fatal: the split-only result is still useful.
          // Log + move on instead of crashing the whole sweep.
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`   [monolithic] ${fx.name}: comparison failed — ${msg}`);
        }
      }

      const fr = compareResult(fx, out, elapsed, out.audit.modelUsed, planBreakdown);
      if (monolithicDiff) fr.monolithicDiff = monolithicDiff;
      results.push(fr);

      if (signalMentorAgent) {
        const seniority = fx.seniority ?? 'senior';
        const rubric = await rubricLoader.load(
          fx.rubricVersion,
          fx.phase as Phase,
          fx.kind,
          seniority,
        );
        const ids = gapSignalIds(rubric, out.signalResults);
        if (ids.length === 0) {
          console.log(`  signal-mentor (${fx.name}): no gap signals — skipping LLM call.`);
        } else {
          const sigById = new Map(rubric.signals.map((s) => [s.id, s]));
          const gaps: GapSignalContext[] = ids
            .map((id) => {
              const sig = sigById.get(id);
              const result = out.signalResults[id];
              if (!sig || !result) return null;
              return { signal: sig, result };
            })
            .filter((g): g is GapSignalContext => g !== null);

          const smInput: SignalMentorInput = {
            question: fx.question,
            planMd: fx.planMd,
            gaps,
            feedbackText: out.feedbackText,
            score: out.score,
            seniority: seniority === 'senior' ? 'senior' : seniority,
            phase: fx.phase as Phase,
            buildContext: input.buildContext,
            sessionId: `harness-${fx.name}`,
            evaluationId: `harness-${fx.name}-eval`,
          };
          const smOut = await signalMentorAgent.generate(smInput);
          const annotated = ids.filter(
            (id) => smOut.artifact.annotations[id] && smOut.artifact.annotations[id].trim(),
          );
          const expectedMisses = (fx.expectedSignals.miss ?? []).filter((id) => ids.includes(id));
          const expectedMissesAnnotated = expectedMisses.filter(
            (id) => smOut.artifact.annotations[id] && smOut.artifact.annotations[id].trim(),
          );
          const coverageOk =
            expectedMisses.length === 0 ||
            expectedMissesAnnotated.length === expectedMisses.length;
          console.log(
            `  signal-mentor (${fx.name}, ${fx.phase}): ${annotated.length}/${ids.length} gap signals annotated · ` +
              `expected-miss coverage ${expectedMissesAnnotated.length}/${expectedMisses.length} ` +
              `${coverageOk ? '✓' : '✗'}`,
          );
        }
      }

      if (mentorAgent) {
        const seniority = fx.seniority ?? 'senior';
        const mInput: MentorInput = {
          question: fx.question,
          planMd: fx.planMd,
          signalResults: out.signalResults,
          feedbackText: out.feedbackText,
          topActionableItems: out.topActionableItems,
          score: out.score,
          seniority,
          phase: fx.phase as Phase,
          buildContext: input.buildContext,
          sessionId: `harness-${fx.name}`,
          evaluationId: `harness-${fx.name}-eval`,
        };
        const mOut = await mentorAgent.generate(mInput);
        const md = mOut.artifact.content;
        // Cheap shape check: count `## Section` headers and total words.
        const sectionCount = (md.match(/^##\s+Section\s+\d+/gm) ?? []).length;
        const words = md.split(/\s+/).filter(Boolean).length;
        const hasCrossPhase = md.toLowerCase().includes(fx.phase === 'plan' ? 'build' : 'plan');
        console.log(
          `  mentor (${fx.name}, ${fx.phase}): ${sectionCount} section(s) · ${words} words · ` +
            `cross-phase mention ${hasCrossPhase ? '✓' : '✗'}`,
        );
      }
    }

    const report: SuiteReport = {
      results,
      totalElapsedMs: Date.now() - t0,
      provider: resolveProviderName(config),
      model: modelUsed,
      rubricVersion: fixtures[0].rubricVersion,
    };

    printConsoleReport(report);
    if (args.out) writeJsonReport(report, args.out);

    const failed = results.filter((r) => !r.pass).length;
    process.exitCode = failed === 0 ? 0 : 1;
  } finally {
    await app.close();
  }
}

// Compose the two PlanAgent calls into a single PhaseEvaluationResult
// for the comparator. Call A produces verdicts + score; Call B fills in
// evidence + feedback + top_actions + gap_topics and (via the evidence
// validator) may downgrade a signal, in which case the final score is
// Call B's recomputed value. The audit returned is Call B's — that's the
// load-bearing one for the harness report — but tokensIn/tokensOut sum
// across both calls so latency/cost comparisons against the old
// monolithic shape stay apples-to-apples.
async function runPlanTwoCall(
  planAgent: PlanAgent,
  input: PhaseEvalInput,
): Promise<{ result: PhaseEvaluationResult; breakdown: PlanCallBreakdown }> {
  const callA = await planAgent.evaluateResults(input);
  const callB = await planAgent.evaluateDetails(input, callA.signalResults);
  const result: PhaseEvaluationResult = {
    phase: 'plan',
    score: callB.score,
    signalResults: callB.signalResults,
    feedbackText: callB.feedbackText,
    topActionableItems: callB.topActionableItems,
    gapTopics: callB.gapTopics,
    audit: {
      ...callB.audit,
      tokensIn: callA.audit.tokensIn + callB.audit.tokensIn,
      tokensOut: callA.audit.tokensOut + callB.audit.tokensOut,
      cacheReadTokens: callA.audit.cacheReadTokens + callB.audit.cacheReadTokens,
      cacheCreationTokens:
        callA.audit.cacheCreationTokens + callB.audit.cacheCreationTokens,
      latencyMs: (callA.audit.latencyMs ?? 0) + (callB.audit.latencyMs ?? 0),
    },
  };
  const breakdown: PlanCallBreakdown = {
    callA: {
      latencyMs: callA.audit.latencyMs ?? 0,
      tokensIn: callA.audit.tokensIn,
      tokensOut: callA.audit.tokensOut,
    },
    callB: {
      latencyMs: callB.audit.latencyMs ?? 0,
      tokensIn: callB.audit.tokensIn,
      tokensOut: callB.audit.tokensOut,
    },
    downgradedSignalIds: callB.downgradedSignalIds,
  };
  return { result, breakdown };
}

function diffSplitVsMonolithic(
  split: PhaseEvaluationResult,
  mono: PhaseEvaluationResult,
): MonolithicDiff {
  const allIds = new Set<string>([
    ...Object.keys(split.signalResults),
    ...Object.keys(mono.signalResults),
  ]);
  const disagreements: MonolithicDiff['signalDisagreements'] = [];
  let agreementCount = 0;
  for (const id of allIds) {
    const a = split.signalResults[id]?.result;
    const b = mono.signalResults[id]?.result;
    if (a && b && a === b) {
      agreementCount += 1;
    } else if (a && b) {
      disagreements.push({ signalId: id, splitVerdict: a, monolithicVerdict: b });
    }
  }
  return {
    splitScore: split.score,
    monolithicScore: mono.score,
    scoreDelta: split.score - mono.score,
    signalDisagreements: disagreements,
    agreementCount,
    totalSignals: allIds.size,
    monolithicLatencyMs: mono.audit.latencyMs ?? 0,
    monolithicTokensIn: mono.audit.tokensIn,
    monolithicTokensOut: mono.audit.tokensOut,
  };
}

main().catch((err) => {
  console.error('eval-harness crashed:', err);
  process.exit(1);
});
