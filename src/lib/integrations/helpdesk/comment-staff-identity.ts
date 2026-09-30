export interface StaffAuthorHit {
  staffId: number;
  name: string;
}

/** Staff rows → hits keyed by lowercased email; the first row per email wins. */
export function staffHitsByEmail(
  rows: ReadonlyArray<{ id: number; name: string; email: string | null }>,
): Map<string, StaffAuthorHit> {
  const out = new Map<string, StaffAuthorHit>();
  for (const row of rows) {
    const key = (row.email ?? '').trim().toLowerCase();
    if (!key || out.has(key)) continue;
    out.set(key, { staffId: Number(row.id), name: row.name });
  }
  return out;
}

/** Staff rows → hits keyed by lowercased name. A name two staff share is ambiguous and dropped. */
export function staffHitsByName(
  rows: ReadonlyArray<{ id: number; name: string }>,
): Map<string, StaffAuthorHit> {
  const out = new Map<string, StaffAuthorHit>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    const key = row.name.trim().toLowerCase();
    if (!key) continue;
    if (out.has(key)) {
      ambiguous.add(key);
      continue;
    }
    out.set(key, { staffId: Number(row.id), name: row.name });
  }
  for (const key of ambiguous) out.delete(key);
  return out;
}

/** Resolve a comment's Cycle Forge author, strongest evidence first: */
export function applyStaffAuthor<
  T extends {
    id: number;
    body?: string | null;
    author_email?: string | null;
    author_name?: string;
    author_photo?: string | null;
    author_staff_id?: number | null;
  },
>(
  comment: T,
  byCommentId: Map<number, StaffAuthorHit>,
  byEmail: Map<string, StaffAuthorHit>,
  byName: Map<string, StaffAuthorHit> = new Map(),
): T {
  const mapped = byCommentId.get(comment.id);
  const email = (comment.author_email ?? '').trim().toLowerCase();
  const signed = staffNameFromNoteSignature(comment.body ?? '');
  const hit =
    mapped ??
    (email ? byEmail.get(email) : undefined) ??
    (signed ? byName.get(signed.trim().toLowerCase()) : undefined);
  if (!hit) return comment;
  return {
    ...comment,
    author_staff_id: hit.staffId,
    author_name: hit.name,
    author_photo: null,
  };
}

/** Internal notes from the app are signed `— {staffName}`. Null when unsigned. */
export function staffNameFromNoteSignature(body: string): string | null {
  const m = /(?:^|\n)—\s+([^\n]+)\s*$/.exec(body.trimEnd());
  const name = m?.[1]?.trim() ?? '';
  return name || null;
}

/** True when the first comment is ours (filed from Cycle Forge via the API user), not a customer message that happened to get `created_by`… */
export function isAppFiledOpener(opts: {
  openingAuthorId: number;
  requesterId: number | null;
  openingPublic: boolean;
  agentIds: ReadonlySet<number>;
}): boolean {
  if (!opts.openingPublic) return true;
  if (opts.agentIds.has(opts.openingAuthorId)) return true;
  if (opts.requesterId != null && opts.openingAuthorId === opts.requesterId) return false;
  return true;
}
