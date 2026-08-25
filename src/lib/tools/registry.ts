'use client';

/**
 * Tool registry — the module-level table of every tool the app knows how to
 * open, whether or not anything is mounted.
 *
 * ## Why this is a registry and not 43 hooks
 *
 * `useRegisterRightPanel` is a *mount-scoped* registration: the claim exists
 * for the lifetime of the calling component, and its payload is a live React
 * element. That makes "open the Photo Library from the Unbox bench" impossible
 * to express — the Photo Library's element belongs to a page the operator is
 * not on. Reachability was accidentally coupled to what happened to be
 * rendered.
 *
 * A descriptor is registered by importing a module. Nothing mounts, nothing
 * renders, and `listTools()` is correct on the first frame of the shell.
 *
 * ## Registration is idempotent, and re-registration REPLACES
 *
 * Under Fast Refresh a descriptor module re-evaluates on every edit, so a
 * throw-on-duplicate registry would make the dev server unusable after one
 * keystroke. Re-registering a key replaces the descriptor; the returned
 * unregister carries an ownership token (the same `seq` trick
 * `registerRightRailPanel` uses) so a stale cleanup cannot delete the
 * replacement.
 *
 * ## Snapshots are cached
 *
 * `listTools()` / `listToolsByGroup()` are read from render through
 * `useSyncExternalStore`. Returning a freshly built array on every call is an
 * infinite render loop — the one failure mode of this pattern — so both are
 * recomputed on mutation and handed out by identity.
 */

import {
  TOOL_GROUP_ORDER,
  type ToolDescriptor,
  type ToolGroup,
} from '@/lib/tools/types';

interface Entry {
  readonly descriptor: ToolDescriptor;
  readonly seq: number;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let seq = 0;

const EMPTY_TOOLS: readonly ToolDescriptor[] = Object.freeze([]);

/** Group buckets, in {@link TOOL_GROUP_ORDER}. Empty groups are omitted. */
export interface ToolGroupBucket {
  readonly group: ToolGroup;
  readonly tools: readonly ToolDescriptor[];
}

let allSnapshot: readonly ToolDescriptor[] = EMPTY_TOOLS;
let groupedSnapshot: readonly ToolGroupBucket[] = Object.freeze([]);

function recompute(): void {
  const all = [...entries.values()]
    .map((e) => e.descriptor)
    // Registration order is import order, which is not meaningful to an
    // operator. Title order is, and it is stable across code motion.
    .sort((a, b) => a.title.localeCompare(b.title));
  allSnapshot = Object.freeze(all);

  const buckets: ToolGroupBucket[] = [];
  for (const group of TOOL_GROUP_ORDER) {
    const tools = all.filter((t) => t.group === group);
    if (tools.length === 0) continue;
    buckets.push({ group, tools: Object.freeze(tools) });
  }
  groupedSnapshot = Object.freeze(buckets);
}

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Add (or replace) a tool. Returns an unregister that removes exactly this
 * registration — a later registration under the same key is untouched.
 *
 * Call at module scope from a descriptor module. Calling it from a component
 * effect works but reintroduces the mount coupling this registry exists to
 * remove, so do not.
 */
export function registerTool(descriptor: ToolDescriptor): () => void {
  seq += 1;
  const mySeq = seq;
  entries.set(descriptor.toolKey, { descriptor, seq: mySeq });
  recompute();
  emit();
  return () => {
    const current = entries.get(descriptor.toolKey);
    if (!current || current.seq !== mySeq) return;
    entries.delete(descriptor.toolKey);
    recompute();
    emit();
  };
}

export function getTool(toolKey: string): ToolDescriptor | undefined {
  return entries.get(toolKey)?.descriptor;
}

/** Every registered tool, title-sorted. Stable identity between mutations. */
export function listTools(): readonly ToolDescriptor[] {
  return allSnapshot;
}

/** Registered tools bucketed by {@link ToolGroup}, empty groups dropped. */
export function listToolsByGroup(): readonly ToolGroupBucket[] {
  return groupedSnapshot;
}

export function subscribeToolRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Server snapshot. The palette is client-owned chrome, so SSR paints nothing
 * and the real list arrives on hydrate. A frozen constant, not a fresh array:
 * `useSyncExternalStore` re-invokes this on every server render and a new
 * identity each time is an infinite loop.
 */
export function getServerToolRegistry(): readonly ToolDescriptor[] {
  return EMPTY_TOOLS;
}

/** Test waist. Production code never empties the registry. */
export function resetToolRegistry(): void {
  entries.clear();
  recompute();
  emit();
}
