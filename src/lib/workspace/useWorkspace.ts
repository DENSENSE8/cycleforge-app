'use client';

/**
 * React bindings for the workspace store. Thin by design — every mutation is a
 * plain function on the store, so a component never owns tab state and a test
 * never needs React to exercise it.
 */

import { useSyncExternalStore } from 'react';
import {
  getServerWorkspaceSnapshot,
  getWorkspaceSnapshot,
  subscribeWorkspace,
} from '@/lib/workspace/store';
import type { WorkspaceSnapshot } from '@/lib/workspace/types';

export function useWorkspace(): WorkspaceSnapshot {
  return useSyncExternalStore(
    subscribeWorkspace,
    getWorkspaceSnapshot,
    getServerWorkspaceSnapshot,
  );
}

/**
 * Whether this tab's subtree may be mounted. The suspension contract in one
 * hook: a tab host renders children only while this is true, hands its state to
 * `saveTabState` on the way out, and seeds from `readTabState` on the way back.
 */
export function useIsTabLive(tabId: string): boolean {
  return useWorkspace().focusedTabId === tabId;
}

/** This tab's own params — never a sibling's, even at the same `ref`. */
export function useTabParams(tabId: string) {
  const { openTabs } = useWorkspace();
  return openTabs.find((tab) => tab.id === tabId)?.params;
}
