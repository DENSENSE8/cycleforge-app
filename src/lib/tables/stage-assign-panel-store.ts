/** Which bulk stage-assign panel is open under the column-action foot. */

'use client';

import { useSyncExternalStore } from 'react';

type StageAssignPanelLane = 'pick' | 'pack';

type Listener = () => void;

let lane: StageAssignPanelLane | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getLane(): StageAssignPanelLane | null {
  return lane;
}

export function openStageAssignPanel(next: StageAssignPanelLane) {
  lane = next;
  emit();
}

function closeStageAssignPanel() {
  if (lane == null) return;
  lane = null;
  emit();
}

function toggleStageAssignPanel(next: StageAssignPanelLane) {
  lane = lane === next ? null : next;
  emit();
}

function useStageAssignPanelLane(): StageAssignPanelLane | null {
  return useSyncExternalStore(subscribe, getLane, () => null);
}
