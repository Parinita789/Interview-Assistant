import { isCanonicalTopic } from '../../evaluations/helpers/canonical-topics';

const SIGNAL_TOPIC_MAP: Record<string, string> = {
  capacity_estimation: 'capacity_estimation',
  bottleneck_identification: 'bottleneck_identification',
  read_write_path_differentiation: 'read_write_path_separation',
  caching_strategy_articulated: 'cache_aside',
  consistency_model_chosen: 'strong_consistency',
  inference_cost_articulated: 'capacity_estimation',
  latency_strategy_for_agent_calls: 'bottleneck_identification',
  provider_abstraction_and_failover: 'failover_strategies',
  output_validation_layer: 'idempotency',
  nondeterminism_handling: 'idempotency',
  agent_observability: 'bottleneck_identification',
  agent_state_management: 'event_sourcing',
  failure_modes_articulated: 'failover_strategies',
  no_failure_mode_articulation: 'failover_strategies',
  validation_plan_concrete: 'idempotency',
  no_validation_plan: 'idempotency',
  test_appropriateness: 'idempotency',
  no_tests: 'idempotency',
  structure_soundness: 'component_boundaries',
  component_boundaries: 'component_boundaries',
  boundaries_without_interfaces: 'component_boundaries',
  interfaces_sketched: 'component_boundaries',
  data_model_committed: 'denormalization_for_reads',
  data_model_only_in_code: 'denormalization_for_reads',
  dual_scale_nfrs: 'capacity_estimation',
  scale_pretense: 'capacity_estimation',
};

export function topicForSignal(signalId: string): string {
  const mapped = SIGNAL_TOPIC_MAP[signalId];
  if (mapped) return mapped;
  if (isCanonicalTopic(signalId)) return signalId;
  return slugTopic(signalId);
}

export function normalizeTopicName(name: string): string {
  if (isCanonicalTopic(name)) return name;
  return slugTopic(name);
}

export function labelForTopic(topicId: string): string {
  return topicId
    .split('_')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function slugTopic(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'general_system_design';
}
