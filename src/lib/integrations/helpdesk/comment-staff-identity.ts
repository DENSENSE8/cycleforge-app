export interface StaffAuthorHit {
  staffId: number;
  name: string;
}

/** Prefer a recorded app post, then an email match to a staff row. */
export function applyStaffAuthor<
  T extends {
    id: number;
    author_email?: string | null;
    author_name?: string;
    author_photo?: string | null;
    author_staff_id?: number | null;
  },
>(comment: T, byCommentId: Map<number, StaffAuthorHit>, byEmail: Map<string, StaffAuthorHit>): T {
  const mapped = byCommentId.get(comment.id);
  const email = (comment.author_email ?? '').trim().toLowerCase();
  const hit = mapped ?? (email ? byEmail.get(email) : undefined);
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
