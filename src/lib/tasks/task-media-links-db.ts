import 'server-only';

/**
 * Real tenant bindings for task media links (`work_assignment_media_links`).
 *
 * `task-media-links.ts` owns the refusals and the row mapper; this file owns
 * the SQL. Every statement runs through the GUC wrappers in
 * `@/lib/tenancy/db` AND names `organization_id` explicitly — `orgId` /
 * `staffId` come from the route's auth context, never a body.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { TaskMediaLink, TaskMediaLinkCreateBody, TaskMediaLinkPatchBody } from './media-links';
import {
  createTaskMediaLink as createTaskMediaLinkCore,
  deleteTaskMediaLink as deleteTaskMediaLinkCore,
  listTaskMediaLinks as listTaskMediaLinksCore,
  mapTaskMediaLinkRow,
  updateTaskMediaLink as updateTaskMediaLinkCore,
  type CreateTaskMediaLinkResult,
  type RemovedTaskMediaLink,
  type TaskMediaLinksDeps,
  type UpdateTaskMediaLinkResult,
} from './task-media-links';
import { findTaskAnchor } from './task-links-db';

/** Media links on one task, oldest first; the creator's name joined org-led. */
const TASK_MEDIA_LINKS_SQL = `
  SELECT m.id,
         m.assignment_id,
         m.kind,
         m.provider,
         m.url,
         m.embed_url,
         m.thumbnail_url,
         m.title,
         m.created_at,
         m.updated_at,
         m.created_by_staff_id,
         s.name AS created_by_name
    FROM work_assignment_media_links m
    LEFT JOIN staff s
      ON s.id = m.created_by_staff_id
     AND s.organization_id = m.organization_id
   WHERE m.organization_id = $1::uuid
     AND m.assignment_id = $2
     AND ($3::bigint IS NULL OR m.id = $3)
   ORDER BY m.created_at, m.id`;

async function readLinks(orgId: OrgId, taskId: number, linkId: number | null): Promise<TaskMediaLink[]> {
  const res = await tenantQuery(orgId, TASK_MEDIA_LINKS_SQL, [orgId, taskId, linkId]);
  const links: TaskMediaLink[] = [];
  for (const raw of res.rows) {
    const link = mapTaskMediaLinkRow(raw);
    if (link) links.push(link);
  }
  return links;
}

/** The deps seam bound to one org. */
export function taskMediaLinksDbDeps(orgId: OrgId): TaskMediaLinksDeps {
  return {
    taskExists: async (taskId) => (await findTaskAnchor(orgId, taskId)) !== null,

    async insertLink(row) {
      const inserted = await tenantQuery<{ id: string | number }>(
        orgId,
        `INSERT INTO work_assignment_media_links
           (organization_id, assignment_id, kind, provider, url, embed_url,
            thumbnail_url, title, created_by_staff_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (organization_id, assignment_id, url) DO NOTHING
         RETURNING id`,
        [
          orgId,
          row.taskId,
          row.kind,
          row.provider,
          row.url,
          row.embedUrl,
          row.thumbnailUrl,
          row.title,
          row.createdByStaffId,
        ],
      );
      if (inserted.rows[0]) return { id: Number(inserted.rows[0].id), created: true };

      // The same URL is already on this task: answer that row. A fresh
      // statement, so a row a concurrent paster committed is visible.
      const existing = await tenantQuery<{ id: string | number }>(
        orgId,
        `SELECT id
           FROM work_assignment_media_links
          WHERE organization_id = $1::uuid AND assignment_id = $2 AND url = $3
          LIMIT 1`,
        [orgId, row.taskId, row.url],
      );
      return existing.rows[0] ? { id: Number(existing.rows[0].id), created: false } : null;
    },

    readLinks: (taskId, opts) => readLinks(orgId, taskId, opts?.linkId ?? null),

    async updateLink(taskId, linkId, update) {
      const link = update.link ?? null;
      try {
        const res = await tenantQuery(
          orgId,
          `UPDATE work_assignment_media_links
              SET kind          = CASE WHEN $4::boolean THEN $5::text ELSE kind END,
                  provider      = CASE WHEN $4::boolean THEN $6::text ELSE provider END,
                  url           = CASE WHEN $4::boolean THEN $7::text ELSE url END,
                  embed_url     = CASE WHEN $4::boolean THEN $8::text ELSE embed_url END,
                  thumbnail_url = CASE WHEN $4::boolean THEN $9::text ELSE thumbnail_url END,
                  title         = CASE WHEN $10::boolean THEN $11::text ELSE title END,
                  updated_at    = now()
            WHERE organization_id = $1::uuid AND assignment_id = $2 AND id = $3
            RETURNING id`,
          [
            orgId,
            taskId,
            linkId,
            link !== null,
            link?.kind ?? null,
            link?.provider ?? null,
            link?.url ?? null,
            link?.embedUrl ?? null,
            link?.thumbnailUrl ?? null,
            update.title !== undefined,
            update.title ?? null,
          ],
        );
        return (res.rowCount ?? 0) > 0 ? 'updated' : 'not_found';
      } catch (error) {
        // ux_work_assignment_media_links_url: the new URL is another link on this task.
        if ((error as { code?: string } | null)?.code === '23505') return 'duplicate';
        throw error;
      }
    },

    async deleteLink(taskId, linkId): Promise<RemovedTaskMediaLink | null> {
      const res = await tenantQuery<RemovedTaskMediaLink>(
        orgId,
        `DELETE FROM work_assignment_media_links
          WHERE organization_id = $1::uuid AND assignment_id = $2 AND id = $3
          RETURNING kind, provider, url, title`,
        [orgId, taskId, linkId],
      );
      return res.rows[0] ?? null;
    },
  };
}

/** Media links on one task, oldest first; null when the id is not a task in this org. */
export function listTaskMediaLinks(orgId: OrgId, taskId: number): Promise<TaskMediaLink[] | null> {
  return listTaskMediaLinksCore(taskId, taskMediaLinksDbDeps(orgId));
}

/**
 * Media links on a task the caller has ALREADY gated (`assertTaskInOrg`) —
 * the media payload's read, without a second existence query.
 */
export function readTaskMediaLinks(orgId: OrgId, taskId: number): Promise<TaskMediaLink[]> {
  return readLinks(orgId, taskId, null);
}

export function createTaskMediaLink(
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  body: TaskMediaLinkCreateBody,
): Promise<CreateTaskMediaLinkResult> {
  return createTaskMediaLinkCore(taskId, staffId, body, taskMediaLinksDbDeps(orgId));
}

export function updateTaskMediaLink(
  orgId: OrgId,
  taskId: number,
  linkId: number,
  patch: TaskMediaLinkPatchBody,
): Promise<UpdateTaskMediaLinkResult> {
  return updateTaskMediaLinkCore(taskId, linkId, patch, taskMediaLinksDbDeps(orgId));
}

export function deleteTaskMediaLink(
  orgId: OrgId,
  taskId: number,
  linkId: number,
): Promise<{ changed: boolean; removed: RemovedTaskMediaLink | null } | null> {
  return deleteTaskMediaLinkCore(taskId, linkId, taskMediaLinksDbDeps(orgId));
}
