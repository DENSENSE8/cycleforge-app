#!/usr/bin/env node
/**
 * Hardware wall — interaction-contract firewall for the fork hunter.
 *
 * jscpd ignore globs cannot express "A vs B": excluding both trees would also
 * stop detecting clones *within* station and *within* support. This module
 * classifies a path as floor (scanner / act-and-clear) or desk (pointer /
 * URL-addressable) and drops only the pairwise clones that cross that divide.
 *
 * Shared plumbing (design-system primitives, stream hooks, grid engine) is
 * unclassified — clones there still fail the shrink-only baseline.
 */
export const HARDWARE_FLOOR_PREFIXES = ['src/components/station/'];

export const HARDWARE_DESK_PREFIXES = ['src/components/support/'];

/**
 * @param {string} relPath
 * @returns {'floor' | 'desk' | null}
 */
export function hardwareSide(relPath) {
  const rel = String(relPath ?? '').replaceAll('\\', '/');
  if (HARDWARE_FLOOR_PREFIXES.some((p) => rel.startsWith(p))) return 'floor';
  if (HARDWARE_DESK_PREFIXES.some((p) => rel.startsWith(p))) return 'desk';
  return null;
}

/**
 * @param {string} a
 * @param {string} b
 */
export function isCrossHardwareClone(a, b) {
  const sa = hardwareSide(a);
  const sb = hardwareSide(b);
  return sa != null && sb != null && sa !== sb;
}

/**
 * @param {Array<{ firstFile?: { name?: string }, secondFile?: { name?: string }, lines?: number }>} duplicates
 */
export function filterHardwareWallClones(duplicates) {
  return duplicates.filter(
    (d) =>
      !isCrossHardwareClone(d.firstFile?.name ?? '', d.secondFile?.name ?? ''),
  );
}

/**
 * @param {Array<{ lines?: number }>} duplicates
 */
export function tallyDuplicates(duplicates) {
  return {
    clones: duplicates.length,
    duplicatedLines: duplicates.reduce((n, d) => n + Number(d.lines ?? 0), 0),
  };
}
