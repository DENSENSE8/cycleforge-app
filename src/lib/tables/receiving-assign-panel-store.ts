/**
 * Which bulk receiving-line assign panel is open in the right rail.
 *
 * Plan: `docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md` §5.2.4 / §5.4.
 * Twin of {@link openStageAssignPanel}. The Assign to… verb flips this store;
 * {@link ReceivingAssignPanel} (mounted once in ReceivingLineRailShell) paints
 * AssigneeCombobox so Unbox / History / Testing share one picker.
 */

'use client';

import { useSyncExternalStore } from 'react';

type Listener = () => void;

let open = false;
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

function getOpen(): boolean {
  return open;
}

export function openReceivingAssignPanel() {
  if (open) return;
  open = true;
  emit();
}

export function closeReceivingAssignPanel() {
  if (!open) return;
  open = false;
  emit();
}

export function useReceivingAssignPanelOpen(): boolean {
  return useSyncExternalStore(subscribe, getOpen, () => false);
}
