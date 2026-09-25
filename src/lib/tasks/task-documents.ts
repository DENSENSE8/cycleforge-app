/**
 * Task **documents** — the pure half: which refusal a create body earns, how a
 * `repo` document is read live, and the SQL-row mapper. No fs, no pool: the
 * org-bound seam ({@link TaskDocumentsDeps}) is supplied by
 * `task-documents-db.ts`, so every branch here unit-tests DB- and disk-free.
 *
 * Wire shapes live in `task-documents-shared.ts`.
 */

import type { PlanFileRead } from './plan-files';
import {
  TASK_DOCUMENT_CONTENT_MAX,
  TASK_DOCUMENT_SOURCES,
  type TaskDocument,
  type TaskDocumentCreateBody,
  type TaskDocumentMeta,
  type TaskDocumentSource,
} from './task-documents-shared';

export type TaskDocumentRefusal =
  | 'task_not_found'
  | 'document_not_found'
  | 'invalid_path'
  | 'file_not_found'
  | 'content_too_long'
  | 'empty_content';

export interface NewTaskDocumentRow {
  taskId: number;
  source: TaskDocumentSource;
  title: string;
  /** `upload` only. */
  content: string | null;
  /** `repo` only. */
  repoPath: string | null;
  createdByStaffId: number | null;
}

/** One document row as read — meta, plus the upload text when asked for. */
export interface TaskDocumentRecord {
  meta: TaskDocumentMeta;
  /** The stored text of an `upload`, when read `withContent`; null otherwise. */
  content: string | null;
}

/** The removed row's face, for the audit trail. */
export interface RemovedTaskDocument {
  source: TaskDocumentSource;
  title: string;
  repoPath: string | null;
}

/** Org-scoped seam. Every method is already bound to the caller's org. */
export interface TaskDocumentsDeps {
  /** True when the id is a FOLLOW_UP task in this org. */
  taskExists(taskId: number): Promise<boolean>;
  /** The plan file as it is now (`plan-files.ts`). */
  readPlanFile(path: string): Promise<PlanFileRead>;
  /** Bytes of a linkable plan file, or null when it is gone. */
  statPlanFile(path: string): Promise<number | null>;
  /**
   * INSERT; a `repo` row is ON CONFLICT DO NOTHING on (org, task, repo_path).
   * The landed id with `created: true`, the existing repo row with
   * `created: false`, or null when neither exists (task deleted mid-call).
   */
  insertDocument(row: NewTaskDocumentRow): Promise<{ id: number; created: boolean } | null>;
  /** Documents on one task, oldest first; `docId` narrows to one row. */
  readDocuments(
    taskId: number,
    opts?: { docId?: number; withContent?: boolean },
  ): Promise<TaskDocumentRecord[]>;
  /** DELETE … RETURNING; the removed row's face, or null when nothing matched. */
  deleteDocument(taskId: number, docId: number): Promise<RemovedTaskDocument | null>;
}

export type CreateTaskDocumentResult =
  | {
      ok: true;
      /** false when the same plan file was already linked — the idempotent replay. */
      created: boolean;
      document: TaskDocumentMeta;
    }
  | { ok: false; reason: TaskDocumentRefusal };

export type GetTaskDocumentResult =
  | { ok: true; document: TaskDocument }
  | { ok: false; reason: 'task_not_found' | 'document_not_found' };

/**
 * Code points, as Postgres `char_length` counts them — the unit the
 * `work_assignment_documents_source_chk` ceiling is written in.
 */
function codePointLength(text: string): number {
  let count = text.length;
  for (let i = 1; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    const prev = text.charCodeAt(i - 1);
    // A high+low surrogate pair is one code point in two UTF-16 units.
    if (unit >= 0xdc00 && unit <= 0xdfff && prev >= 0xd800 && prev <= 0xdbff) count -= 1;
  }
  return count;
}

/** Fill `sizeBytes` for `repo` rows from the file on disk now (null when gone). */
async function withRepoSizes(
  metas: TaskDocumentMeta[],
  deps: TaskDocumentsDeps,
): Promise<TaskDocumentMeta[]> {
  return Promise.all(
    metas.map(async (meta) =>
      meta.source === 'repo' && meta.repoPath
        ? { ...meta, sizeBytes: await deps.statPlanFile(meta.repoPath) }
        : meta,
    ),
  );
}

/** Documents on one task (meta only), or null when the id is not a task in this org. */
export async function listTaskDocuments(
  taskId: number,
  deps: TaskDocumentsDeps,
): Promise<TaskDocumentMeta[] | null> {
  if (!(await deps.taskExists(taskId))) return null;
  const records = await deps.readDocuments(taskId);
  return withRepoSizes(
    records.map((record) => record.meta),
    deps,
  );
}

/**
 * One document with its markdown. An `upload` answers its stored text; a
 * `repo` document reads the plan file NOW — `content: null` when it is gone.
 */
export async function getTaskDocument(
  taskId: number,
  docId: number,
  deps: TaskDocumentsDeps,
): Promise<GetTaskDocumentResult> {
  if (!(await deps.taskExists(taskId))) return { ok: false, reason: 'task_not_found' };
  const [record] = await deps.readDocuments(taskId, { docId, withContent: true });
  if (!record) return { ok: false, reason: 'document_not_found' };

  if (record.meta.source === 'upload') {
    return { ok: true, document: { ...record.meta, content: record.content ?? '' } };
  }
  const read = record.meta.repoPath ? await deps.readPlanFile(record.meta.repoPath) : null;
  return {
    ok: true,
    document: read?.ok
      ? { ...record.meta, sizeBytes: read.sizeBytes, content: read.content }
      : { ...record.meta, sizeBytes: null, content: null },
  };
}

/**
 * Attach one document. `upload` stores the text; `repo` stores only the
 * gated path, titled by the file's first heading. Linking the same plan file
 * twice inserts nothing and answers the existing row with `created: false`.
 */
export async function createTaskDocument(
  taskId: number,
  staffId: number | null,
  body: TaskDocumentCreateBody,
  deps: TaskDocumentsDeps,
): Promise<CreateTaskDocumentResult> {
  if (!(await deps.taskExists(taskId))) return { ok: false, reason: 'task_not_found' };

  let row: NewTaskDocumentRow;
  let repoSize: number | null = null;
  if (body.source === 'upload') {
    if (body.content.trim().length === 0) return { ok: false, reason: 'empty_content' };
    // UTF-16 length bounds the code-point count from above, so only an
    // over-long string pays for the exact count.
    if (body.content.length > TASK_DOCUMENT_CONTENT_MAX && codePointLength(body.content) > TASK_DOCUMENT_CONTENT_MAX) {
      return { ok: false, reason: 'content_too_long' };
    }
    row = {
      taskId,
      source: 'upload',
      title: body.title.trim(),
      content: body.content,
      repoPath: null,
      createdByStaffId: staffId,
    };
  } else {
    const read = await deps.readPlanFile(body.path);
    if (!read.ok) return { ok: false, reason: read.reason };
    repoSize = read.sizeBytes;
    row = {
      taskId,
      source: 'repo',
      title: read.title,
      content: null,
      repoPath: read.path,
      createdByStaffId: staffId,
    };
  }

  const landed = await deps.insertDocument(row);
  const [record] = landed ? await deps.readDocuments(taskId, { docId: landed.id }) : [];
  if (!landed || !record) {
    // Inserted (or already present) and then not readable: the task was
    // deleted mid-call, taking the document with it through the FK cascade.
    return { ok: false, reason: 'task_not_found' };
  }
  const document = row.source === 'repo' ? { ...record.meta, sizeBytes: repoSize } : record.meta;
  return { ok: true, created: landed.created, document };
}

/**
 * Remove one document. `changed: false` (removed null) when it was already
 * gone — a double-tapped remove; null when the task itself is not in this org.
 */
export async function deleteTaskDocument(
  taskId: number,
  docId: number,
  deps: TaskDocumentsDeps,
): Promise<{ changed: boolean; removed: RemovedTaskDocument | null } | null> {
  if (!(await deps.taskExists(taskId))) return null;
  const removed = await deps.deleteDocument(taskId, docId);
  return { changed: removed != null, removed };
}

// ── row mapping ─────────────────────────────────────────────────────────────

/** The columns `task-documents-db.ts` selects. Kept here so the mapper is testable. */
export interface TaskDocumentSqlRow {
  id: unknown;
  assignment_id: unknown;
  source: unknown;
  title: unknown;
  repo_path: unknown;
  /** `octet_length(content)` for uploads; NULL for repo rows. */
  size_bytes: unknown;
  /** Only when read `withContent`. */
  content: unknown;
  created_at: unknown;
  created_by_staff_id: unknown;
  created_by_name: unknown;
}

function intOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** One SQL row → one record; null for a source the TS does not know. */
export function mapTaskDocumentRow(raw: Record<string, unknown>): TaskDocumentRecord | null {
  const row = raw as unknown as TaskDocumentSqlRow;
  const source = TASK_DOCUMENT_SOURCES.find((s) => s === row.source);
  const id = intOrNull(row.id);
  const taskId = intOrNull(row.assignment_id);
  if (!source || id == null || taskId == null) return null;

  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : new Date(String(row.created_at)).toISOString();
  const createdById = intOrNull(row.created_by_staff_id);
  const createdByName = row.created_by_name == null ? '' : String(row.created_by_name).trim();

  return {
    meta: {
      id,
      taskId,
      source,
      title: String(row.title ?? ''),
      repoPath: source === 'repo' && row.repo_path != null ? String(row.repo_path) : null,
      sizeBytes: source === 'upload' ? intOrNull(row.size_bytes) : null,
      createdAt,
      createdBy: createdById == null ? null : { id: createdById, name: createdByName || `Staff #${createdById}` },
    },
    content: source === 'upload' && row.content != null ? String(row.content) : null,
  };
}
