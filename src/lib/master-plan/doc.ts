/**
 * Master-plan Y.Doc factory (ALP-1.3) — the CRDT shape contract.
 *
 * ONE `Y.Doc` per plane (web client, sync daemon, tests) holding a single
 * `Y.Text('content')` with the raw master-plan MDX string. Nothing else lives
 * in the doc — the file `master-plan.mdx` is the local SoT and Neon never
 * stores the live CRDT blob (locked decision, master plan §-2).
 */

import * as Y from 'yjs';

/** The one Y.Text key. Every plane MUST read/write through this constant. */
export const MASTER_PLAN_YTEXT_KEY = 'content';

/**
 * Fixed clientID used ONLY for empty-doc seeding. Because the seed update is
 * generated from a fresh doc with this constant clientID, two peers that race
 * to bootstrap the same starter string produce byte-identical updates, and
 * applying the same update twice is a Yjs no-op — the race is idempotent by
 * construction. (Race policy: seeders MUST fetch the seed string from the same
 * canonical source — the starter MDX — before calling createSeedUpdate.)
 */
export const MASTER_PLAN_SEED_CLIENT_ID = 0x00c0ffee;

/** Transaction origin used when applying a bootstrap seed update. */
export const SEED_APPLY_ORIGIN = 'master-plan:seed';

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export function createMasterPlanYDoc(): Y.Doc {
  return new Y.Doc();
}

export function getMasterPlanText(doc: Y.Doc): Y.Text {
  return doc.getText(MASTER_PLAN_YTEXT_KEY);
}

export function readMasterPlan(doc: Y.Doc): string {
  return getMasterPlanText(doc).toString();
}

export function isMasterPlanEmpty(doc: Y.Doc): boolean {
  return getMasterPlanText(doc).length === 0;
}

/**
 * Deterministic empty-doc bootstrap update (ALP-1.4). See
 * MASTER_PLAN_SEED_CLIENT_ID for why this is race-safe. Apply with
 * `Y.applyUpdate(doc, update, origin)` only when the doc is still empty.
 */
export function createSeedUpdate(mdx: string): Uint8Array {
  const seedDoc = new Y.Doc();
  seedDoc.clientID = MASTER_PLAN_SEED_CLIENT_ID;
  seedDoc.getText(MASTER_PLAN_YTEXT_KEY).insert(0, mdx);
  const update = Y.encodeStateAsUpdate(seedDoc);
  seedDoc.destroy();
  return update;
}

/**
 * Minimal-diff replace: applies `next` to the doc as a single
 * delete+insert of only the changed middle span (common prefix/suffix kept).
 * Used by the daemon's upstream path (file save → doc) and the plan-agent's
 * mutate tool, so concurrent remote edits outside the changed span survive.
 * Pass an `origin` so provider echo suppression can identify the source.
 */
export function applyMasterPlanReplace(doc: Y.Doc, next: string, origin?: unknown): boolean {
  const text = getMasterPlanText(doc);
  const prev = text.toString();
  if (prev === next) return false;

  let start = 0;
  const maxStart = Math.min(prev.length, next.length);
  while (start < maxStart && prev.charCodeAt(start) === next.charCodeAt(start)) start += 1;
  // Don't cut between a surrogate pair (an emoji / astral char is 2 UTF-16
  // units): if the boundary landed on a low surrogate, back up one so the
  // whole code point stays intact — a split pair corrupts to U+FFFD and
  // permanently diverges peers.
  if (start > 0 && isLowSurrogate(prev.charCodeAt(start))) start -= 1;

  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)) {
    endPrev -= 1;
    endNext -= 1;
  }
  // Same guard on the suffix boundary: if it split a pair, extend by one unit.
  if (endPrev < prev.length && isLowSurrogate(prev.charCodeAt(endPrev))) {
    endPrev += 1;
    endNext += 1;
  }

  doc.transact(() => {
    if (endPrev > start) text.delete(start, endPrev - start);
    if (endNext > start) text.insert(start, next.slice(start, endNext));
  }, origin);
  return true;
}
