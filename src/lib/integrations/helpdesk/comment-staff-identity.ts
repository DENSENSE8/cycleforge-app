export interface StaffAuthorHit {
  staffId: number;
  name: string;
}

/**
 * Resolve a comment's Cycle Forge author, strongest evidence first:
 *
 *   1. `helpdesk_comment_staff` — the row written when WE posted it.
 *   2. The author's email matching a staff row.
 *   3. The `— {name}` sign-off an app-written internal note carries.
 *
 * (3) exists because (1) is best-effort: the stamp runs after the post inside a
 * swallowed try/catch, and tickets filed before the mapping table have no row
 * at all. Without it those threads attribute every app note to the Zendesk API
 * user and read "Manager". It is consulted LAST and an ambiguous name is
 * dropped upstream — see {@link staffAuthorsByName}.
 */
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

/**
 * True when the first comment is ours (filed from Cycle Forge via the API
 * user), not a customer message that happened to get `created_by` because
 * someone later linked the ticket.
 *
 * Zendesk often sets `requester_id` to the API agent ("Manager") on tickets
 * we create — that is NOT a customer opener.
 */
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
