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

/** Alias — ThreadPanel owns the canonical composer bridge shape (Team segment). */
export type SupportTabBridge = ThreadComposerBridge;
/** @deprecated use SupportTabBridge */
export type ConversationTabBridge = SupportTabBridge;

export interface UnitsTabBridge {
  serialCount: number;
  openPrebox: () => void;
}

export interface UnboxTabBridges {
  checklist: ChecklistTabBridge | null;
  support: SupportTabBridge | null;
  /** @deprecated use support */
  conversation: SupportTabBridge | null;
  units: UnitsTabBridge | null;
}
