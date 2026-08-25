'use client';

/**
 * React bindings for the tool registry and palette. Thin by design — every
 * mutation is a plain function on the store, so a component never owns tool
 * state and a test never needs React to exercise it.
 */

import { useSyncExternalStore } from 'react';
import {
  getServerToolRegistry,
  listTools,
  listToolsByGroup,
  subscribeToolRegistry,
  type ToolGroupBucket,
} from '@/lib/tools/registry';
import {
  getServerToolPaletteSnapshot,
  getToolPaletteSnapshot,
  subscribeToolPalette,
} from '@/lib/tools/store';
import type { ToolDescriptor, ToolInstance, ToolPaletteSnapshot } from '@/lib/tools/types';

export function useToolRegistry(): readonly ToolDescriptor[] {
  return useSyncExternalStore(subscribeToolRegistry, listTools, getServerToolRegistry);
}

const EMPTY_GROUPS: readonly ToolGroupBucket[] = Object.freeze([]);

/** Registered tools bucketed by group — the "+" index's and the palette's read. */
export function useToolGroups(): readonly ToolGroupBucket[] {
  return useSyncExternalStore(
    subscribeToolRegistry,
    listToolsByGroup,
    () => EMPTY_GROUPS,
  );
}

export function useToolPalette(): ToolPaletteSnapshot {
  return useSyncExternalStore(
    subscribeToolPalette,
    getToolPaletteSnapshot,
    getServerToolPaletteSnapshot,
  );
}

/** Every open instance of one tool — the palette icon's on/off state. */
export function useToolInstances(toolKey: string): readonly ToolInstance[] {
  return useToolPalette().openTools.filter((t) => t.toolKey === toolKey);
}

/**
 * The focused instance, or `null`. Tool-scoped keybindings gate on this: a
 * chord that belongs to the Calculator must not fire while the Manuals tile has
 * the operator's attention.
 */
export function useFocusedTool(): ToolInstance | null {
  const palette = useToolPalette();
  if (!palette.focusedInstanceId) return null;
  return palette.openTools.find((t) => t.instanceId === palette.focusedInstanceId) ?? null;
}
