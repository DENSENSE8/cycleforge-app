'use client';

/**
 * Tool palette store — the single owner of "which tools are OPEN right now".
 *
 * Module-level singleton + `subscribe`/`emit` + a cached immutable snapshot for
 * `useSyncExternalStore`. Same shape as `src/lib/right-rail/store.ts` and
 * `src/lib/workspace/store.ts` — the house pattern, 19 precedents. Not Zustand:
 * `zustand` is only in the tree as a transitive dependency of `@xyflow/react`,
 * and a second state library for one rail would be the third way this repo
 * owns global state.
 *
 * ## Instances, not "the open tool"
 *
 * The old model held one occupant at a time because the right rail held one
 * occupant at a time. This store holds an ORDERED LIST, because the target rail
 * tiles: Manuals above the Label Printer above a Calculator, all live. Ordering
 * is by `openedAt`, oldest first, which is the order the tiles paint down the
 * rail and the order eviction walks.
 *
 * ## What this store is NOT
 *
 * It holds no React nodes and imports nothing from `react` or the right-rail
 * store, so it stays serializable, DB-free, and testable under `node --test`
 * with zero setup. The bridge that turns an instance into a right-rail occupant
 * is a component (`ToolInstanceRegistrar`) — deliberately above both stores,
 * the same reason `closeRightPanel` is a third module above occupancy and
 * lifecycle.
 *
 * ## Descriptor lookup is injected, not imported
 *
 * `openTool` must refuse a `toolKey` nothing has registered — otherwise a typo
 * opens an empty tile forever. It reads the registry through a module-level
 * hook (`setToolResolver`) that defaults to the real one, so the pure tests
 * drive open/close/evict without importing a registry full of `import()`
 * factories.
 */

import { getTool } from '@/lib/tools/registry';
import {
  MAX_OPEN_TOOLS,
  type ToolDescriptor,
  type ToolInstance,
  type ToolOpenSource,
  type ToolPaletteSnapshot,
} from '@/lib/tools/types';
import type { TabParams, TabParamsPatch } from '@/lib/workspace/types';

const EMPTY_PARAMS: TabParams = Object.freeze({});

let openTools: readonly ToolInstance[] = Object.freeze([]);
let focusedInstanceId: string | null = null;
let pinnedToolKeys: readonly string[] = Object.freeze([]);

const listeners = new Set<() => void>();

let snapshot: ToolPaletteSnapshot = {
  openTools,
  focusedInstanceId,
  pinnedToolKeys,
};

/** Monotonic per-process counter behind generated instance ids — deterministic in tests. */
let instanceSeq = 0;

/** Injectable clock, so `openedAt` ordering is assertable without sleeping. */
let now: () => number = () => Date.now();

/** Injectable descriptor lookup — see the module docblock. */
let resolveDescriptor: (toolKey: string) => ToolDescriptor | undefined = getTool;

function commit(): void {
  snapshot = { openTools, focusedInstanceId, pinnedToolKeys };
  for (const listener of listeners) listener();
}

export function subscribeToolPalette(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToolPaletteSnapshot(): ToolPaletteSnapshot {
  return snapshot;
}

/**
 * Server snapshot: a frozen constant, never a fresh object. React re-invokes
 * this on every server render and a new identity each time loops forever.
 */
const SERVER_SNAPSHOT: ToolPaletteSnapshot = Object.freeze({
  openTools: Object.freeze([]) as readonly ToolInstance[],
  focusedInstanceId: null,
  pinnedToolKeys: Object.freeze([]) as readonly string[],
});

export function getServerToolPaletteSnapshot(): ToolPaletteSnapshot {
  return SERVER_SNAPSHOT;
}

export function getToolInstance(instanceId: string): ToolInstance | undefined {
  return openTools.find((t) => t.instanceId === instanceId);
}

/** Every open instance of one tool. Empty when the tool is closed. */
export function getToolInstancesOf(toolKey: string): readonly ToolInstance[] {
  return openTools.filter((t) => t.toolKey === toolKey);
}

function normalizeParams(params: TabParams | undefined): TabParams {
  return params && Object.keys(params).length > 0 ? { ...params } : EMPTY_PARAMS;
}

/**
 * Evict down to {@link MAX_OPEN_TOOLS} - 1 so a new instance fits. Victims are
 * oldest-first among unfocused instances — the same leftmost-first rule the tab
 * strip uses, pointed down the rail instead of across it. A palette whose every
 * open tool is the focused one cannot happen (there is exactly one focus), so
 * this always finds a victim once `length >= MAX_OPEN_TOOLS`.
 */
function evictForRoom(next: ToolInstance[]): void {
  while (next.length >= MAX_OPEN_TOOLS) {
    const victim = next.find((t) => t.instanceId !== focusedInstanceId) ?? next[0];
    if (!victim) return;
    const index = next.indexOf(victim);
    next.splice(index, 1);
  }
}

export interface OpenToolInput {
  readonly toolKey: string;
  readonly params?: TabParams;
  /**
   * Explicit instance id. Passing one makes the instance a SINGLETON — a second
   * open under the same id focuses the live instance instead of duplicating it.
   * Same contract as `openTab`'s explicit id, so the two window managers do not
   * teach two different rules.
   */
  readonly instanceId?: string;
  /** Defaults to `'click'`; the keybinding dispatcher and the agent pass their own. */
  readonly openedBy?: ToolOpenSource;
}

/**
 * Open a tool. Returns the instance id, or `null` when the key names no
 * registered tool — a typo must not paint an empty tile that nothing can fill.
 *
 * A descriptor marked `singleton` behaves as if an explicit id had been passed:
 * the live instance takes focus and its params are patched with whatever the
 * caller sent, so "open the Label Printer, on this order" re-targets the one
 * open printer instead of pairing a second device.
 */
export function openTool(input: OpenToolInput): string | null {
  const descriptor = resolveDescriptor(input.toolKey);
  if (!descriptor) return null;

  const explicitId =
    input.instanceId ?? (descriptor.singleton ? `tool:${descriptor.toolKey}` : null);

  if (explicitId) {
    const existing = openTools.find((t) => t.instanceId === explicitId);
    if (existing) {
      const params = input.params ? { ...existing.params, ...input.params } : existing.params;
      openTools = openTools.map((t) =>
        t.instanceId === explicitId ? { ...t, params } : t,
      );
      focusedInstanceId = explicitId;
      commit();
      return explicitId;
    }
  }

  instanceSeq += 1;
  const instanceId = explicitId ?? `tool:${input.toolKey}:${instanceSeq}`;

  const next = [...openTools];
  evictForRoom(next);
  next.push({
    instanceId,
    toolKey: input.toolKey,
    params: normalizeParams(input.params),
    openedAt: now(),
    openedBy: input.openedBy ?? 'click',
  });

  openTools = Object.freeze(next);
  focusedInstanceId = instanceId;
  commit();
  return instanceId;
}

/**
 * Close one instance. Focus falls to the newest surviving instance rather than
 * to nothing: an operator who closes the top of a stack of three is still
 * working in that stack, and dropping focus to `null` would silently disarm
 * every tool-scoped key.
 */
export function closeTool(instanceId: string): void {
  if (!openTools.some((t) => t.instanceId === instanceId)) return;
  const next = openTools.filter((t) => t.instanceId !== instanceId);
  openTools = Object.freeze(next);
  if (focusedInstanceId === instanceId) {
    focusedInstanceId = next.length > 0 ? next[next.length - 1].instanceId : null;
  }
  commit();
}

/** Close every open instance of one tool — the palette icon's toggle-off. */
export function closeToolsOf(toolKey: string): void {
  if (!openTools.some((t) => t.toolKey === toolKey)) return;
  const next = openTools.filter((t) => t.toolKey !== toolKey);
  const stillOpen = next.some((t) => t.instanceId === focusedInstanceId);
  openTools = Object.freeze(next);
  if (!stillOpen) {
    focusedInstanceId = next.length > 0 ? next[next.length - 1].instanceId : null;
  }
  commit();
}

export function focusTool(instanceId: string | null): void {
  if (instanceId !== null && !openTools.some((t) => t.instanceId === instanceId)) return;
  if (focusedInstanceId === instanceId) return;
  focusedInstanceId = instanceId;
  commit();
}

/** Patch one instance's params. `undefined` removes a key. No-ops when unchanged. */
export function setToolParams(instanceId: string, patch: TabParamsPatch): void {
  const current = openTools.find((t) => t.instanceId === instanceId);
  if (!current) return;

  const merged: Record<string, string | number | boolean | null> = { ...current.params };
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (key in merged) {
        delete merged[key];
        changed = true;
      }
      continue;
    }
    if (merged[key] !== value) {
      merged[key] = value;
      changed = true;
    }
  }
  if (!changed) return;

  openTools = Object.freeze(
    openTools.map((t) => (t.instanceId === instanceId ? { ...t, params: merged } : t)),
  );
  commit();
}

/**
 * Pin a tool KEY (not an instance) to the palette. Pins are a PERSON fact —
 * they follow the staffer across workstations — so they live beside the other
 * `staff_preferences.prefs.workspace` collections, not in device storage.
 */
export function pinTool(toolKey: string): void {
  if (pinnedToolKeys.includes(toolKey)) return;
  pinnedToolKeys = Object.freeze([...pinnedToolKeys, toolKey]);
  commit();
}

export function unpinTool(toolKey: string): void {
  if (!pinnedToolKeys.includes(toolKey)) return;
  pinnedToolKeys = Object.freeze(pinnedToolKeys.filter((k) => k !== toolKey));
  commit();
}

export function isToolPinned(toolKey: string): boolean {
  return pinnedToolKeys.includes(toolKey);
}

/** Push a persisted bag into the store. An absent bag empties it. */
export function hydrateToolPalette(input: {
  openTools?: readonly ToolInstance[];
  pinnedToolKeys?: readonly string[];
  focusedInstanceId?: string | null;
}): void {
  const tools = (input.openTools ?? []).slice(0, MAX_OPEN_TOOLS).map((t) => ({
    instanceId: t.instanceId,
    toolKey: t.toolKey,
    params: normalizeParams(t.params),
    openedAt: t.openedAt,
    openedBy: 'restore' as const,
  }));
  openTools = Object.freeze(tools);
  pinnedToolKeys = Object.freeze([...(input.pinnedToolKeys ?? [])]);
  const wanted = input.focusedInstanceId ?? null;
  focusedInstanceId = tools.some((t) => t.instanceId === wanted) ? wanted : null;
  commit();
}

/** Test waist, and the sign-out reset. */
export function resetToolPalette(): void {
  openTools = Object.freeze([]);
  pinnedToolKeys = Object.freeze([]);
  focusedInstanceId = null;
  instanceSeq = 0;
  commit();
}

/** Test seam for the injected clock + descriptor lookup. Restore with {@link restoreToolStoreDeps}. */
export function setToolStoreDeps(deps: {
  now?: () => number;
  resolveDescriptor?: (toolKey: string) => ToolDescriptor | undefined;
}): void {
  if (deps.now) now = deps.now;
  if (deps.resolveDescriptor) resolveDescriptor = deps.resolveDescriptor;
}

export function restoreToolStoreDeps(): void {
  now = () => Date.now();
  resolveDescriptor = getTool;
}
