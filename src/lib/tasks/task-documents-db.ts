import 'server-only';

/** Real tenant bindings for task documents (`work_assignment_documents`). */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { readPlanFile, statPlanFile } from './plan-files';
import {
  createTaskDocument as createTaskDocumentCore,
  deleteTaskDocument as deleteTaskDocumentCore,
  getTaskDocument as getTaskDocumentCore,
  listTaskDocuments as listTaskDocumentsCore,
  mapTaskDocumentRow,
  type CreateTaskDocumentResult,
  type GetTaskDocumentResult,
  type RemovedTaskDocument,
  type TaskDocumentRecord,
  type TaskDocumentsDeps,
} from './task-documents';
import type { TaskDocumentCreateBody, TaskDocumentMeta, TaskDocumentSource } from './task-documents-shared';
import { findTaskAnchor } from './task-links-db';

/**
 * Documents on one task, oldest first. `size_bytes` is `octet_length`, which
 * reads the TOAST header without detoasting, so the list never pulls bodies;
 * `content` is selected only when `$4` asks for it.
 */
const TASK_DOCUMENTS_SQL = `
  SELECT d.id,
         d.assignment_id,
         d.source,
         d.title,
         d.repo_path,
         CASE WHEN d.source = 'upload' THEN octet_length(d.content) END AS size_bytes,
         CASE WHEN $4::boolean THEN d.content END AS content,
         d.created_at,
         d.created_by_staff_id,
         s.name AS created_by_name
    FROM work_assignment_documents d
    LEFT JOIN staff s
      ON s.id = d.created_by_staff_id
     AND s.organization_id = d.organization_id
   WHERE d.organization_id = $1::uuid
     AND d.assignment_id = $2
     AND ($3::bigint IS NULL OR d.id = $3)
   ORDER BY d.created_at, d.id`;

/** The deps seam bound to one org. */
export function taskDocumentsDbDeps(orgId: OrgId): TaskDocumentsDeps {
  return {
    taskExists: async (taskId) => (await findTaskAnchor(orgId, taskId)) !== null,
    readPlanFile,
    statPlanFile,

    async insertDocument(row) {
      const inserted = await tenantQuery<{ id: string | number }>(
        orgId,
        `INSERT INTO work_assignment_documents
           (organization_id, assignment_id, source, title, content, repo_path, created_by_staff_id)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (organization_id, assignment_id, repo_path) WHERE source = 'repo' DO NOTHING
         RETURNING id`,
        [orgId, row.taskId, row.source, row.title, row.content, row.repoPath, row.createdByStaffId],
      );
      if (inserted.rows[0]) return { id: Number(inserted.rows[0].id), created: true };
      if (row.source !== 'repo') return null;

      // The same plan file is already on this task: answer that row. A fresh
      // statement, so a row a concurrent linker committed is visible.
      const existing = await tenantQuery<{ id: string | number }>(
        orgId,
        `SELECT id
           FROM work_assignment_documents
          WHERE organization_id = $1::uuid AND assignment_id = $2
            AND source = 'repo' AND repo_path = $3
          LIMIT 1`,
        [orgId, row.taskId, row.repoPath],
      );
      return existing.rows[0] ? { id: Number(existing.rows[0].id), created: false } : null;
    },

    async readDocuments(taskId, opts) {
      const res = await tenantQuery(orgId, TASK_DOCUMENTS_SQL, [
        orgId,
        taskId,
        opts?.docId ?? null,
        opts?.withContent === true,
      ]);
      const records: TaskDocumentRecord[] = [];
      for (const raw of res.rows) {
        const record = mapTaskDocumentRow(raw);
        if (record) records.push(record);
      }
      return records;
    },

    async deleteDocument(taskId, docId): Promise<RemovedTaskDocument | null> {
      const res = await tenantQuery<{ source: TaskDocumentSource; title: string; repo_path: string | null }>(
        orgId,
        `DELETE FROM work_assignment_documents
          WHERE organization_id = $1::uuid AND assignment_id = $2 AND id = $3
          RETURNING source, title, repo_path`,
        [orgId, taskId, docId],
      );
      const row = res.rows[0];
      return row ? { source: row.source, title: row.title, repoPath: row.repo_path } : null;
    },
  };
}

/** Documents on one task (meta only), oldest first; null when the id is not a task in this org. */
export function listTaskDocuments(orgId: OrgId, taskId: number): Promise<TaskDocumentMeta[] | null> {
  return listTaskDocumentsCore(taskId, taskDocumentsDbDeps(orgId));
}

export function getTaskDocument(orgId: OrgId, taskId: number, docId: number): Promise<GetTaskDocumentResult> {
  return getTaskDocumentCore(taskId, docId, taskDocumentsDbDeps(orgId));
}

export function createTaskDocument(
  orgId: OrgId,
  staffId: number | null,
  taskId: number,
  body: TaskDocumentCreateBody,
): Promise<CreateTaskDocumentResult> {
  return createTaskDocumentCore(taskId, staffId, body, taskDocumentsDbDeps(orgId));
}

export function deleteTaskDocument(
  orgId: OrgId,
  taskId: number,
  docId: number,
): Promise<{ changed: boolean; removed: RemovedTaskDocument | null } | null> {
  return deleteTaskDocumentCore(taskId, docId, taskDocumentsDbDeps(orgId));
}
