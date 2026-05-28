export type SignalMode = 'hit' | 'partial' | 'miss' | 'credited' | 'skipped';
export type RubricKind = 'traditional_design' | 'agentic_design' | 'agentic_build';
export type FixtureSeniority = 'junior' | 'mid' | 'senior' | 'staff';
export type FixturePhase = 'plan' | 'build';

export interface FixtureExpectation {
  expectedScore: { min: number; max: number };
  expectedSignals: Partial<Record<SignalMode, string[]>>;
  warnOnly?: boolean;
}

export interface FixtureHint {
  occurredAt: string;
  elapsedMinutes: number;
  prompt: string;
  response: string;
}

export interface FixtureBuildEvent {
  filePath: string;
  action: 'created' | 'modified' | 'deleted';
  content: string | null;
  contentDiff: string | null;
  occurredAt: string;
}

export interface FixtureAITurn {
  externalSessionId: string;
  turnIndex: number;
  role: 'user' | 'assistant' | 'tool';
  text: string | null;
  toolName: string | null;
  toolInputSummary: string | null;
  toolResultSummary: string | null;
  occurredAt: string;
}

export interface Fixture extends FixtureExpectation {
  name: string;
  description: string;
  question: string;
  rubricVersion: string;
  // 'plan' (default) or 'build'. Selects which agent runs and which
  // rubric the loader validates against.
  phase: FixturePhase;
  kind?: RubricKind;
  seniority?: FixtureSeniority; // defaults to 'senior' in the runner
  planMd: string | null;
  hints?: FixtureHint[];
  // Build-phase only. events.jsonl is reconstructed into a final tree;
  // ai-turns.jsonl is selected down to the recent K turns by the same
  // selectBuildContext helper the orchestrator uses.
  events?: FixtureBuildEvent[];
  aiTurns?: FixtureAITurn[];
  buildStartedAt?: string;
  buildEndedAt?: string;
}

export interface SignalMismatch {
  signalId: string;
  expectedMode: SignalMode;
  actualResult: 'hit' | 'partial' | 'miss' | 'cannot_evaluate' | 'not_returned';
  actualEvidence: string;
}

// Per-call breakdown (plan two-call split only). Null on build fixtures
// and on legacy single-call paths so reporter output stays clean when
// the breakdown isn't applicable.
export interface PlanCallBreakdown {
  callA: { latencyMs: number; tokensIn: number; tokensOut: number };
  callB: { latencyMs: number; tokensIn: number; tokensOut: number };
  downgradedSignalIds: string[];
}

// Output of --compare-monolithic mode. Per signal id, records the
// verdict from each path. Two paths agreeing is the happy case; any
// disagreement means the split changed the model's mind for that
// signal — useful signal during a refactor.
export interface MonolithicDiff {
  splitScore: number;
  monolithicScore: number;
  scoreDelta: number;
  signalDisagreements: Array<{
    signalId: string;
    splitVerdict: 'hit' | 'partial' | 'miss' | 'cannot_evaluate';
    monolithicVerdict: 'hit' | 'partial' | 'miss' | 'cannot_evaluate';
  }>;
  agreementCount: number;
  totalSignals: number;
  monolithicLatencyMs: number;
  monolithicTokensIn: number;
  monolithicTokensOut: number;
}

export interface FixtureResult {
  name: string;
  description: string;
  pass: boolean;
  scoreOk: boolean;
  signalsOk: boolean;
  actualScore: number;
  expectedScore: { min: number; max: number };
  signalsExpected: number;
  signalsMet: number;
  mismatches: SignalMismatch[];
  warnOnly: boolean;
  elapsedMs: number;
  modelUsed: string;
  // Plan-only diagnostics. Lets the reporter print "Call A: 8s / Call B:
  // 42s / downgraded: 2" so the operator can see the split in action
  // even when total time matches the old monolithic shape.
  planBreakdown?: PlanCallBreakdown;
  // Populated only when --compare-monolithic is set. Compares the new
  // two-call split's output against a single-call rerun on the same
  // input. Disagreements per signal + score delta are surfaced.
  monolithicDiff?: MonolithicDiff;
}

export interface SuiteReport {
  results: FixtureResult[];
  totalElapsedMs: number;
  provider: string;
  model: string;
  rubricVersion: string;
}
