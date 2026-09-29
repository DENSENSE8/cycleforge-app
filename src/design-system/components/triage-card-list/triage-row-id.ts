/**
 * The triage face speaks numeric record ids (selection, the record cursor,
 * `data-desk-record-key`); a family keyed by a string (a UUID, `scan-<id>`)
 * hashes its key to one. The id is a 53-bit hash of the key (cyrb53), NOT a
 * first-seen counter: the rows render on the server too, and a counter there
 * (one per process) and in the browser (one per tab) would hand the same row
 * two ids and break hydration.
 */
export function triageRowKeyId(key: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  // Positive: the face drops ids ≤ 0 from the visible set.
  return 4294967296 * (2097151 & h2) + (h1 >>> 0) || 1;
}
