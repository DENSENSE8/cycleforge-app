/**
 * Which stages a record pipeline should paint.
 *
 * The mapper may declare the full station path (Tested · Packed · Scanned Out),
 * but the run only shows stamps that exist plus the true next queue — never a
 * skipped stage pretending to be live, and never dim future stages past that.
 *
 * Examples:
 *   none stamped            → [Ready to test]
 *   tested only             → [Tested, Ready to pack]
 *   packed + scanned, no test → [Packed, Scanned Out]  (Tested omitted)
 *   packed only, no test    → [Packed, Ready to ship]
 *   all stamped             → all three
 */

export function hasMilestoneStamp(at: string | null | undefined): boolean {
  const raw = at == null ? '' : String(at).trim();
  return Boolean(raw) && raw !== '1';
}

export function selectVisibleMilestones<T extends { at: string | null }>(
  milestones: ReadonlyArray<T>,
): T[] {
  if (milestones.length === 0) return [];

  const done = milestones.map((m) => hasMilestoneStamp(m.at));
  const lastDone = done.lastIndexOf(true);
  // Next queue starts after the furthest stamp — an earlier hole is a skip,
  // not the live stage. With no stamps yet, the first stage is the queue.
  const nextIdx =
    lastDone === -1 ? done.indexOf(false) : done.indexOf(false, lastDone + 1);

  return milestones.filter((_, i) => done[i] || i === nextIdx);
}
