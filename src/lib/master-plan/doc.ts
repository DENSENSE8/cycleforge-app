/** Master-plan Y.Doc factory (ALP-1.3) — the CRDT shape contract. */

import * as Y from 'yjs';

/** The one Y.Text key. Every plane MUST read/write through this constant. */
export const MASTER_PLAN_YTEXT_KEY = 'content';

/** Fixed clientID used ONLY for empty-doc seeding. */
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

/** Minimal-diff replace: */
export function applyMasterPlanReplace(doc: Y.Doc, next: string, origin?: unknown): boolean {
  const text = getMasterPlanText(doc);
  const prev = text.toString();
  if (prev === next) return false;

  let start = 0;
  const maxStart = Math.min(prev.length, next.length);
  while (start < maxStart && prev.charCodeAt(start) === next.charCodeAt(start)) start += 1;
  // Don't cut between a surrogate pair (an emoji / astral char is 2 UTF-16 units):
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
