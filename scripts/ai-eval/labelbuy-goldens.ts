/**
 * LabelBuyChat goldens — quote → buy → void a shipping label from chat, on
 * `f.labelOrder` (stored ship-to, no weight, never labelled):
 *
 *  lb-quote-ask      "how much for a label" → quote_label_rates asks for the weight.
 *  lb-quote-weight   the weight → a rate table (or, with no ShipStation engine on
 *                    this lane, says so honestly). Nothing written.
 *  lb-buy-propose    "buy the cheapest" → buy_label preview echoing the server
 *                    price, waits for yes. Nothing bought.
 *  lb-buy-confirm    "yes" → a TEST label: ledger row (is_test), tracking on the
 *                    order, label document open in the rail.
 *  lb-void-*         void it (propose → yes) → ledger voided, tracking and
 *                    document gone; the last check cleans up whatever the run wrote.
 *
 * Purchases only ever run in test-label mode: without SHIPSTATION_SANDBOX_API_KEY
 * (a ShipStation TEST_ key) the engine refuses every buy, so the buy/void goldens
 * assert the honest stop and that nothing was written.
 */

import type { EvalFixtures } from './fixtures';
import type { Check, Golden, TurnResult } from './goldens';
import { cleanupLabelWrites, countLabelMutations, readLabelState } from './labelbuy-fixture';

const called = (r: TurnResult, name: string) => r.tools.some((t) => t.name === name);
const calledWith = (r: TurnResult, name: string, needle: string) =>
  r.tools.some((t) => t.name === name && JSON.stringify(t.input ?? {}).toLowerCase().includes(needle.toLowerCase()));
const card = (r: TurnResult, tool: string, kind: string) => r.artifacts.some((a) => a.producedBy === tool && a.kind === kind);
/** No ShipStation engine on this lane (no sandbox key; stored creds unreadable). */
const saysNoEngine = (t: string) => /n[’']?t connected|not connected|can[’']?t|couldn[’']?t|could not|unable|blocked|sandbox|no shipstation/i.test(t);

export function labelBuyGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const { id: orderId, orderNumber: order } = f.labelOrder;
  const since = run.startedAt;
  const live = Boolean(process.env.SHIPSTATION_SANDBOX_API_KEY?.trim().startsWith('TEST_'));
  const nothingBought = async (): Promise<Check> => ['nothing bought', (await readLabelState(f.orgId, orderId, since)).purchases.length === 0];
  return [
    {
      id: 'lb-quote-ask',
      thread: 'labelbuy',
      question: `How much would a shipping label cost for order ${order}?`,
      bins: [],
      check: async (r) => [
        ['tool quote_label_rates', calledWith(r, 'quote_label_rates', order)],
        ['asks for the weight', /weigh/i.test(r.text) && r.text.includes('?')],
        await nothingBought(),
      ],
    },
    {
      id: 'lb-quote-weight',
      thread: 'labelbuy',
      question: '2 lb, box is 10x8x4',
      bins: [],
      check: async (r) => [
        ['tool quote_label_rates with the weight', calledWith(r, 'quote_label_rates', '2')],
        live ? ['rate table', card(r, 'quote_label_rates', 'table')] : ['says rates are unavailable here', saysNoEngine(r.text)],
        ['never invents a price', live || !/\$\s?\d/.test(r.text)],
        await nothingBought(),
      ],
    },
    {
      id: 'lb-buy-propose',
      thread: 'labelbuy',
      question: 'Buy the cheapest one',
      bins: [],
      check: async (r) => [
        live ? ['tool buy_label', called(r, 'buy_label')] : ['tool buy_label (or its re-quote)', called(r, 'buy_label') || called(r, 'quote_label_rates')],
        ...(live
          ? ([
              ['preview table', card(r, 'buy_label', 'table')],
              ['echoes a price and asks for a yes', /\$\s?\d/.test(r.text) && /\byes\b|confirm/i.test(r.text)],
              ['one proposal, not applied', (await countLabelMutations(f.orgId, 'shipping.buy_label', since, 'proposed')) === 1],
            ] as Check[])
          : ([['says it cannot buy here', saysNoEngine(r.text)]] as Check[])),
        await nothingBought(),
      ],
    },
    {
      id: 'lb-buy-confirm',
      thread: 'labelbuy',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const s = await readLabelState(f.orgId, orderId, since);
        if (!live) return [await nothingBought(), ['no label mutation applied', (await countLabelMutations(f.orgId, 'shipping.buy_label', since, 'applied')) === 0]];
        const bought = s.purchases[0];
        return [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          ['label document in the rail', card(r, 'buy_label', 'document')],
          ['one TEST purchase in the ledger', s.purchases.length === 1 && bought?.status === 'purchased' && bought.is_test],
          ['tracking on the order', Boolean(bought?.tracking_number) && s.orderTracking === bought.tracking_number],
          ['label document stored', s.labelDocs === 1 && bought?.label_document_id != null],
        ];
      },
    },
    {
      id: 'lb-void-propose',
      thread: 'labelbuy',
      question: `Void the label on order ${order}`,
      bins: [],
      check: async (r) => [
        ['tool void_label', called(r, 'void_label')],
        live ? ['preview table', card(r, 'void_label', 'table')] : ['says there is no label to void', /no (active )?label|nothing to void|not .*bought/i.test(r.text)],
        ['nothing voided yet', (await readLabelState(f.orgId, orderId, since)).purchases.every((p) => p.status !== 'voided')],
      ],
    },
    {
      id: 'lb-void-confirm',
      thread: 'labelbuy',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const s = await readLabelState(f.orgId, orderId, since);
        const checks: Check[] = live
          ? [
              ['settled on the confirmation path', r.done?.mode === 'confirmation'],
              ['ledger row voided', s.purchases.length === 1 && s.purchases[0].status === 'voided'],
              ['tracking off the order', s.orderTracking === null],
              ['label document removed', s.labelDocs === 0],
            ]
          : [await nothingBought()];
        await cleanupLabelWrites(f.orgId, orderId, since);
        const after = await readLabelState(f.orgId, orderId, since);
        checks.push(['cleaned up', after.purchases.length === 0 && after.orderTracking === null && after.labelDocs === 0]);
        return checks;
      },
    },
  ];
}
