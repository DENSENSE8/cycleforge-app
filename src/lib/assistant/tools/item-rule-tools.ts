/**
 * Item-rule read tools — the two GREEN reads behind "create a rule for this
 * product" on the To-ship desk.
 *
 *   • resolve_item_number — pasted title / item number / order number /
 *     tracking number → the ONE normalized item number a listing rule keys on.
 *   • list_staff — the org's active roster (id, name, role) so a spoken name
 *     ("Tuan") becomes the staff id the rule stores. Names never reach the DB
 *     as rule payload; ids do.
 *
 * The write itself is `propose_mutation automation_rule.upsert_item_staff`.
 * Both tools go through deps.query so every statement leads with
 * organization_id = $1 (read-tools.test sweeps that).
 */

import { z } from 'zod';
import type { AssistantToolDef } from './types';
import { resolveItemNumberReference } from '@/lib/automations/item-number-reference';

export const resolveItemNumberTool: AssistantToolDef<
  z.ZodObject<{ reference: z.ZodString }>
> = {
  name: 'resolve_item_number',
  description:
    'Resolve what the operator pasted — a product title, an item number (ASIN / listing item id), a marketplace order number, or a carrier tracking number — to the ONE item number that listing rules key on. Returns { ok, match: { itemNumber, matchedBy, title, orderCount, orderId, orderNumber } } or { ok:false, reason: not_found | ambiguous, candidates[] }. Call this FIRST for "create a rule for this product" / "always assign this listing to …"; on ambiguous, show the candidates and ask which one. Never invent an item number.',
  permission: 'dashboard.view',
  inputSchema: z.object({
    reference: z.string().trim().min(1).max(300),
  }),
  run: async (input, ctx, deps) => resolveItemNumberReference(deps.query, ctx.organizationId, input.reference),
};

export const listStaffTool: AssistantToolDef<
  z.ZodObject<{ nameLike: z.ZodOptional<z.ZodString> }>
> = {
  name: 'list_staff',
  description:
    'List this org\'s active staff as { id, name, role } rows, optionally narrowed by a case-insensitive name fragment (nameLike). Use it to turn a spoken or typed name ("Tuan", "Thuy") into the staff id an assignment or rule needs. If a fragment matches more than one person, ask which; if it matches none, say so — never guess an id.',
  permission: 'dashboard.view',
  inputSchema: z.object({
    nameLike: z.string().trim().min(1).max(80).optional(),
  }),
  run: async (input, ctx, deps) => {
    const params: unknown[] = [ctx.organizationId];
    let where = 'WHERE s.organization_id = $1 AND s.active = true';
    if (input.nameLike) {
      params.push(`%${input.nameLike}%`);
      where += ` AND s.name ILIKE $${params.length}`;
    }
    const r = await deps.query(
      ctx.organizationId,
      `SELECT s.id, s.name, s.role
         FROM staff s
         ${where}
        ORDER BY s.sort_order NULLS LAST, s.name ASC
        LIMIT 100`,
      params,
    );
    return {
      staff: r.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        role: row.role == null ? null : String(row.role),
      })),
    };
  },
};
