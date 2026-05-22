import {
  buildPlanDetailsTool,
  SUBMIT_PLAN_DETAILS_TOOL_NAME,
} from './plan-details-tool-schema';
import { Rubric, RubricSignal } from '../types/rubric.types';

function signal(id: string, polarity: 'good' | 'bad' = 'good'): RubricSignal {
  return {
    id,
    polarity,
    weight: 'medium',
    description: 'd',
    judgeNotes: 'n',
  };
}

function rubric(signals: RubricSignal[]): Rubric {
  return {
    schemaVersion: 2,
    rubricVersion: 'v2.0',
    phase: 'plan',
    phaseName: 'Plan',
    goal: 'g',
    timeBounds: {
      targetMinMinutes: 30,
      targetMaxMinutes: 45,
      flagUnderMinutes: 15,
      flagOverMinutes: 60,
    },
    weightValues: { high: 3, medium: 2, low: 1 },
    passBar: {
      description: 'pb',
      requiredArtifact: 'plan.md',
      temporalCheck: 't',
      requiredSections: [],
    },
    signals,
    artifactsToInspect: [],
    judgeCalibration: [],
    scoring: {
      scaleMin: 1,
      scaleMax: 5,
      defaultScore: null,
      computation: 'c',
      anchors: {},
    },
    outputSchema: {},
  };
}

describe('buildPlanDetailsTool (Call B)', () => {
  it('uses the canonical Call B tool name', () => {
    const tool = buildPlanDetailsTool(rubric([signal('a')]));
    expect(tool.name).toBe(SUBMIT_PLAN_DETAILS_TOOL_NAME);
  });

  it('lists every rubric signal id under signals.required + properties', () => {
    const tool = buildPlanDetailsTool(
      rubric([signal('a'), signal('b'), signal('c', 'bad')]),
    );
    const schema = tool.inputSchema as Record<string, unknown>;
    const signalsBlock = (schema.properties as Record<string, unknown>)
      .signals as Record<string, unknown>;
    expect(signalsBlock.required).toEqual(['a', 'b', 'c']);
  });

  it('signal_detail requires reasoning + evidence (no result — that came from Call A)', () => {
    const tool = buildPlanDetailsTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    const defs = schema.$defs as Record<string, unknown>;
    const sub = defs.signal_detail as Record<string, unknown>;
    expect(sub.required).toEqual(['reasoning', 'evidence']);
    expect(Object.keys(sub.properties as object)).toEqual(['reasoning', 'evidence']);
  });

  it('evidence is capped at 150 chars', () => {
    const tool = buildPlanDetailsTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    const defs = schema.$defs as Record<string, unknown>;
    const sub = defs.signal_detail as Record<string, unknown>;
    const evidence = (sub.properties as Record<string, unknown>).evidence as Record<
      string,
      unknown
    >;
    expect(evidence.maxLength).toBe(150);
  });

  it('top-level requires signals + feedback + top_actions + gap_topics', () => {
    const tool = buildPlanDetailsTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toEqual(['signals', 'feedback', 'top_actions', 'gap_topics']);
  });

  it('gap_topics is bounded at 5 items and references the shared gap_topic def', () => {
    const tool = buildPlanDetailsTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    const props = schema.properties as Record<string, unknown>;
    const gap = props.gap_topics as Record<string, unknown>;
    expect(gap.type).toBe('array');
    expect(gap.maxItems).toBe(5);
    expect(gap.items).toEqual({ $ref: '#/$defs/gap_topic' });
    const defs = schema.$defs as Record<string, unknown>;
    expect(defs.gap_topic).toBeDefined();
  });

  it('schema size scales with signal count (refs, not inlined copies)', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `s${i}`);
    const tool = buildPlanDetailsTool(rubric(ids.map((id) => signal(id))));
    const serialized = JSON.stringify(tool.inputSchema);
    expect(serialized.length).toBeLessThan(4500);
  });
});
