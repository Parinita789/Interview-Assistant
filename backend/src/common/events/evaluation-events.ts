import { Phase } from '../../modules/phase-tagger/types/phase.types';

export class EvaluationCompletedEvent {
  static readonly eventName = 'evaluation.completed';

  constructor(
    public readonly evaluationId: string,
    public readonly sessionId: string,
    public readonly phase: Phase,
    public readonly model?: string,
  ) {}
}

export class BuildEvalRequestedEvent {
  static readonly eventName = 'build-eval.requested';

  constructor(public readonly sessionId: string) {}
}

// Fired by OrchestratorService after Call B of the two-call plan eval
// completes (success or recoverable error — see PhaseEvaluation.detailsError).
// Deep-dive mentor listens to this instead of EvaluationCompletedEvent so it
// has feedback / top_actions / gap_topics to reference. Signal-mentor keeps
// firing on EvaluationCompletedEvent (Call A is enough — it only reads
// per-signal verdicts).
export class PlanEvalDetailsCompletedEvent {
  static readonly eventName = 'plan-eval.details-completed';

  constructor(
    public readonly evaluationId: string,
    public readonly sessionId: string,
    public readonly succeeded: boolean,
  ) {}
}
