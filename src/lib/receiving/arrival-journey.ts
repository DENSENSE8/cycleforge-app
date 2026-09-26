/** Arrival (triage) door journey — Door → Classified → Staged → Ready. */

type ArrivalPipelineKey = 'door' | 'classified' | 'staged' | 'ready';
type ArrivalPipelineState = 'done' | 'active' | 'pending';

type ArrivalJourneyFacts = {
  /** Door scan / earliest tracking scan stamp. */
  doorAt: string | null | undefined;
  /** Carton `source` — unmatched cartons need intake_type to count as classified. */
  source: string | null | undefined;
  intakeType: string | null | undefined;
  stagingLocationId: number | null | undefined;
  priorityLane: string | null | undefined;
  triageComplete: boolean | null | undefined;
};

export function isArrivalClassified(
  source: string | null | undefined,
  intakeType: string | null | undefined,
): boolean {
  if (source !== 'unmatched') return true;
  return !!(intakeType && String(intakeType).trim());
}

export function isArrivalStaged(
  stagingLocationId: number | null | undefined,
  priorityLane: string | null | undefined,
): boolean {
  return stagingLocationId != null && !!priorityLane;
}

function hasStamp(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

export function deriveArrivalPipelineStates(
  facts: ArrivalJourneyFacts,
): Record<ArrivalPipelineKey, ArrivalPipelineState> {
  const doorDone = hasStamp(facts.doorAt);
  const classifiedDone = isArrivalClassified(facts.source, facts.intakeType);
  const stagedDone = isArrivalStaged(facts.stagingLocationId, facts.priorityLane);
  const readyDone = facts.triageComplete === true;

  const states: Record<ArrivalPipelineKey, ArrivalPipelineState> = {
    door: doorDone ? 'done' : 'active',
    classified: classifiedDone ? 'done' : doorDone ? 'active' : 'pending',
    staged: stagedDone ? 'done' : classifiedDone ? 'active' : 'pending',
    ready: readyDone ? 'done' : stagedDone ? 'active' : 'pending',
  };

  if (!doorDone) {
    states.classified = 'pending';
    states.staged = 'pending';
    states.ready = 'pending';
  } else if (!classifiedDone) {
    states.staged = 'pending';
    states.ready = 'pending';
  } else if (!stagedDone) {
    states.ready = 'pending';
  }

  return states;
}

export function arrivalReadinessHeadline(
  states: Record<ArrivalPipelineKey, ArrivalPipelineState>,
): string {
  if (states.ready === 'done') return 'Ready for unbox.';
  if (states.staged === 'active' || states.staged === 'done') {
    return 'Stage the carton, then save for unbox.';
  }
  if (states.classified === 'active') return 'Classify this arrival.';
  if (states.door === 'done') return 'Door scan recorded.';
  return 'Waiting for door scan.';
}
