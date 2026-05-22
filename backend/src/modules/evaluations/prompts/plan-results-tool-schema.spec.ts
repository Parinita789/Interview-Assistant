import {
  buildPlanResultsTool,
  SUBMIT_PLAN_RESULTS_TOOL_NAME,
} from './plan-results-tool-schema';
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

describe('buildPlanResultsTool (Call A)', () => {
  it('uses the canonical Call A tool name', () => {
    const tool = buildPlanResultsTool(rubric([signal('a')]));
    expect(tool.name).toBe(SUBMIT_PLAN_RESULTS_TOOL_NAME);
  });

  it('lists every rubric signal id under signals.required + properties', () => {
    const tool = buildPlanResultsTool(
      rubric([signal('a'), signal('b'), signal('c', 'bad')]),
    );
    const schema = tool.inputSchema as Record<string, unknown>;
    const signalsBlock = (schema.properties as Record<string, unknown>)
      .signals as Record<string, unknown>;
    expect(signalsBlock.required).toEqual(['a', 'b', 'c']);
    expect(Object.keys(signalsBlock.properties as object)).toEqual(['a', 'b', 'c']);
  });

  it('every signal entry is a $ref to #/$defs/signal_result', () => {
    const tool = buildPlanResultsTool(
      rubric([signal('a'), signal('b')]),
    );
    const schema = tool.inputSchema as Record<string, unknown>;
    const props = (
      (schema.properties as Record<string, unknown>).signals as Record<string, unknown>
    ).properties as Record<string, unknown>;
    for (const id of ['a', 'b']) {
      expect(props[id]).toEqual({ $ref: '#/$defs/signal_result' });
    }
  });

  it('signal_result requires only result (no reasoning, no evidence)', () => {
    const tool = buildPlanResultsTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    const defs = schema.$defs as Record<string, unknown>;
    const sub = defs.signal_result as Record<string, unknown>;
    expect(sub.required).toEqual(['result']);
    expect(Object.keys(sub.properties as object)).toEqual(['result']);
  });

  it('result is an enum of the four valid values', () => {
    const tool = buildPlanResultsTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    const defs = schema.$defs as Record<string, unknown>;
    const sub = defs.signal_result as Record<string, unknown>;
    const result = (sub.properties as Record<string, unknown>).result as Record<
      string,
      unknown
    >;
    expect(result.enum).toEqual(['hit', 'partial', 'miss', 'cannot_evaluate']);
  });

  it('top-level requires only signals — no feedback / top_actions / gap_topics', () => {
    const tool = buildPlanResultsTool(rubric([signal('a')]));
    const schema = tool.inputSchema as Record<string, unknown>;
    expect(schema.required).toEqual(['signals']);
    expect(Object.keys(schema.properties as object)).toEqual(['signals']);
  });

  it('schema stays compact at 25 signals (refs not inlined)', () => {
    const ids = Array.from({ length: 25 }, (_, i) => `s${i}`);
    const tool = buildPlanResultsTool(rubric(ids.map((id) => signal(id))));
    const serialized = JSON.stringify(tool.inputSchema);
    expect(serialized.length).toBeLessThan(1500);
  });
});
