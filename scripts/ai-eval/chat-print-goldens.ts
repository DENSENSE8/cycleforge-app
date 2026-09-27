/**
 * ChatPrint goldens — printing from chat raises the print card; it never
 * prints on its own and never claims it printed:
 *
 *  - print-papers: label + slip for two orders in ONE ask → print_order_paperwork
 *    with both orders → one `print_order_paperwork` device action carrying both
 *    order rows (the browser's print card sends them as one station job).
 *  - print-reprint: "reprint the packing slip" → reprint: true, slip only.
 *  - print-no-docs: an order with nothing on file → nothing goes to the card,
 *    and the answer says so.
 *  - print-totes: "print 50 tote labels" → the tote tool with a count (the card
 *    waits for a tap above 10; no totes exist until the station mints them).
 *
 * The eval has no print station: the last check reads the ledger back and
 * requires that nothing was recorded for the golden orders.
 */

import { countPrintRowsSince } from './chat-print-fixture';
import type { EvalFixtures } from './fixtures';
import type { Check, Golden, TurnResult } from './goldens';

const calledWith = (r: TurnResult, name: string, ...args: string[]) =>
  r.tools.some((t) => t.name === name && args.every((a) => JSON.stringify(t.input ?? {}).toLowerCase().includes(a.toLowerCase())));

type PaperAction = { orders: Array<{ orderRowId: number; orderNumber: string }>; documents: string[]; reprint: boolean };
const paperAction = (r: TurnResult): PaperAction | null =>
  (r.uiTools?.find((u) => u.name === 'print_order_paperwork')?.input as PaperAction | undefined) ?? null;

/** No sentence of the answer claims the paper printed (a negated or future "print" is fine). */
const noPrintedClaim = (r: TurnResult) =>
  !r.text.split(/(?<=[.!?])\s+|\n+/).some((s) => /\b(printed|has been printed|is printing)\b/i.test(s) && !/\b(not|n['’]t|never|before|already|once)\b/i.test(s));

export function chatPrintGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const [a, b] = f.unprintedOrders;
  return [
    {
      id: 'print-papers',
      question: `Print the shipping label and packing slip for orders ${a.orderNumber} and ${b.orderNumber}`,
      bins: [],
      check: (r) => {
        const action = paperAction(r);
        return [
          [`tool print_order_paperwork(${a.orderNumber}, ${b.orderNumber})`, calledWith(r, 'print_order_paperwork', a.orderNumber, b.orderNumber)],
          [
            'one print card carrying both orders, label + slip',
            !!action &&
              action.orders.map((o) => o.orderRowId).sort().join() === [a.id, b.id].sort().join() &&
              action.documents.includes('shipping_label') &&
              action.documents.includes('packing_slip') &&
              action.reprint === false,
          ],
          ['did not open the document viewer', !calledWith(r, 'get_order_documents')],
          ['never claims it printed', noPrintedClaim(r)],
        ];
      },
    },
    {
      id: 'print-reprint',
      question: `Reprint the packing slip for order ${a.orderNumber}`,
      bins: [],
      check: (r) => {
        const action = paperAction(r);
        return [
          [`tool print_order_paperwork(${a.orderNumber})`, calledWith(r, 'print_order_paperwork', a.orderNumber)],
          [
            'reprint card: packing slip only',
            !!action && action.reprint === true && action.documents.join() === 'packing_slip' && action.orders[0]?.orderRowId === a.id,
          ],
          ['never claims it printed', noPrintedClaim(r)],
        ];
      },
    },
    {
      id: 'print-no-docs',
      question: `Print the packing slip for order ${f.orderNoDocs.orderNumber}`,
      bins: [],
      check: (r) => [
        [`tool print_order_paperwork(${f.orderNoDocs.orderNumber})`, calledWith(r, 'print_order_paperwork', f.orderNoDocs.orderNumber)],
        ['no print card', paperAction(r) === null],
        [
          'says nothing is on file',
          r.text.includes(f.orderNoDocs.orderNumber) && /\b(no|not|nothing|isn['’]t|doesn['’]t)\b/i.test(r.text),
        ],
      ],
    },
    {
      id: 'print-totes',
      question: 'Print 50 tote labels',
      bins: [],
      check: async (r) => {
        const tote = r.uiTools?.find((u) => u.name === 'print_handling_unit_labels')?.input as { count?: number; handlingUnitIds?: unknown } | undefined;
        const checks: Check[] = [
          ['tote print with count 50 (new totes)', tote?.count === 50 && tote.handlingUnitIds === undefined],
          ['never claims it printed', noPrintedClaim(r)],
          // Last golden of the block: the eval has no station, so no paper was recorded.
          ['no print recorded for the golden orders', (await countPrintRowsSince(f.orgId, [a.id, b.id], run.startedAt)) === 0],
        ];
        return checks;
      },
    },
  ];
}
