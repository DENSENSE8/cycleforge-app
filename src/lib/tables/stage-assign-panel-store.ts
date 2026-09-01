/**
 * Which bulk stage-assign panel is open under the column-action foot.
 *
 * The Pick / Pack person icons live in {@link DataTableColumnActionRow}; hotkeys
 * and rail verbs flip this store so the same upward search opens without a
 * Dialog or Popover.
 */

'use client';

import { useSyncExternalStore } from 'react';

export type StageAssignPanelLane = 'pick' | 'pack';

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

export function closeStageAssignPanel() {
  if (lane == null) return;
  lane = null;
  emit();
}

export function toggleStageAssignPanel(next: StageAssignPanelLane) {
  lane = lane === next ? null : next;
  emit();
}

export function useStageAssignPanelLane(): StageAssignPanelLane | null {
  return useSyncExternalStore(subscribe, getLane, () => null);
}
