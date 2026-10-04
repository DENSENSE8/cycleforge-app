import 'server-only';

/**
 * Resolve a task document's live parts in ONE call (`POST /api/tasks/doc-live`):
 * every reference token and every ```tasks``` block on the page. P6 — the doc
 * stores references; the record is read here, at view time. One statement per
 * kind, batched, all tenant-scoped through `tenantQuery`.
 */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { parseTaskHold } from '@/design-system/tokens/task-status';
import { productImageUrl } from '@/lib/photos/product-image-url';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import {
  definitionOfDone,
  docRefKey,
  parseTasksQuery,
  type DocLivePayload,
  type DocLiveRequest,
  type DocRef,
  type DocRefFace,
  type DocTaskFace,
  type DocTasksQueryResult,
  type TasksQuery,
} from './doc-live';
import { isTaskDeskStatus, taskDeskLaneStatuses, taskDeskTitle, type TaskDeskPerson } from './task-desk-row';
import { TASK_WORK_TYPE, taskEntityFromEnum } from './task-vocabulary';

/** Lean task read — the face a doc paints, plus the Brief its Definition of Done comes from. */
const DOC_TASKS_SQL = `
  SELECT wa.id,
         wa.entity_type::text AS entity_type,
         wa.entity_id,
         wa.project_name,
         wa.notes,
         wa.status::text AS status,
         to_jsonb(wa) ->> 'task_state' AS task_state,
         wa.deadline_at,
         members.assignees
    FROM work_assignments wa
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', a.staff_id, 'name', COALESCE(ms.name, 'Staff #' || a.staff_id))
                      ORDER BY CASE WHEN a.staff_id = wa.assignee_staff_id THEN 0 ELSE 1 END, a.staff_id) AS assignees
        FROM work_assignment_assignees a
        LEFT JOIN staff ms ON ms.organization_id = a.organization_id AND ms.id = a.staff_id
       WHERE a.organization_id = wa.organization_id AND a.assignment_id = wa.id
    ) members ON TRUE
   WHERE wa.organization_id = $1::uuid
     AND wa.work_type::text = $2
     AND ($3::int[] IS NULL OR wa.id = ANY($3::int[]))
     AND ($4::int[] IS NULL OR EXISTS (
           SELECT 1 FROM work_assignment_assignees oa
            WHERE oa.organization_id = wa.organization_id
              AND oa.assignment_id = wa.id AND oa.staff_id = ANY($4::int[])))
     AND ($5::text IS NULL OR wa.project_name ILIKE $5)
     AND ($6::text[] IS NULL OR wa.status::text = ANY($6::text[]))
   ORDER BY wa.deadline_at ASC NULLS LAST, wa.priority ASC, wa.id
   LIMIT $7`;

function iso(value: unknown): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function owners(value: unknown): TaskDeskPerson[] {
  const raw = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): TaskDeskPerson[] => {
    const id = Number(item?.id);
    return Number.isInteger(id) && id > 0 ? [{ id, name: String(item?.name ?? '').trim() || `Staff #${id}` }] : [];
  });
}

async function readTasks(
  orgId: OrgId,
  filter: { ids: number[] | null; ownerIds: number[] | null; project: string | null; statuses: readonly string[] | null; limit: number },
): Promise<DocTaskFace[]> {
  const res = await tenantQuery(orgId, DOC_TASKS_SQL, [
    orgId,
    TASK_WORK_TYPE,
    filter.ids,
    filter.ownerIds,
    filter.project ? `%${filter.project.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
    filter.statuses ? [...filter.statuses] : null,
    filter.limit,
  ]);
  return res.rows.flatMap((row): DocTaskFace[] => {
    const status = row.status;
    if (!isTaskDeskStatus(status)) return [];
    const note = row.notes == null ? '' : String(row.notes);
    const projectName = row.project_name == null ? null : String(row.project_name);
    return [
      {
        id: Number(row.id),
        title: taskDeskTitle({
          entityType: taskEntityFromEnum(row.entity_type),
          entityId: row.entity_id == null ? null : Number(row.entity_id),
          note,
          projectName,
        }),
        status,
        taskState: parseTaskHold(row.task_state),
        deadlineAt: iso(row.deadline_at),
        owners: owners(row.assignees),
        projectName,
        dod: definitionOfDone(note),
      },
    ];
  });
}

/**
 * Staff by name → the best match per asked name (keyed lower-case): an exact
 * full name first, then a first-name match; active staff before inactive.
 */
async function staffByName(orgId: OrgId, names: string[]): Promise<Map<string, TaskDeskPerson>> {
  const found = new Map<string, TaskDeskPerson>();
  const wanted = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return found;
  const res = await tenantQuery<{ id: number; name: string }>(
    orgId,
    `SELECT id, name
       FROM staff
      WHERE organization_id = $1::uuid
        AND (LOWER(BTRIM(name)) = ANY($2::text[]) OR LOWER(SPLIT_PART(BTRIM(name), ' ', 1)) = ANY($2::text[]))
      ORDER BY (LOWER(BTRIM(name)) = ANY($2::text[])) DESC, active DESC NULLS LAST, id`,
    [orgId, wanted],
  );
  // Rows arrive exact-name first, then active first, so the first claim per key wins.
  for (const row of res.rows) {
    const full = row.name.trim().toLowerCase();
    const person = { id: Number(row.id), name: row.name.trim() };
    for (const key of [full, full.split(/\s+/)[0]]) {
      if (wanted.includes(key) && !found.has(key)) found.set(key, person);
    }
  }
  return found;
}

async function resolveTasksQuery(orgId: OrgId, query: TasksQuery): Promise<DocTasksQueryResult> {
  let ownerIds: number[] | null = null;
  if (query.owners.length) {
    const people = await staffByName(orgId, query.owners);
    const missing = query.owners.filter((name) => !people.has(name.toLowerCase()));
    if (missing.length) return { ok: false, error: `No staffer named ${missing.map((n) => `“${n}”`).join(', ')}.` };
    ownerIds = query.owners.map((name) => people.get(name.toLowerCase())!.id);
  }
  const statuses = taskDeskLaneStatuses(query.status);
  const rows = await readTasks(orgId, {
    ids: query.ids.length ? query.ids : null,
    ownerIds,
    project: query.project,
    statuses,
    limit: query.limit,
  });
  return { ok: true, rows };
}

/** Every reference on the page, one statement per kind. */
async function resolveRefs(orgId: OrgId, refs: DocRef[]): Promise<Record<string, DocRefFace | null>> {
  const out: Record<string, DocRefFace | null> = {};
  const byKind = (kind: DocRef['kind']) => refs.filter((r) => r.kind === kind).map((r) => r.value);
  for (const ref of refs) out[docRefKey(ref)] = null;

  const taskIds = byKind('task').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const repairIds = byKind('repair').map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const tickets = byKind('ticket');
  const orders = byKind('order');
  const skus = byKind('sku');
  const names = byKind('staff');

  await Promise.all([
    taskIds.length
      ? readTasks(orgId, { ids: taskIds, ownerIds: null, project: null, statuses: null, limit: taskIds.length }).then(
          (rows) => {
            for (const task of rows) out[docRefKey({ kind: 'task', value: String(task.id) })] = { kind: 'task', task };
          },
        )
      : null,
    names.length
      ? staffByName(orgId, names).then((people) => {
          for (const name of names) {
            const person = people.get(name.toLowerCase());
            if (person) out[docRefKey({ kind: 'staff', value: name })] = { kind: 'staff', ...person };
          }
        })
      : null,
    repairIds.length
      ? tenantQuery(
          orgId,
          `SELECT id, ticket_number, status, product_title
             FROM repair_service
            WHERE organization_id = $1::uuid AND id = ANY($2::int[])`,
          [orgId, repairIds],
        ).then((res) => {
          for (const row of res.rows) {
            out[docRefKey({ kind: 'repair', value: String(row.id) })] = {
              kind: 'repair',
              id: Number(row.id),
              ticketNumber: row.ticket_number == null ? null : String(row.ticket_number),
              status: row.status == null ? null : String(row.status),
              title: row.product_title == null ? null : String(row.product_title),
            };
          }
        })
      : null,
    tickets.length
      ? tenantQuery(
          orgId,
          `SELECT DISTINCT ON (external_ticket_id) external_ticket_id, subject_cache, status_cache
             FROM support_tickets
            WHERE organization_id = $1::uuid AND external_ticket_id = ANY($2::text[])
            ORDER BY external_ticket_id, id DESC`,
          [orgId, tickets],
        ).then((res) => {
          for (const row of res.rows) {
            out[docRefKey({ kind: 'ticket', value: String(row.external_ticket_id) })] = {
              kind: 'ticket',
              number: Number(row.external_ticket_id),
              subject: row.subject_cache == null ? null : String(row.subject_cache),
              status: row.status_cache == null ? null : String(row.status_cache),
            };
          }
        })
      : null,
    orders.length
      ? tenantQuery(
          orgId,
          `SELECT DISTINCT ON (LOWER(order_id)) id, order_id, product_title
             FROM orders
            WHERE organization_id = $1::uuid AND LOWER(order_id) = ANY($2::text[])
            ORDER BY LOWER(order_id), id`,
          [orgId, orders.map((o) => o.toLowerCase())],
        ).then((res) => {
          for (const row of res.rows) {
            out[docRefKey({ kind: 'order', value: String(row.order_id) })] = {
              kind: 'order',
              id: Number(row.id),
              orderNumber: String(row.order_id),
              title: row.product_title == null ? null : String(row.product_title),
            };
          }
        })
      : null,
    skus.length
      ? tenantQuery(
          orgId,
          // SKU identity law: title through resolveSkuIdentityTitle (catalog
          // title, then the Zoho item's), photo through productImageUrl.
          `SELECT w.k,
                  sc.product_title AS catalog_product_title,
                  sc.image_url     AS catalog_image_url,
                  it.name          AS zoho_item_title,
                  it.zoho_item_id,
                  it.image_document_id,
                  COALESCE(sc.sku, it.sku) AS sku
             FROM UNNEST($2::text[]) AS w(k)
             LEFT JOIN LATERAL (
               SELECT sku, product_title, image_url FROM sku_catalog
                WHERE organization_id = $1::uuid AND sku IN (w.k, UPPER(w.k))
                ORDER BY (sku = w.k) DESC, id LIMIT 1
             ) sc ON TRUE
             LEFT JOIN LATERAL (
               SELECT sku, name, zoho_item_id, image_document_id FROM items
                WHERE organization_id = $1::uuid AND sku IN (COALESCE(sc.sku, w.k), UPPER(w.k))
                ORDER BY (status = 'active') DESC, id LIMIT 1
             ) it ON TRUE
            WHERE sc.sku IS NOT NULL OR it.sku IS NOT NULL`,
          [orgId, skus],
        ).then((res) => {
          for (const row of res.rows) {
            const sku = String(row.sku);
            out[docRefKey({ kind: 'sku', value: String(row.k) })] = {
              kind: 'sku',
              sku,
              title: resolveSkuIdentityTitle({
                catalog_product_title: row.catalog_product_title,
                zoho_item_title: row.zoho_item_title,
                sku,
                zoho_item_id: row.zoho_item_id,
              }),
              imageUrl: productImageUrl({
                catalogImageUrl: row.catalog_image_url,
                zohoItemId: row.zoho_item_id,
                zohoImageDocumentId: row.image_document_id,
              }),
            };
          }
        })
      : null,
  ]);
  return out;
}

export async function resolveDocLive(orgId: OrgId, request: DocLiveRequest): Promise<DocLivePayload> {
  const queries: Record<string, DocTasksQueryResult> = {};
  const [refs] = await Promise.all([
    resolveRefs(orgId, request.refs),
    ...request.queries.map(async (raw) => {
      const source = raw.trim();
      const parsed = parseTasksQuery(source);
      queries[source] = parsed.ok ? await resolveTasksQuery(orgId, parsed.query) : { ok: false, error: parsed.error };
    }),
  ]);
  return { ok: true, refs, queries };
}
