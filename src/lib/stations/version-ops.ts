/**
 * Station version operations — pure functions over `StationConfig` that back
 * restore and cherry-pick. No DB, no React: a version is data, and moving a
 * block instance from one version into another is a merge of two JSON slot
 * maps keyed on the instance id (`BlockInstanceConfig.id` is stable across
 * versions by construction — the builder mints it once and never re-mints).
 *
 * The result is always a NEW config: inputs are never mutated, so a caller can
 * hold the base and the source versions and preview the merge before saving it
 * as a draft (`draft-store.ts`) and publishing it (`/api/stations/publish`).
 */

import type { BlockInstanceConfig, SlotId, StationConfig } from './contract';
import { SLOT_IDS } from './contract';

type SlotMap = Partial<Record<SlotId, BlockInstanceConfig[]>>;

export interface BlockLocation {
  slot: SlotId;
  index: number;
  instance: BlockInstanceConfig;
}

export interface CherryPickResult {
  config: StationConfig;
  /** Instance ids that were found in `from` and landed in the result. */
  picked: string[];
  /** Instance ids not present in `from` (nothing to pick). */
  missing: string[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function slotMapOf(config: StationConfig): SlotMap {
  return config.slots === 'legacy' ? {} : config.slots;
}

/** Every block instance in a config with its slot and position. */
export function listBlockInstances(config: StationConfig): BlockLocation[] {
  const slots = slotMapOf(config);
  const out: BlockLocation[] = [];
  for (const slot of SLOT_IDS) {
    (slots[slot] ?? []).forEach((instance, index) => out.push({ slot, index, instance }));
  }
  return out;
}

/** Where an instance id lives in a config, or null. */
export function findBlockInstance(config: StationConfig, id: string): BlockLocation | null {
  return listBlockInstances(config).find((b) => b.instance.id === id) ?? null;
}

/**
 * Deep copy of a version's config — what "restore" saves as the next draft.
 * A restored config is a new version, never the old row re-activated, so the
 * version log stays linear and the history reads top to bottom.
 */
export function restoreConfig(from: StationConfig): StationConfig {
  return clone(from);
}

/**
 * Lift the named block instances from `from` into `base`.
 *
 * - An id present in both replaces the base instance IN PLACE (same slot, same
 *   position) — "take this block's config from version N".
 * - An id only in `from` is appended to the slot it occupied there — "bring
 *   back the block version N had".
 * - An id in neither is reported in `missing` and otherwise ignored.
 * - A `legacy` base becomes a real slot map; a `legacy` source has nothing to
 *   pick, so every id is missing.
 *
 * Registry validation is NOT done here — the caller runs
 * `validateStationConfig` before saving, exactly as the builder does.
 */
export function cherryPickBlocks(
  base: StationConfig,
  from: StationConfig,
  blockIds: readonly string[],
): CherryPickResult {
  const result: SlotMap = clone(slotMapOf(base));
  const source = slotMapOf(from);
  const picked: string[] = [];
  const missing: string[] = [];

  for (const id of blockIds) {
    const found = listBlockInstances({ slots: source }).find((b) => b.instance.id === id);
    if (!found) {
      missing.push(id);
      continue;
    }
    const incoming = clone(found.instance);
    const existing = listBlockInstances({ slots: result }).find((b) => b.instance.id === id);
    if (existing) {
      result[existing.slot]![existing.index] = incoming;
    } else {
      result[found.slot] = [...(result[found.slot] ?? []), incoming];
    }
    picked.push(id);
  }

  return { config: { slots: result }, picked, missing };
}
