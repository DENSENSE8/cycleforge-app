/** Flow²-lens node heat — Operations Studio "Flow²" lens (ST2). */

import type { HeatLevel } from './live-heat';

/** Flow² WIP at/above this tips a node from active → warm. */
const WARM_WIP = 5;
/** Fail fraction at/above this is hot on its own. */
const HOT_FAIL_RATE = 0.25;

interface FlowHeatInput {
  /** Latest snapshot queue depth sitting at the node. */
  currentWip: number;
  /** Fraction of runs that took a fail/error port (null when no runs). */
  failRate: number | null;
  /** Completed dwell samples observed in the window. */
  runCount: number;
  /** This node is in the API's ranked bottleneck list. */
  isBottleneck: boolean;
}

interface FlowHeat {
  level: HeatLevel;
  /** Human-readable why-it's-hot, for the node tooltip. */
  reasons: string[];
}

export function computeFlowHeat({
  currentWip,
  failRate,
  runCount,
  isBottleneck,
}: FlowHeatInput): FlowHeat {
  const reasons: string[] = [];
  const fail = failRate ?? 0;
  if (currentWip > 0) reasons.push(`${currentWip} in queue`);
  if (fail > 0) reasons.push(`${Math.round(fail * 100)}% fail`);

  if (isBottleneck) {
    reasons.unshift('top bottleneck');
    return { level: 'hot', reasons };
  }
  if (fail >= HOT_FAIL_RATE) {
    return { level: 'hot', reasons };
  }
  if (currentWip >= WARM_WIP || fail > 0) {
    return { level: 'warm', reasons };
  }
  if (currentWip > 0 || runCount > 0) {
    return { level: 'active', reasons };
  }
  return { level: 'idle', reasons };
}
