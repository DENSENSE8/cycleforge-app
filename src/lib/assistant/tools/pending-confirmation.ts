/**
 * The ONE "awaiting your yes" lookup for a chat thread. Two YELLOW tools ask
 * before they write — `link_manual_to_sku`, `create_manual_order` and
 * `import_purchase_order` — and a
 * bare yes / no on the next turn answers whichever this thread proposed LAST.
 * The route settles it through that tool (same dispatch gate, same review
 * path); a longer reply carries `note` to the model instead.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { LINK_MANUAL_TOOL_NAME, pendingManualLinkNote } from './manual-link-tools';
import { CREATE_MANUAL_ORDER_TOOL_NAME, pendingManualOrderNote } from './manual-order-tools';
import { IMPORT_PO_TOOL_NAME, pendingPoImportNote } from './po-import-tools';
import { pendingConfirmableNote } from './confirmable-write';
import { CHAT_WRITE_SPECS } from './task-tools';
import { LINK_PO_TO_ORDER_TOOL, linkPoToOrderSpec } from './po-order-link-tools';
import { LABEL_WRITE_SPECS } from './label-tools';
import { ENABLE_CAPABILITY_SPEC, ENABLE_CAPABILITY_TOOL } from './capability-tools';

export interface PendingConfirmation {
  /** The tool that settles it with `{ action: 'confirm' | 'cancel' }`. */
  toolName: string;
  /** The prompt line that rides with the user's reply. */
  note: string;
}

/** Kind → the tool that proposed it, and the permission a turn needs to settle it. */
const CONFIRMABLE: Record<string, { toolName: string; permission: string }> = {
  'product_manual.link_sku': { toolName: LINK_MANUAL_TOOL_NAME, permission: 'product_manuals.manage' },
  'order.create_manual': { toolName: CREATE_MANUAL_ORDER_TOOL_NAME, permission: 'orders.create' },
  'receiving.import_po': { toolName: IMPORT_PO_TOOL_NAME, permission: 'receiving.scan_po' },
  'receiving.link_order': { toolName: LINK_PO_TO_ORDER_TOOL, permission: 'receiving.scan_po' },
  'order.set_flag': { toolName: 'set_order_flag', permission: 'orders.create' },
  'order.mark_out_of_stock': { toolName: 'mark_out_of_stock', permission: 'orders.create' },
  'order.clear_out_of_stock': { toolName: 'clear_out_of_stock', permission: 'orders.create' },
  'order.scan_out': { toolName: 'bulk_scan_out', permission: 'shipping.mark_shipped' },
  'task.create': { toolName: 'create_task', permission: 'work_orders.claim' },
  'shipping.buy_label': { toolName: 'buy_label', permission: 'shipping.buy_label' },
  'shipping.void_label': { toolName: 'void_label', permission: 'shipping.void_label' },
  'org.enable_capability': { toolName: ENABLE_CAPABILITY_TOOL, permission: 'admin.manage_features' },
};

const LATEST_SQL = `SELECT mutation_kind
  FROM agent_mutations
 WHERE organization_id = $1 AND ai_chat_session_id = $2 AND status = 'proposed'
   AND mutation_kind = ANY($3::text[])
 ORDER BY id DESC
 LIMIT 1`;

/** `null` when nothing this caller could confirm is waiting. Ask-only turns never ask. */
export async function loadPendingConfirmation(
  orgId: OrgId,
  sessionId: string,
  permissions: ReadonlySet<string>,
): Promise<PendingConfirmation | null> {
  const kinds = Object.keys(CONFIRMABLE).filter((k) => permissions.has(CONFIRMABLE[k].permission));
  if (kinds.length === 0) return null;
  const latest = (await tenantQuery<{ mutation_kind: string }>(orgId, LATEST_SQL, [orgId, sessionId, kinds])).rows[0];
  if (!latest) return null;
  const toolName = CONFIRMABLE[latest.mutation_kind]?.toolName;
  const note =
    toolName === CREATE_MANUAL_ORDER_TOOL_NAME
      ? await pendingManualOrderNote(orgId, sessionId)
      : toolName === LINK_MANUAL_TOOL_NAME
        ? await pendingManualLinkNote(orgId, sessionId)
        : toolName === IMPORT_PO_TOOL_NAME
          ? await pendingPoImportNote(orgId, sessionId)
          : toolName === LINK_PO_TO_ORDER_TOOL
            ? await pendingConfirmableNote(linkPoToOrderSpec, orgId, sessionId)
            : toolName && Object.hasOwn(CHAT_WRITE_SPECS, toolName)
              ? await pendingConfirmableNote(CHAT_WRITE_SPECS[toolName], orgId, sessionId)
              : toolName && Object.hasOwn(LABEL_WRITE_SPECS, toolName)
                ? await pendingConfirmableNote(LABEL_WRITE_SPECS[toolName as keyof typeof LABEL_WRITE_SPECS], orgId, sessionId)
                : toolName === ENABLE_CAPABILITY_TOOL
                  ? await pendingConfirmableNote(ENABLE_CAPABILITY_SPEC, orgId, sessionId)
            : null;
  return toolName && note ? { toolName, note } : null;
}
