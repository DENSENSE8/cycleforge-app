/**
 * Imperative bridges from Unbox tab bodies → the panel terminal dock.
 * Tabs register when mounted/active; the resolver reads the latest snapshot.
 */

import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';

export interface ChecklistTabBridge {
  allDone: boolean;
  itemCount: number;
  checkAll: () => void;
  uncheckAll: () => void;
}

/** Alias — ThreadPanel owns the canonical composer bridge shape. */
export type ConversationTabBridge = ThreadComposerBridge;

export interface UnitsTabBridge {
  serialCount: number;
  openPrebox: () => void;
}

export interface UnboxTabBridges {
  checklist: ChecklistTabBridge | null;
  conversation: ConversationTabBridge | null;
  units: UnitsTabBridge | null;
}
