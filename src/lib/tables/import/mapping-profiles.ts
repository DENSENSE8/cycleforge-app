/**
 * Named import mapping profiles — "map this supplier's file once".
 *
 * The import surface already maps their column to our field: an alias
 * auto-map, an AI suggestion pass for what the aliases miss, a live unmapped
 * count, and a commit gated on the required fields. What it does not do is
 * **remember**, so the same supplier's file is mapped by hand every week — the
 * one part of the flow whose cost scales with how much the feature is used.
 *
 * A profile is a name, the header set it was learned from, and the mapping.
 * Matching is by HEADERS, not by filename: `orders-2026-10.csv` and
 * `orders-2026-11.csv` are the same supplier, and `export (3).csv` is not a
 * fact about anything.
 *
 * Pure and dependency-free — no React, no fetch, no DB — so it runs under
 * `node --test` with zero setup. Persistence is the caller's problem; these
 * live in the `organizations.settings` passthrough bag beside `tableLayouts`,
 * which is why this ships without a migration.
 */

export interface ImportMappingProfile {
  /** Operator's words — "Supplier — October". Unique per surface, case-insensitively. */
  name: string;
  /** The header row this was learned from, normalized. Drives matching. */
  headers: readonly string[];
  /** our field id → their column header. */
  mapping: Readonly<Record<string, string>>;
  /** ISO stamp, for "most recently used wins" among equal matches. */
  updatedAt: string;
}

/**
 * How confident a match is — the operator sees the difference.
 *
 * `exact` applies silently; `partial` applies but says so, because a file with
 * extra or missing columns may map a field to a header that means something
 * else this time. Below {@link PARTIAL_MATCH_FLOOR} nothing is offered at all:
 * a wrong mapping applied confidently is worse than no mapping, and the alias
 * auto-map is already the floor this would be competing with.
 */
export type ProfileMatchKind = 'exact' | 'partial';

export interface ProfileMatch {
  profile: ImportMappingProfile;
  kind: ProfileMatchKind;
  /** 0–1 — the share of the profile's headers this file actually has. */
  coverage: number;
}

/** Below this share of the profile's headers, a match is not offered. */
export const PARTIAL_MATCH_FLOOR = 0.6;

/**
 * Normalize one header for comparison — case, surrounding space and the
 * zero-width junk a spreadsheet export leaves behind.
 *
 * Deliberately NOT aggressive: `Order #` and `Order Number` stay different,
 * because collapsing them is the alias map's job and doing it twice, with two
 * different rulesets, is how the two would disagree.
 */
export function normalizeHeader(header: string): string {
  return header.replace(/﻿/g, '').trim().toLowerCase();
}

/**
 * A stable identity for a header ROW — sorted, so column reordering between
 * exports is not a different supplier.
 */
export function headerSignature(headers: readonly string[]): string {
  return [...new Set(headers.map(normalizeHeader))]
    .filter(Boolean)
    .sort()
    .join('');
}

/**
 * The best profile for this file's headers, or null.
 *
 * Exact signature first; otherwise the highest coverage above the floor, with
 * the most recently updated profile winning a tie — the supplier you worked
 * with last is the one you are most likely working with now.
 */
export function matchProfile(
  profiles: readonly ImportMappingProfile[],
  headers: readonly string[],
): ProfileMatch | null {
  if (profiles.length === 0 || headers.length === 0) return null;

  const fileSignature = headerSignature(headers);
  const fileHeaders = new Set(headers.map(normalizeHeader));

  let best: ProfileMatch | null = null;

  for (const profile of profiles) {
    if (headerSignature(profile.headers) === fileSignature) {
      return { profile, kind: 'exact', coverage: 1 };
    }

    const known = [...new Set(profile.headers.map(normalizeHeader))].filter(Boolean);
    if (known.length === 0) continue;
    const hits = known.filter((h) => fileHeaders.has(h)).length;
    const coverage = hits / known.length;
    if (coverage < PARTIAL_MATCH_FLOOR) continue;

    if (
      !best ||
      coverage > best.coverage ||
      (coverage === best.coverage && profile.updatedAt > best.profile.updatedAt)
    ) {
      best = { profile, kind: 'partial', coverage };
    }
  }

  return best;
}

/**
 * The mapping a profile yields FOR THIS FILE.
 *
 * Every binding whose header is absent is dropped rather than kept: a mapping
 * that names a column the file does not have reads as mapped in the UI and
 * resolves to blank in every row — the failure mode of a saved mapping that
 * "mostly" fits. Dropping it puts the field back in the unmapped count, which
 * is where the operator will actually see it.
 */
export function applyProfile(
  profile: ImportMappingProfile,
  headers: readonly string[],
): Record<string, string> {
  // Map normalized → the file's ACTUAL spelling, so what lands in the draft
  // matches the header the parser will look up.
  const actual = new Map<string, string>();
  for (const header of headers) {
    const key = normalizeHeader(header);
    if (key && !actual.has(key)) actual.set(key, header);
  }

  const out: Record<string, string> = {};
  for (const [field, header] of Object.entries(profile.mapping)) {
    const hit = actual.get(normalizeHeader(header));
    if (hit) out[field] = hit;
  }
  return out;
}

/**
 * Insert or replace by NAME, case-insensitively — saving over a name the
 * operator already used is an update, never a second row they then have to
 * tell apart.
 */
export function upsertProfile(
  profiles: readonly ImportMappingProfile[],
  next: ImportMappingProfile,
): ImportMappingProfile[] {
  const key = next.name.trim().toLowerCase();
  if (!key) return [...profiles];
  const kept = profiles.filter((p) => p.name.trim().toLowerCase() !== key);
  return [...kept, { ...next, name: next.name.trim() }];
}

export function removeProfile(
  profiles: readonly ImportMappingProfile[],
  name: string,
): ImportMappingProfile[] {
  const key = name.trim().toLowerCase();
  return profiles.filter((p) => p.name.trim().toLowerCase() !== key);
}

/**
 * Shape-read a stored blob. Anything that is not a profile is DROPPED, not
 * repaired — the same contract `readStoredSlotLayout` follows for layouts,
 * because a half-understood mapping silently writing the wrong column into
 * live orders is the one outcome worth being strict about.
 */
export function readStoredProfiles(raw: unknown): ImportMappingProfile[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportMappingProfile[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    if (!Array.isArray(row.headers)) continue;
    const headers = row.headers.filter((h): h is string => typeof h === 'string');
    if (headers.length === 0) continue;
    if (!row.mapping || typeof row.mapping !== 'object' || Array.isArray(row.mapping)) continue;

    const mapping: Record<string, string> = {};
    for (const [field, header] of Object.entries(row.mapping as Record<string, unknown>)) {
      if (typeof header === 'string' && header) mapping[field] = header;
    }
    if (Object.keys(mapping).length === 0) continue;

    out.push({
      name,
      headers,
      mapping,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  return out;
}
