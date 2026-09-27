/**
 * Print order paperwork from chat — "print the packing slip for 4899",
 * "reprint the labels for these 12 orders".
 *
 * The server half of a device action (`tool-device-action.ts`): it resolves
 * each order reference to its order row and to the papers on file — the SAME
 * bundle the station prints (`resolvePrintBundle`: shipping label, packing
 * slip, the manuals the pack bundle assigns) — and hands the browser a
 * resolved print. The browser sends it over the staff print bridge to the
 * staffer's print station as ONE `papers` job; the station runs the existing
 * `/api/orders/[id]/documents/print` path per order, which writes the
 * `document_print_jobs` rows. The model passes order references only.
 *
 * Not in the GREEN tier: a print is a physical side effect, so an Ask-only
 * turn neither sees nor can dispatch it (`dispatch.ts`).
 *
 * A paper that was printed before is not silently printed again: without
 * `reprint` the tool says which orders were already printed and sends nothing.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { MAX_PAPERWORK_PRINT_ORDERS } from '@/lib/print/labelCopies';
import type { StaffPrintPaperDocument } from '@/lib/print/staff-print-bridge';
import { attachDeviceAction } from '@/lib/assistant/tool-device-action';
import { cleanOrderRef, findOrderRowsByRef } from './order-document-tools';
import type { AssistantToolDef, AssistantToolDeps } from './types';

/** What the station would print for one order row — ids and types only. */
export interface PaperworkBundle {
  documents: ReadonlyArray<{ id: number; documentType: string }>;
  manuals: ReadonlyArray<{ id: number }>;
}

export interface PaperworkPrintDeps {
  resolveBundle: (orgId: OrgId, orderRowId: number) => Promise<PaperworkBundle>;
}

// `print-bundle` is server-only — a lazy default keeps the registry importable from node:test.
const defaultDeps: PaperworkPrintDeps = {
  resolveBundle: async (orgId, orderRowId) =>
    (await import('@/lib/documents/print-bundle')).resolvePrintBundle(orgId, { orderId: orderRowId }),
};

/** The browser verb the resolved print travels as (`useAssistantChat`). */
export const PRINT_ORDER_PAPERWORK_ACTION = 'print_order_paperwork';

export const PAPERWORK_CHOICES = ['both', 'shipping_label', 'packing_slip', 'paperwork', 'all'] as const;
type PaperworkChoice = (typeof PAPERWORK_CHOICES)[number];

const CHOICE_DOCUMENTS: Record<PaperworkChoice, readonly StaffPrintPaperDocument[]> = {
  both: ['shipping_label', 'packing_slip'],
  shipping_label: ['shipping_label'],
  packing_slip: ['packing_slip'],
  paperwork: ['manual'],
  all: ['shipping_label', 'packing_slip', 'manual'],
};

const DOCUMENT_NAME: Record<StaffPrintPaperDocument, string> = {
  shipping_label: 'shipping label',
  packing_slip: 'packing slip',
  manual: 'paperwork',
};

/** How many rows one order number may span before the newest with papers is taken. */
const ROWS_PER_ORDER = 5;

const input = z.object({
  orders: z
    .array(z.string().min(1).max(120))
    .min(1)
    .max(MAX_PAPERWORK_PRINT_ORDERS)
    .describe('Order numbers exactly as the operator typed them (e.g. ["4899"], ["#1204", "111-5202086-4729848"]).'),
  documents: z
    .enum(PAPERWORK_CHOICES)
    .default('both')
    .describe(
      'Which papers: both (shipping label + packing slip, the default), shipping_label, packing_slip, paperwork (manuals / receipts / inserts paired to the order), or all.',
    ),
  reprint: z
    .boolean()
    .default(false)
    .describe('true only when the operator said reprint / print again, or confirmed printing papers that were printed before.'),
});

const PRIOR_PRINTS_SQL = `
  SELECT order_id, max(created_at) AS last_at
    FROM document_print_jobs
   WHERE organization_id = $1
     AND order_id = ANY($2::int[])
     AND document_type = ANY($3::text[])
     AND status <> 'failed'
   GROUP BY order_id`;

interface PrintableOrder {
  orderRowId: number;
  orderNumber: string;
  papers: string;
}

/** "shipping label + packing slip" / "packing slip + 2 paperwork files". */
function paperList(bundle: PaperworkBundle, wanted: readonly StaffPrintPaperDocument[]): string {
  const parts: string[] = [];
  for (const type of wanted) {
    if (type === 'manual') {
      const n = bundle.manuals.length;
      if (n > 0) parts.push(n === 1 ? 'paperwork' : `${n} paperwork files`);
    } else if (bundle.documents.some((d) => d.documentType === type)) {
      parts.push(DOCUMENT_NAME[type]);
    }
  }
  return parts.join(' + ');
}

function joinOrders(list: readonly string[]): string {
  return list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

export const printOrderPaperwork: AssistantToolDef<typeof input> = {
  name: 'print_order_paperwork',
  description:
    'PRINT order paperwork on the user\'s print station (the computer running CycleForge with the printer): shipping label, packing slip, both, or the paired paperwork (manuals, receipts). Use for "print the packing slip for 4899", "print the label and slip for orders 1204 and 1205", "reprint the shipping label for …". Up to 25 orders in one print. Pass the order numbers exactly as typed; the papers on file are looked up for you. Set reprint only when the user said reprint / print again. Printing is a physical action — only call it when the user asked to print. A print card in the chat shows the station and whether it printed, so never claim it printed. To only SHOW papers, use get_order_documents instead.',
  permission: 'packing.complete_order',
  inputSchema: input,
  run: async (args, ctx, deps) => {
    const d = (deps as AssistantToolDeps & { paperworkPrint?: PaperworkPrintDeps }).paperworkPrint ?? defaultDeps;
    const org = ctx.organizationId;
    const wanted = CHOICE_DOCUMENTS[args.documents];
    const asked = joinOrders(wanted.map((t) => DOCUMENT_NAME[t]));

    const printable: PrintableOrder[] = [];
    const notFound: string[] = [];
    const nothingOnFile: string[] = [];
    const seen = new Set<number>();

    for (const raw of args.orders) {
      const ref = cleanOrderRef(raw);
      const rows = ref ? await findOrderRowsByRef(deps, org, ref) : [];
      if (rows.length === 0) {
        notFound.push(ref || raw);
        continue;
      }
      const orderNumber = String(rows[0].order_id ?? '').trim() || ref;
      let picked: PrintableOrder | null = null;
      // A split order spans rows; the newest row with the papers asked for is the one to print.
      for (const row of rows.slice(0, ROWS_PER_ORDER)) {
        const orderRowId = Number(row.id);
        const papers = paperList(await d.resolveBundle(org, orderRowId), wanted);
        if (papers) {
          picked = { orderRowId, orderNumber, papers };
          break;
        }
      }
      if (!picked) nothingOnFile.push(orderNumber);
      else if (!seen.has(picked.orderRowId)) {
        seen.add(picked.orderRowId);
        printable.push(picked);
      }
    }

    const misses = [
      notFound.length > 0 ? `No order ${joinOrders(notFound)} exists in this workspace.` : '',
      nothingOnFile.length > 0 ? `${joinOrders(nothingOnFile)} ${nothingOnFile.length === 1 ? 'has' : 'have'} no ${asked} on file.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (printable.length === 0) {
      return { printing: false, message: `Nothing was sent to print. ${misses}`.trim() };
    }

    const { rows: prior } = await deps.query(org, PRIOR_PRINTS_SQL, [org, printable.map((o) => o.orderRowId), wanted]);
    if (prior.length > 0 && !args.reprint) {
      const printedBefore = printable
        .filter((o) => prior.some((p) => Number(p.order_id) === o.orderRowId))
        .map((o) => o.orderNumber);
      return {
        printing: false,
        already_printed: printedBefore,
        message: `Nothing was sent to print: the ${asked} for ${joinOrders(printedBefore)} ${
          printedBefore.length === 1 ? 'was' : 'were'
        } printed before. Ask the user whether to print again; if they say yes, call print_order_paperwork again with reprint: true.${misses ? ` ${misses}` : ''}`,
      };
    }

    const sending = printable.map((o) => `${o.orderNumber} (${o.papers})`);
    const reply = `Sending the ${asked} for ${joinOrders(printable.map((o) => o.orderNumber))} to your print station${
      args.reprint ? ' again' : ''
    }.`;
    const result = {
      printing: true,
      reprint: args.reprint,
      orders: sending,
      // The station has not printed yet: the model says it is SENDING, and the card says the rest.
      message: `Answer with exactly: "${reply}"${misses ? ` Then add: ${misses}` : ''}`,
    };
    return attachDeviceAction(result, {
      name: PRINT_ORDER_PAPERWORK_ACTION,
      input: {
        orders: printable.map((o) => ({ orderRowId: o.orderRowId, orderNumber: o.orderNumber, papers: o.papers })),
        documents: [...wanted],
        reprint: args.reprint,
      },
    });
  },
};
