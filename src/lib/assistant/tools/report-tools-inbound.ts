/**
 * Inbound-side operator reports, as registered read tools.
 *
 * Two of the five owner questions land here:
 *
 *   - "How many boxes are left to be unboxed?"      → get_unbox_backlog
 *   - "What is the most expensive order currently
 *      in the warehouse?"                            → get_order_value_rank
 *
 * Each tool returns a `ToolArtifactEnvelope`: the validated report goes to the
 * panel, the one-sentence `summary` is all the model ever reads (see
 * `tool-artifact.ts`). The builders live in `src/lib/reports/` and are pure
 * apart from the injected `deps.query` seam, so their arithmetic is testable
 * without a database.
 *
 * The descriptions carry the operator's own phrasings verbatim — routing a
 * spoken question to the right tool is the description's whole job.
 */

import {
  buildUnboxBacklogReport,
  unboxBacklogInput,
} from '@/lib/reports/unbox-backlog';
import {
  buildOrderValueRankReport,
  orderValueRankInput,
} from '@/lib/reports/order-value-rank';
import type { AssistantToolDef } from './types';
import type { ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';

export const getUnboxBacklogTool: AssistantToolDef<typeof unboxBacklogInput, ToolArtifactEnvelope> = {
  name: 'get_unbox_backlog',
  description:
    'The receiving unbox backlog as a rendered report: how many boxes are left to be unboxed, how many units are expected inside them, how old the pile is, and the oldest cartons listed one by one. Use for "how many boxes are left to be unboxed", "unbox backlog", "what is waiting at receiving", "how many packages to open", "how big is the receiving pile". A box is one carton that arrived (door scan or receiving scan) and has no unbox milestone yet; cartons already open on the bench are called out separately. Carrier-delivered packages never scanned at the dock are NOT counted — that is a separate hunt queue. Optional filters: source, returnsOnly. The panel renders the report; speak the headline and the KPIs, never retype the tables.',
  permission: 'receiving.view',
  inputSchema: unboxBacklogInput,
  run: (input, ctx, deps) => buildUnboxBacklogReport(input, ctx, deps),
};

export const getOrderValueRankTool: AssistantToolDef<
  typeof orderValueRankInput,
  ToolArtifactEnvelope
> = {
  name: 'get_order_value_rank',
  description:
    'Orders we are still physically holding, ranked by sale value, as a rendered report. Use for "most expensive order currently in the warehouse", "highest value order", "biggest order we are holding", "total value in the building", "what is the priciest thing on the floor". An order is a group of order lines sharing one order_id and its value is the SUM of their sale amounts; "in the warehouse" means no dock scan-out, no carrier custody, not Amazon-fulfilled, and not caged without a catalog SKU. Every figure is SALE price, never profit — no cost or margin column exists, so never imply one. Optional: limit (1-25), stage (AWAITING_LABEL | BLOCKED | PENDING | PICKED | PACKED). The panel renders the report; speak the headline and the KPIs, never retype the tables.',
  permission: 'dashboard.view',
  inputSchema: orderValueRankInput,
  run: (input, ctx, deps) => buildOrderValueRankReport(input, ctx, deps),
};
