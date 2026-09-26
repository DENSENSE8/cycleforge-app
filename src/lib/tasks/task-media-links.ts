/** Task **media links** — the pure half: */

import {
  MEDIA_LINK_KINDS,
  MEDIA_LINK_PROVIDERS,
  MEDIA_LINK_URL_MAX,
  parseMediaLink,
  type ParsedMediaLink,
  type TaskMediaLink,
  type TaskMediaLinkCreateBody,
  type TaskMediaLinkPatchBody,
} from './media-links';

export type TaskMediaLinkRefusal =
  | 'task_not_found'
  | 'link_not_found'
  | 'invalid_url'
  | 'unsupported_link'
  | 'duplicate_link';

export interface NewTaskMediaLinkRow extends ParsedMediaLink {
  taskId: number;
  title: string | null;
  createdByStaffId: number | null;
}

/** An edit as the seam writes it: a re-parsed link, a caption, or both. */
export interface TaskMediaLinkUpdate {
  /** Present when the URL changed — every derived column moves with it. */
  link?: ParsedMediaLink;
  /** Present when the caption changed; null clears it. */
  title?: string | null;
}

/** Org-scoped seam. Every method is already bound to the caller's org. */
export interface TaskMediaLinksDeps {
  /** True when the id is a FOLLOW_UP task in this org. */
  taskExists(taskId: number): Promise<boolean>;
  /**
   * INSERT … ON CONFLICT (org, task, url) DO NOTHING. The landed id with
   * `created: true`, the existing row with `created: false`, or null when
   * neither exists (task deleted mid-call).
   */
  insertLink(row: NewTaskMediaLinkRow): Promise<{ id: number; created: boolean } | null>;
  /** Links on one task, oldest first; `linkId` narrows to one row. */
  readLinks(taskId: number, opts?: { linkId?: number }): Promise<TaskMediaLink[]>;
  /**
   * UPDATE one link (stamps `updated_at`). `duplicate` when the new URL is
   * already another link on the task; `not_found` when nothing matched.
   */
  updateLink(taskId: number, linkId: number, update: TaskMediaLinkUpdate): Promise<'updated' | 'not_found' | 'duplicate'>;
  /** DELETE … RETURNING; the removed row, or null when nothing matched. */
  deleteLink(taskId: number, linkId: number): Promise<RemovedTaskMediaLink | null>;
}

/** The removed row's face, for the audit trail. */
export interface RemovedTaskMediaLink {
  kind: string;
  provider: string;
  url: string;
  title: string | null;
}

export type CreateTaskMediaLinkResult =
  | {
      ok: true;
      /** false when the same (canonical) URL was already on the task — the idempotent replay. */
      created: boolean;
      link: TaskMediaLink;
    }
  | { ok: false; reason: TaskMediaLinkRefusal };

export type UpdateTaskMediaLinkResult =
  | {
      ok: true;
      /** false when the edit matched what is stored — nothing was written. */
      changed: boolean;
      before: TaskMediaLink;
      link: TaskMediaLink;
    }
  | { ok: false; reason: TaskMediaLinkRefusal };

/** Caption rule: trimmed, and blank means none. Length is the route schema's gate. */
function normalizeMediaLinkTitle(raw: string | null | undefined): string | null {
  const title = raw?.trim() ?? '';
  return title === '' ? null : title;
}

/**
 * The parser's answer, refused when it is not a link we embed. The canonical
 * URL can outgrow the pasted one (`URL.href` percent-encodes), so the column
 * ceiling is re-checked on the answer, not the input.
 */
function parseForStore(raw: string): { ok: true; link: ParsedMediaLink } | { ok: false; reason: TaskMediaLinkRefusal } {
  const parsed = parseMediaLink(raw);
  if (!parsed.ok) return parsed;
  if (parsed.link.url.length > MEDIA_LINK_URL_MAX) return { ok: false, reason: 'invalid_url' };
  return parsed;
}

/** Media links on one task, oldest first; null when the id is not a task in this org. */
export async function listTaskMediaLinks(taskId: number, deps: TaskMediaLinksDeps): Promise<TaskMediaLink[] | null> {
  if (!(await deps.taskExists(taskId))) return null;
  return deps.readLinks(taskId);
}

/**
 * Attach one link. Pasting a URL already on the task (in any of its spellings
 * — `youtu.be/x` and `watch?v=x` canonicalise alike) inserts nothing and
 * answers the existing row with `created: false`.
 */
export async function createTaskMediaLink(
  taskId: number,
  staffId: number | null,
  body: TaskMediaLinkCreateBody,
  deps: TaskMediaLinksDeps,
): Promise<CreateTaskMediaLinkResult> {
  if (!(await deps.taskExists(taskId))) return { ok: false, reason: 'task_not_found' };
  const parsed = parseForStore(body.url);
  if (!parsed.ok) return parsed;

  const landed = await deps.insertLink({
    ...parsed.link,
    taskId,
    title: normalizeMediaLinkTitle(body.title),
    createdByStaffId: staffId,
  });
  const [link] = landed ? await deps.readLinks(taskId, { linkId: landed.id }) : [];
  if (!landed || !link) {
    // Inserted (or already present) and then not readable: the task was
    // deleted mid-call, taking the link with it through the FK cascade.
    return { ok: false, reason: 'task_not_found' };
  }
  return { ok: true, created: landed.created, link };
}

/** Re-point and/or re-title one link. */
export async function updateTaskMediaLink(
  taskId: number,
  linkId: number,
  patch: TaskMediaLinkPatchBody,
  deps: TaskMediaLinksDeps,
): Promise<UpdateTaskMediaLinkResult> {
  if (!(await deps.taskExists(taskId))) return { ok: false, reason: 'task_not_found' };
  const [before] = await deps.readLinks(taskId, { linkId });
  if (!before) return { ok: false, reason: 'link_not_found' };

  const update: TaskMediaLinkUpdate = {};
  if (patch.url !== undefined) {
    const parsed = parseForStore(patch.url);
    if (!parsed.ok) return parsed;
    const next = parsed.link;
    const unchanged =
      next.kind === before.kind &&
      next.provider === before.provider &&
      next.url === before.url &&
      next.embedUrl === before.embedUrl &&
      next.thumbnailUrl === before.thumbnailUrl;
    if (!unchanged) update.link = next;
  }
  if (patch.title !== undefined) {
    const title = normalizeMediaLinkTitle(patch.title);
    if (title !== before.title) update.title = title;
  }
  if (update.link === undefined && update.title === undefined) {
    return { ok: true, changed: false, before, link: before };
  }

  const written = await deps.updateLink(taskId, linkId, update);
  if (written === 'duplicate') return { ok: false, reason: 'duplicate_link' };
  if (written === 'not_found') return { ok: false, reason: 'link_not_found' };
  const [link] = await deps.readLinks(taskId, { linkId });
  if (!link) return { ok: false, reason: 'link_not_found' };
  return { ok: true, changed: true, before, link };
}

/**
 * Remove one link. `changed: false` (removed null) when it was already gone —
 * a double-tapped remove; null when the task itself is not in this org.
 */
export async function deleteTaskMediaLink(
  taskId: number,
  linkId: number,
  deps: TaskMediaLinksDeps,
): Promise<{ changed: boolean; removed: RemovedTaskMediaLink | null } | null> {
  if (!(await deps.taskExists(taskId))) return null;
  const removed = await deps.deleteLink(taskId, linkId);
  return { changed: removed != null, removed };
}

// ── row mapping ─────────────────────────────────────────────────────────────

/** The columns `task-media-links-db.ts` selects. Kept here so the mapper is testable. */
interface TaskMediaLinkSqlRow {
  id: unknown;
  assignment_id: unknown;
  kind: unknown;
  provider: unknown;
  url: unknown;
  embed_url: unknown;
  thumbnail_url: unknown;
  title: unknown;
  created_at: unknown;
  updated_at: unknown;
  created_by_staff_id: unknown;
  created_by_name: unknown;
}

function intOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** One SQL row → one link; null for a kind / provider the TS does not know. */
export function mapTaskMediaLinkRow(raw: Record<string, unknown>): TaskMediaLink | null {
  const row = raw as unknown as TaskMediaLinkSqlRow;
  const kind = MEDIA_LINK_KINDS.find((k) => k === row.kind);
  const provider = MEDIA_LINK_PROVIDERS.find((p) => p === row.provider);
  const id = intOrNull(row.id);
  const taskId = intOrNull(row.assignment_id);
  if (!kind || !provider || id == null || taskId == null) return null;

  const createdById = intOrNull(row.created_by_staff_id);
  const createdByName = row.created_by_name == null ? '' : String(row.created_by_name).trim();

  return {
    id,
    taskId,
    kind,
    provider,
    url: String(row.url ?? ''),
    embedUrl: String(row.embed_url ?? ''),
    thumbnailUrl: row.thumbnail_url == null ? null : String(row.thumbnail_url),
    title: row.title == null ? null : String(row.title),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    updatedAt: new Date(row.updated_at as string | Date).toISOString(),
    createdBy: createdById == null ? null : { id: createdById, name: createdByName || `Staff #${createdById}` },
  };
}
