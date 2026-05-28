import { Rubric } from '../types/rubric.types';
import { SystemBlock } from '../../llm/types/llm.types';
import { PhaseEvalInput } from '../types/evaluation.types';
import { dedupePlanMd } from '../helpers/dedupe-plan-md';
import {
  BOUNDARY_NOTICE,
  USER_CONTENT_TAGS,
  wrapUserContent,
} from '../../../common/prompts/wrap-user-content';

export interface BuiltPrompt {
  systemBlocks: SystemBlock[];
  userMessage: string;
  preprocessing: { removedParagraphs: number; removedChars: number };
}

// 'monolithic' is a third option ONLY used by eval-harness's
// --compare-monolithic mode: it instructs the model to return the
// pre-split shape (per-signal reasoning + result + evidence, plus
// feedback + top_actions + gap_topics) in one call so the harness can
// A/B that output against the two-call split. Production code paths
// only ever pass 'results' (Call A) or 'details' (Call B).
export type PlanCallKind = 'results' | 'details' | 'monolithic';

export interface BuildPlanPromptOptions {
  useTools?: boolean;
  // Which half of the two-call split this prompt is for. 'results'
  // (Call A) collects only per-signal verdicts; 'details' (Call B)
  // grounds on those verdicts and collects evidence + feedback + gaps.
  callKind: PlanCallKind;
  // Required when callKind === 'details'. The verdicts committed by
  // Call A, injected into the user message so Call B does not revise
  // them. Keys are rubric signal ids; values are the verdict enum.
  knownResults?: Record<string, 'hit' | 'partial' | 'miss' | 'cannot_evaluate'>;
}

export function buildPlanPrompt(
  rubric: Rubric,
  input: PhaseEvalInput,
  opts: BuildPlanPromptOptions,
): BuiltPrompt {
  const deduped = dedupePlanMd(input.planMd);
  const inputForRender: PhaseEvalInput =
    deduped.removedParagraphs > 0 ? { ...input, planMd: deduped.text } : input;

  return {
    systemBlocks: [
      {
        text: renderRubricSystemPrompt(rubric, opts.useTools === true, opts.callKind),
        cacheable: true,
      },
      {
        text: `## Session question\n${wrapUserContent(input.session.prompt, USER_CONTENT_TAGS.sessionQuestion)}`,
        cacheable: true,
      },
    ],
    userMessage: renderUserPayload(inputForRender, opts.callKind, opts.knownResults),
    preprocessing: {
      removedParagraphs: deduped.removedParagraphs,
      removedChars: deduped.removedChars,
    },
  };
}

function renderRubricSystemPrompt(
  rubric: Rubric,
  useTools: boolean,
  callKind: PlanCallKind,
): string {
  const goodSignals = rubric.signals.filter((s) => s.polarity === 'good');
  const badSignals = rubric.signals.filter((s) => s.polarity === 'bad');

  const sectionsBlock = rubric.passBar.requiredSections
    .map((s) => `  - ${s.id} ("${s.name}") — must contain: ${s.mustContain.join(', ')}`)
    .join('\n');

  const goodSignalsBlock = goodSignals.map(formatSignal).join('\n\n');
  const badSignalsBlock = badSignals.map(formatSignal).join('\n\n');

  const pairs = goodSignals
    .filter((s) => s.pairedWith)
    .map((s) => `  - ${s.id} (good) ↔ ${s.pairedWith} (bad)`);
  const pairingBlock = pairs.length
    ? `## Pairing reference (do not double-count)
The following good↔bad signal pairs measure the same concept from
opposite sides. If the bad signal fires (HIT or PARTIAL), set its
paired good signal to MISS *only for reporting* — do NOT subtract its
weight separately. Count the deduction once, on whichever side
reflects the design's actual state.

${pairs.join('\n')}`
    : '';

  const anchorsBlock = Object.entries(rubric.scoring.anchors)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([score, desc]) => `  ${score}: ${desc}`)
    .join('\n');

  const calibrationBlock = rubric.judgeCalibration.map((c, i) => `${i + 1}. ${c}`).join('\n');

  const aiUsage = rubric.aiUsageForThisPhase;
  const aiUsageBlock = aiUsage
    ? `## AI usage policy for this phase
${aiUsage.description}
Good modes: ${aiUsage.goodModes.join('; ')}
Bad modes: ${aiUsage.badModes.join('; ')}`
    : '';

  const kindOpener = rubric.kind === 'agentic_build'
    ? `## How to read this rubric (agentic_build variant)
This question is a 1-hour buildable agentic exercise. The candidate is
expected to articulate a buildable contract — concrete build sequence,
validation plan, AI delegation strategy, named test seams. Score
against execution-readiness, not articulation depth alone.`
    : rubric.kind === 'agentic_design'
    ? `## How to read this rubric (agentic_design variant)
This is a design-only exercise about a system whose core is an
LLM/agent. Score articulation depth and agent-infra reasoning
(inference cost, latency, output validation, provider failover,
nondeterminism, observability, state). The candidate is not expected
to build anything in this session.`
    : rubric.kind === 'traditional_design'
    ? `## How to read this rubric (traditional_design variant)
This is a design-only exercise about a production-scale traditional
system (URL shortener, log pipeline, rate limiter, etc.). Score
articulation depth and scale-aware reasoning (capacity estimation,
bottlenecks, sharding, replication, consistency). The candidate is
not expected to build anything in this session.`
    : '';

  const seniorityOpener = rubric.seniority
    ? `## Calibrate to the candidate's seniority: ${rubric.seniority}
You are evaluating a ${rubric.seniority}-level engineer. Apply these
expectations when judging individual signals (HIT / PARTIAL / MISS):
  - junior: clarity of intent + a working approach are enough. Accept
    rough articulation as PARTIAL rather than MISS. Don't penalize a
    light treatment of capacity, bottlenecks, or consistency.
  - mid:    add specificity — named interfaces, concrete validation,
    explicit tradeoffs. Capacity / bottleneck reasoning is a bonus.
  - senior: full bar — capacity, bottlenecks, scale-aware data model.
    The current rubric anchors are calibrated here.
  - staff:  bar is reasoning depth, not just coverage. Tradeoffs must
    be defended; bottlenecks named with concrete mitigations; a plan
    that hits all signals at HIT but lacks senior-level reasoning
    earns PARTIAL on those signals, not HIT.
Open the \`feedback\` field by acknowledging the seniority, e.g.
"${rubric.seniority}-level evaluation: …".`
    : '';

  return `You are an evaluator for the ${rubric.phaseName} phase of a system-design practice session.

Read the artifacts the user will provide and return a structured JSON evaluation matching the schema at the bottom of this prompt. Be specific and cite evidence from the artifacts. Do not invent content that isn't in the artifacts.

${BOUNDARY_NOTICE}

${kindOpener}

${seniorityOpener}

### Feedback prose must align with the kind
For **traditional_design** and **agentic_design**, the candidate is
not building. Do not criticize the plan for "no build sequence",
"no validation plan", "missing load tests", or "no benchmarks" —
those expectations belong to agentic_build only. If the design
articulates the concept even briefly, that's enough; otherwise
treat it as out-of-scope, not a gap. \`top_actions\` should be
achievable and worthwhile within the same 1-hour design session.

For **agentic_build**, the build-readiness critiques ARE fair game
when the plan genuinely lacks them — the candidate is going to
execute against this plan in the next 30-45 minutes.

## Phase goal
${rubric.goal}

## Time bounds
Target ${rubric.timeBounds.targetMinMinutes}–${rubric.timeBounds.targetMaxMinutes} minutes. Flag if active work was under ${rubric.timeBounds.flagUnderMinutes} or over ${rubric.timeBounds.flagOverMinutes} minutes.${rubric.timeBounds.note ? `\nNote: ${rubric.timeBounds.note}` : ''}

## Pass bar
Required artifact: ${rubric.passBar.requiredArtifact}
${rubric.passBar.description}
Temporal check: ${rubric.passBar.temporalCheck}
Required sections in the artifact:
${sectionsBlock}

## How to find evidence (READ THIS BEFORE JUDGING SIGNALS)
The "required sections" above are organizational hints, NOT a literal
checklist. The candidate's plan.md is freeform Markdown — they may use
different headers, fold multiple concepts into one section, place a
concept in a paragraph that has no header at all, or put a Mermaid
diagram in lieu of prose. **For every signal, search the entire
plan.md (and the activity logs / hint history when relevant) for the
concept before deciding HIT / PARTIAL / MISS.** Do NOT downgrade a
signal just because the concept doesn't appear under the expected
header — judge by presence and clarity of the *idea*, anywhere in
the artifact.

Concrete examples of what counts as the concept being present:
- \`scope_cuts\` / \`scope_realism\`: any statement of what's in vs out,
  even buried inside an "Overview" or "Approach" paragraph.
- \`shape_and_seams\`: a Mermaid block that names components and the
  edges between them counts; so does a prose paragraph naming the
  same boundaries.
- \`capacity_estimation\`: any back-of-envelope number — QPS, storage,
  bandwidth — even if it's one line in a different section.
- \`data_model_committed\`: a sketch of entities/columns counts, even
  if the candidate didn't write a "Data model" header.
- \`caching_strategy_articulated\`: naming a cache layer in a
  diagram + saying when it's invalidated/bypassed counts.
- \`failure_modes_articulated\`: any concrete failure named (timeouts,
  partial outage, cache miss storms) with a posture toward it.

If you can't find the concept anywhere after searching the whole
artifact, MISS is correct. But "I expected it under section X and
didn't find it there" is NOT a reason to MISS or PARTIAL — extend the
search to the rest of the document first.

## Weight values (use these when scoring)
high = ${rubric.weightValues.high}, medium = ${rubric.weightValues.medium}, low = ${rubric.weightValues.low}

## GOOD signals (presence is positive)
${goodSignalsBlock}

## BAD signals (presence is negative; signals marked CRITICAL cap the final score)
${badSignalsBlock}

${pairingBlock}

## Scoring computation
${rubric.scoring.computation}
Scale: ${rubric.scoring.scaleMin}–${rubric.scoring.scaleMax}. Anchors:
${anchorsBlock}${rubric.scoring.calibrationNote ? `\nNote: ${rubric.scoring.calibrationNote}` : ''}

## Calibration notes
${calibrationBlock}

${aiUsageBlock}

## Mermaid diagrams in plan.md
The candidate's plan.md may include Mermaid diagrams in fenced
\`\`\`mermaid code blocks. Treat the diagram source as part of their
architectural articulation: read nodes as components, edges as data
or control flow, and judge it the same as prose. A clear diagram
counts toward signals like \`shape_and_seams\`, \`component_boundaries\`,
\`interfaces_sketched\`, and \`data_model_committed\` — quote a node or
edge by name in evidence when a diagram is what supports the signal.

When a signal genuinely has no surface area in the question, mark it
"cannot_evaluate" rather than miss; otherwise prefer miss. Aggregate
scoring: skipped ("cannot_evaluate") signals are excluded from both
earned and max totals so they do not change the score.

${renderOutputBlock(rubric, useTools, callKind)}`;
}

function renderOutputBlock(
  rubric: Rubric,
  useTools: boolean,
  callKind: PlanCallKind,
): string {
  if (callKind === 'results') {
    if (useTools) {
      return `## Output (Call A — verdicts only)
Submit your evaluation by calling the \`submit_plan_results\` tool. Every signal listed above (both good and bad) must appear in the \`signals\` object with a single \`result\` field — one of "hit", "partial", "miss", "cannot_evaluate". The tool schema enforces this and unknown signal ids are rejected.

DO NOT include reasoning or evidence in this call. A follow-up call collects those. The verdicts you commit here are final and will be passed verbatim into that follow-up — get them right.

Re-read the GOOD and BAD signal definitions above. For each signal, search the WHOLE plan.md (and activity logs / hints) for the concept the signal names before choosing a verdict. Then return the tool call.`;
    }
    return `## OUTPUT FORMAT (Call A, strict)
Return ONLY a single valid JSON object. No prose. No markdown fences.
Shape: \`{"signals": {"<signal_id>": {"result": "hit" | "partial" | "miss" | "cannot_evaluate"}, ...}}\` — every rubric signal id present.
DO NOT include reasoning or evidence in this call; a follow-up call collects those.`;
  }

  if (callKind === 'monolithic') {
    if (useTools) {
      return `## Output (monolithic — eval-harness compare mode)
Submit your evaluation by calling the \`submit_plan_evaluation_monolithic\` tool. Every signal listed above (both good and bad) must appear in the \`signals\` object — the tool schema enforces this and unknown signal ids are rejected.

For each signal, write \`reasoning\` first (your brief justification), then commit to \`result\` (one of "hit", "partial", "miss", "cannot_evaluate"), then quote \`evidence\` verbatim from plan.md or activity logs (≤150 chars). For "cannot_evaluate", evidence must explain why the signal is not applicable to this question.

\`feedback\` (≤3000 chars) is a SYNTHESIS — open with one line confirming the variant, then explain the score in 2–4 themes (what the plan got right, what it missed, what the candidate should learn). Do NOT enumerate per-signal pass/fail in feedback — that's what \`signals[*].evidence\` is for.

\`top_actions\` (≤5 items, each ≤200 chars) must be achievable in the same 1-hour design session. \`gap_topics\` (≤5 items): system-design topics directly relevant to THIS question that the candidate either MISSED entirely or only LIGHTLY TOUCHED in plan.md. \`name\` must come from the schema's enum. Empty array is correct when nothing relevant is missing — do NOT pad.`;
    }
    return `## OUTPUT FORMAT (monolithic, strict)
Return ONLY a single valid JSON object. No prose. No markdown fences.
Shape: \`{"signals": {"<id>": {"reasoning": ..., "result": "hit|partial|miss|cannot_evaluate", "evidence": ...}, ...}, "feedback": ..., "top_actions": [...], "gap_topics": [...]}\`.
Every rubric signal id must appear in "signals".`;
  }

  // callKind === 'details'
  if (useTools) {
    return `## Output (Call B — details only)
Submit your evaluation by calling the \`submit_plan_details\` tool. The per-signal verdicts (hit / partial / miss / cannot_evaluate) were committed by a prior pass and are listed in the user message under "Known per-signal verdicts" — they ARE NOT yours to revise.

### Evidence quote rules (load-bearing — read carefully)

The \`evidence\` field for each signal MUST be a **literal substring of the candidate's artifacts** (plan.md or the AI hint exchanges) — not a paraphrase, not a summary, not a rewrite in your own words. A downstream grounding validator will check that your evidence text appears verbatim in the artifacts; quotes that fail this check cause the signal to be downgraded (hit→partial or partial→miss), which corrupts the score the prior pass already committed.

Concrete examples for a URL shortener plan that says "Click counts increment in place.":
  GOOD evidence: "Click counts increment in place."
  GOOD evidence: "click_count). Single table, primary key on slug"
  BAD evidence (paraphrased — fails validator): "Counters are updated synchronously per request."
  BAD evidence (rewritten — fails validator): "The plan increments click counts inline rather than batching."

How to choose evidence by verdict:
- For a "hit" or "partial" verdict: copy the shortest contiguous phrase (≤150 chars) from plan.md that contains the concept the signal names. Prefer fewer, longer phrases over fragments. If the relevant content spans multiple sentences, pick the most concentrated one.
- For a "miss" verdict (concept is absent from plan.md): set \`evidence\` to a brief explicit absence statement, e.g. \`"[no relevant text in plan.md]"\` or quote a short adjacent sentence that demonstrates the omission. Do NOT invent content the plan doesn't contain.
- For "cannot_evaluate": evidence must briefly explain why the signal is not applicable to this question (e.g., \`"Traditional URL shortener; signal applies only to AI-component questions."\`).

For each signal, write \`reasoning\` first (your brief justification consistent with the committed verdict), then the verbatim/absence \`evidence\` quote.

### Feedback + top_actions + gap_topics

\`feedback\` (≤3000 chars) is a SYNTHESIS — open with one line confirming the variant (e.g., "agentic_design: question is core-LLM with multi-turn dialog and stated 10K DAU."), then explain the score in 2–4 themes (what the plan got right, what it missed, what the candidate should learn). Do NOT enumerate per-signal pass/fail in feedback — that's what \`signals[*].evidence\` is for.

\`top_actions\` (≤5 items, each ≤200 chars) must be achievable in the same 1-hour design session. "Run a 10K req/s load test" is NOT valid; "sketch how you'd validate at demo scale" is.

\`gap_topics\` (≤5 items): system-design topics directly relevant to THIS question that the candidate either MISSED entirely or only LIGHTLY TOUCHED in plan.md. \`name\` must come from the schema's enum — paraphrasing is rejected. Pick a topic only when you can defend why it matters for this specific question (cite the question's NFR, scale, or domain in \`why_expected\`). Empty array is correct when nothing relevant is missing — do NOT pad. Examples: a URL shortener at 10K RPS without any caching mention -> \`{name: "cache_aside", coverage: "missed", why_expected: "10K RPS read-heavy with immutable slug->target mapping makes a cache the natural read path; plan.md does not mention any cache layer"}\`. A counter API where the candidate names locking but not the isolation level -> \`{name: "transaction_isolation", coverage: "lightly_touched", why_expected: "plan.md says 'use a lock' but doesn't pick READ_COMMITTED vs SERIALIZABLE — the choice changes both correctness and contention"}\`.`;
  }
  return `## OUTPUT FORMAT (Call B, strict)
Return ONLY a single valid JSON object. No prose. No markdown fences.
The per-signal verdicts were committed by a prior pass (see "Known per-signal verdicts" in the user message) — DO NOT revise them.
Shape: \`{"signals": {"<id>": {"reasoning": ..., "evidence": ...}, ...}, "feedback": ..., "top_actions": [...], "gap_topics": [...]}\`.

### Evidence quote rules (load-bearing)
"evidence" (≤150 chars) MUST be a literal substring of plan.md or the AI hint exchanges — no paraphrasing, no rewriting. A downstream validator checks verbatim grounding; failed checks downgrade the signal and corrupt the score.

For a "hit" or "partial" verdict: copy the shortest contiguous phrase from plan.md containing the signal's concept. For "miss": set evidence to \`"[no relevant text in plan.md]"\` or quote an adjacent sentence demonstrating the omission — do NOT invent content. For "cannot_evaluate": briefly explain why the signal is not applicable.

\`feedback\` (≤3000 chars), \`top_actions\` (≤5 items, ≤200 chars each), and \`gap_topics\` (≤5 items, each {name, coverage, why_expected}) — same shape as before. \`name\` must come from the canonical vocabulary in the rubric outputSchema. Empty \`gap_topics\` is fine.

The JSON MUST match this schema:
${JSON.stringify(rubric.outputSchema, null, 2)}`;
}

function formatSignal(s: {
  id: string;
  weight: string;
  description: string;
  judgeNotes: string;
  evidenceHint?: string;
  critical?: boolean;
  capAtScore?: number;
  appliesTo?: string[];
}): string {
  const tags = [`weight: ${s.weight}`];
  if (s.critical) tags.push('CRITICAL');
  if (s.capAtScore !== undefined) tags.push(`caps score at ${s.capAtScore}`);
  if (s.appliesTo && s.appliesTo.length > 0) {
    tags.push(`applies_to: ${s.appliesTo.join(', ')}`);
  }
  return `### ${s.id} (${tags.join(', ')})
description: ${s.description}
judge_notes: ${s.judgeNotes}${s.evidenceHint ? `\nevidence_hint: ${s.evidenceHint}` : ''}`;
}

function renderUserPayload(
  input: PhaseEvalInput,
  callKind: PlanCallKind,
  knownResults?: Record<string, 'hit' | 'partial' | 'miss' | 'cannot_evaluate'>,
): string {
  const sections: string[] = [];

  // Call B preamble: pin the verdicts Call A committed so the model
  // does not re-decide them. Placed BEFORE plan.md so the model reads
  // the constraint before scanning the artifact.
  if (callKind === 'details' && knownResults && Object.keys(knownResults).length > 0) {
    const sorted = Object.keys(knownResults).sort();
    const lines = sorted.map((id) => `- ${id}: ${knownResults[id]}`).join('\n');
    sections.push(
      `## Known per-signal verdicts (DO NOT revise these — they were committed by a prior pass)\n${lines}`,
    );
  }

  const planBody = input.planMd && input.planMd.trim().length > 0 ? input.planMd : '(empty)';
  sections.push(
    `## plan.md (final state)\n${wrapUserContent(planBody, USER_CONTENT_TAGS.planMd)}`,
  );

  if (input.snapshots.length === 0) {
    sections.push(`## Snapshot timeline\n(no snapshots — plan.md was never saved)`);
  } else {
    const sorted = [...input.snapshots].sort(
      (a, b) => a.takenAt.getTime() - b.takenAt.getTime(),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const sizes = sorted.map((s) => s.planMdSize);
    const grew = sizes[sizes.length - 1] > sizes[0];
    const lines = [
      `${sorted.length} snapshot(s) recorded`,
      `First save: ${first.takenAt.toISOString()} — plan.md was ${first.planMdSize} chars (active elapsed: ${first.elapsedMinutes}m)`,
      `Last save:  ${last.takenAt.toISOString()} — plan.md was ${last.planMdSize} chars (active elapsed: ${last.elapsedMinutes}m)`,
      `Trend: plan.md ${grew ? 'grew' : sizes[sizes.length - 1] === sizes[0] ? 'stable' : 'shrank'} across the session.`,
    ];
    sections.push(`## Snapshot timeline\n${lines.join('\n')}`);
  }

  if (input.hints.length === 0) {
    sections.push(`## AI hint usage\nNo hint chat used during this session.`);
  } else {
    const exchanges = input.hints
      .map(
        (h) =>
          `[${h.elapsedMinutes}m elapsed] User: ${h.prompt}\nBot: ${h.response}`,
      )
      .join('\n\n');
    sections.push(
      `## AI hint usage (${input.hints.length} exchange(s))\n${wrapUserContent(exchanges, USER_CONTENT_TAGS.hintExchange)}`,
    );
  }

  const activeMinutes =
    input.snapshots.length > 0
      ? Math.max(...input.snapshots.map((s) => s.elapsedMinutes))
      : 0;
  sections.push(
    `## Active elapsed\n${activeMinutes} minute(s) of active work (pause-aware, excludes paused time).`,
  );

  return sections.join('\n\n');
}
