import 'server-only';

/**
 * Task document comments, bound to the real tables. A document's comments are
 * ONE `entity_threads` row (`TASK_DOCUMENT`, entity_id = the document id) and
 * its `thread_messages` — the house conversation pair, not a second comments
 * table (P6: comments anchor to the document, attributed).
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  deleteThreadMessage,
  getOrCreateThread,
  listThreadMessages,
  patchThreadMessageMeta,
  postThreadMessage,
  resolveThreadForEntity,
} from '@/lib/threads/threads';
import {
  TASK_DOC_COMMENT_QUOTE_MAX,
  taskDocCommentFromMessage,
  type TaskDocComment,
  type TaskDocCommentCreateBody,
} from './task-document-comments-shared';

const ANCHOR = 'TASK_DOCUMENT';

export type TaskDocCommentRefusal = 'document_not_found' | 'comment_not_found' | 'not_author';

/** True when the document hangs off this task in this org — the gate every verb passes first. */
async function documentOnTask(orgId: OrgId, taskId: number, docId: number): Promise<boolean> {
  const res = await tenantQuery(
    orgId,
    `SELECT 1 FROM work_assignment_documents
      WHERE organization_id = $1::uuid AND assignment_id = $2 AND id = $3`,
    [orgId, taskId, docId],
  );
  return res.rows.length > 0;
}

/** Comments on one document, oldest first (empty when nobody has commented yet). */
export async function listTaskDocComments(
  orgId: OrgId,
  taskId: number,
  docId: number,
): Promise<{ ok: true; comments: TaskDocComment[] } | { ok: false; reason: TaskDocCommentRefusal }> {
  if (!(await documentOnTask(orgId, taskId, docId))) return { ok: false, reason: 'document_not_found' };
  const thread = await resolveThreadForEntity({ orgId, entityType: ANCHOR, entityId: docId });
  if (!thread) return { ok: true, comments: [] };
  const listed = await listThreadMessages({ orgId, threadId: thread.id, limit: 200 });
  return { ok: true, comments: listed.ok ? listed.messages.map(taskDocCommentFromMessage) : [] };
}

/** Post one comment; the first comment on a document opens its thread. */
export async function postTaskDocComment(
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  body: TaskDocCommentCreateBody,
): Promise<{ ok: true; comment: TaskDocComment; created: boolean } | { ok: false; reason: TaskDocCommentRefusal }> {
  if (!(await documentOnTask(orgId, taskId, body.docId))) return { ok: false, reason: 'document_not_found' };
  const thread = await getOrCreateThread({ orgId, entityType: ANCHOR, entityId: body.docId, createdBy: staffId });
  if (!thread.ok) return { ok: false, reason: 'document_not_found' };

  const quote = body.quote?.trim().slice(0, TASK_DOC_COMMENT_QUOTE_MAX) || null;
  const posted = await postThreadMessage({
    orgId,
    threadId: thread.thread.id,
    authorStaffId: staffId,
    body: body.body.trim(),
    clientEventId: body.clientEventId ?? null,
    meta: { docId: body.docId, quote, headingSlug: body.headingSlug?.trim() || null },
  });
  if (!posted.ok) return { ok: false, reason: 'document_not_found' };
  // The fresh insert has no joined author name; the client paints it from the staff directory.
  return { ok: true, comment: taskDocCommentFromMessage(posted.message), created: !posted.idempotent };
}

/** Resolve (or reopen) one comment — anyone on the task may close a discussion. */
export async function resolveTaskDocComment(
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  docId: number,
  commentId: number,
  resolved: boolean,
): Promise<{ ok: true; comment: TaskDocComment } | { ok: false; reason: TaskDocCommentRefusal }> {
  if (!(await documentOnTask(orgId, taskId, docId))) return { ok: false, reason: 'document_not_found' };
  const thread = await resolveThreadForEntity({ orgId, entityType: ANCHOR, entityId: docId });
  if (!thread) return { ok: false, reason: 'comment_not_found' };
  const patched = await patchThreadMessageMeta({
    orgId,
    threadId: thread.id,
    messageId: commentId,
    patch: resolved
      ? { resolvedAt: new Date().toISOString(), resolvedByStaffId: staffId }
      : { resolvedAt: null, resolvedByStaffId: null },
  });
  if (!patched.ok) return { ok: false, reason: 'comment_not_found' };
  return { ok: true, comment: taskDocCommentFromMessage(patched.message) };
}

/** Remove one comment (soft delete — the spine row stays); author only. */
export async function deleteTaskDocComment(
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  docId: number,
  commentId: number,
): Promise<{ ok: true; changed: boolean } | { ok: false; reason: TaskDocCommentRefusal }> {
  if (!(await documentOnTask(orgId, taskId, docId))) return { ok: false, reason: 'document_not_found' };
  const thread = await resolveThreadForEntity({ orgId, entityType: ANCHOR, entityId: docId });
  if (!thread) return { ok: false, reason: 'comment_not_found' };
  const removed = await deleteThreadMessage({ orgId, threadId: thread.id, messageId: commentId, actorStaffId: staffId });
  if (!removed.ok) return { ok: false, reason: removed.status === 403 ? 'not_author' : 'comment_not_found' };
  return { ok: true, changed: !removed.idempotent };
}
