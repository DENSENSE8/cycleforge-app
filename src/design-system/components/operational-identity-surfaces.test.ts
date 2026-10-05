/**
 * Operational identity contract — the four checkpoint surfaces (Inbound
 * Compact row, Inbound Full card, Outbound Compact row, Outbound Full card)
 * are mounted for real and must paint ONE canonical compact identity for the
 * same order number, while the copy and the accessible name keep it whole.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, type ComponentType, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactDomClient from 'react-dom/client';
import type * as ReceiptCardModelModule from '@/components/receiving/incoming/cards/receipt-card-model';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type * as OperationalIdentityModule from '@/lib/operational-identity';
import type * as OrderCardModelModule from '@/lib/orders/order-card-model';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3050/', pretendToBeVisual: true });
const g = globalThis as unknown as Record<string, unknown>;
/** The clipboard write a click is awaiting — resolved by the stub, so a test awaits the copy itself, not a guessed delay. */
let pendingCopy = Promise.withResolvers<string>();
Object.defineProperty(dom.window, 'isSecureContext', { value: true });
Object.defineProperty(dom.window.navigator, 'clipboard', {
  value: { writeText: async (text: string) => pendingCopy.resolve(text) },
});
const noopObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Object.assign(dom.window, { ResizeObserver: noopObserver, IntersectionObserver: noopObserver });
dom.window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof dom.window.matchMedia;
// `defineProperty`, not assignment: Node ships its own read-only `navigator`, which a plain write leaves in place.
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MouseEvent', 'KeyboardEvent', 'ResizeObserver', 'IntersectionObserver', 'localStorage', 'sessionStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
  const value = (dom.window as unknown as Record<string, unknown>)[key];
  const bound = typeof value === 'function' && /^[a-z]/.test(key) ? (value as (...args: unknown[]) => unknown).bind(dom.window) : value;
  Object.defineProperty(globalThis, key, { value: bound, configurable: true, writable: true });
}
g.IS_REACT_ACT_ENVIRONMENT = true;

type Surfaces = {
  createRoot: typeof ReactDomClient.createRoot;
  OrderRow: ComponentType<never>;
  OrderCard: ComponentType<never>;
  IncomingDeliveryRow: ComponentType<never>;
  IncomingDeliveryCard: ComponentType<never>;
  orderCardModel: typeof OrderCardModelModule.orderCardModel;
  receiptCardModel: typeof ReceiptCardModelModule.receiptCardModel;
  inboundOrderIdentity: typeof OperationalIdentityModule.inboundOrderIdentity;
};
let s: Surfaces;

// The DOM globals above must exist before React DOM and the surfaces load.
before(async () => {
  const [client, row, card, inRow, inCard, orderModel, receiptModel, identity] = await Promise.all([
    import('react-dom/client'),
    import('@/components/outbound/orders/cards/OrderRow'),
    import('@/components/outbound/orders/cards/OrderCard'),
    import('@/components/receiving/incoming/cards/IncomingDeliveryRow'),
    import('@/components/receiving/incoming/cards/IncomingDeliveryCard'),
    import('@/lib/orders/order-card-model'),
    import('@/components/receiving/incoming/cards/receipt-card-model'),
    import('@/lib/operational-identity'),
  ]);
  s = {
    createRoot: client.createRoot,
    OrderRow: row.OrderRow as ComponentType<never>,
    OrderCard: card.OrderCard as ComponentType<never>,
    IncomingDeliveryRow: inRow.IncomingDeliveryRow as ComponentType<never>,
    IncomingDeliveryCard: inCard.IncomingDeliveryCard as ComponentType<never>,
    orderCardModel: orderModel.orderCardModel,
    receiptCardModel: receiptModel.receiptCardModel,
    inboundOrderIdentity: identity.inboundOrderIdentity,
  };
});

after(() => dom.window.close());

function mount(tree: ReactElement) {
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = s.createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  act(() => root.render(h(QueryClientProvider, { client }, tree)));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const slotProps = {
  checked: false,
  open: false,
  openId: null,
  expanded: false,
  peekOpen: false,
  enterIndex: null,
  onOpen() {},
  onToggleCheck() {},
  onToggleExpand() {},
  onTogglePeek() {},
};

function outboundOrder(orderId: string, accountSource: string): ShippedOrder {
  return {
    id: 9001,
    order_id: orderId,
    account_source: accountSource,
    sku: 'BOSE-251-BLK',
    product_title: 'Bose 251 speaker',
    quantity: 1,
    condition: 'USED_GOOD',
    ship_by_date: '2026-10-06',
    created_at: '2026-10-02T17:30:00.000Z',
    shipstation_ship_to: { name: 'Ana Ruiz' },
  } as unknown as ShippedOrder;
}

function inboundLine(fields: Partial<ReceivingLineRow>): ReceivingLineRow {
  return {
    id: 501,
    receiving_id: null,
    workflow_status: 'EXPECTED',
    sku: 'BOSE-251-BLK',
    product_title: 'Bose 251 speaker',
    quantity_expected: 1,
    quantity_received: 0,
    tracking_number: '1Z3Y496R0398693994',
    carrier: 'UPS',
    vendor_name: 'aerodeals',
    delivery_state: 'IN_TRANSIT',
    expected_delivery_date: '2026-10-06',
    zoho_purchaseorder_number: null,
    zoho_purchaseorder_id: null,
    source_order_id: null,
    inbound_source_type: null,
    source_platform: null,
    ...fields,
  } as ReceivingLineRow;
}

/** The four surfaces for one outbound order and one inbound purchase. */
function surfaces(orderId: string, accountSource: string, line: Partial<ReceivingLineRow>): [string, ReactElement][] {
  const order = s.orderCardModel('order:9001', [outboundOrder(orderId, accountSource)], '2026-10-04');
  const receipt = s.receiptCardModel({ key: 'po:1', rows: [inboundLine(line)] });
  return [
    ['inbound compact', h(s.IncomingDeliveryRow, { ...slotProps, model: receipt } as never)],
    ['inbound full', h(s.IncomingDeliveryCard, { ...slotProps, model: receipt } as never)],
    ['outbound compact', h(s.OrderRow, { ...slotProps, model: order } as never)],
    ['outbound full', h(s.OrderCard, { ...slotProps, model: order, todayKey: '2026-10-04', onSaveNote() {} } as never)],
  ];
}

/** Each surface's painted identity: the chip's visible face, its accessible name, and the record's whole text. */
function paintedIdentities(orderId: string, accountSource: string, line: Partial<ReceivingLineRow>) {
  return surfaces(orderId, accountSource, line).map(([surface, tree]) => {
    const m = mount(tree);
    const chip = m.host.querySelector<HTMLButtonElement>('[data-chip-face] button');
    assert.ok(chip, `${surface}: the identity is a copyable chip`);
    const painted = { surface, face: chip.textContent?.trim() ?? '', label: chip.getAttribute('aria-label') ?? '', text: m.host.textContent ?? '' };
    m.unmount();
    return painted;
  });
}

test('Amazon: every surface paints the seven digits after the last dash', () => {
  const id = '113-6729910-1909809';
  const painted = paintedIdentities(id, 'amazon', { source_order_id: id, inbound_source_type: 'amazon', zoho_purchaseorder_number: 'PO-1520' });
  for (const p of painted) {
    assert.equal(p.face, '1909809', `${p.surface}: canonical compact face`);
    assert.ok(p.label.includes(id), `${p.surface}: accessible name keeps ${id} — got "${p.label}"`);
    assert.doesNotMatch(p.text, /\bPO\b/, `${p.surface}: no "PO" on the resting identity`);
  }
});

test('eBay: an inbound PO filed under the eBay order number reads the same face as the outbound order', () => {
  const id = '14-15232-19863';
  const painted = paintedIdentities(id, 'ebay', { zoho_purchaseorder_number: id, zoho_purchaseorder_id: '5623409000003832090' });
  assert.deepEqual(
    painted.map((p) => [p.surface, p.face]),
    painted.map((p) => [p.surface, '19863']),
  );
  for (const p of painted) assert.match(p.label, /eBay order 14-15232-19863/, `${p.surface}: platform + complete value spoken`);
});

test('copy from every surface carries the complete value', async () => {
  const id = '113-6729910-1909809';
  for (const [surface, tree] of surfaces(id, 'amazon', { source_order_id: id, inbound_source_type: 'amazon' })) {
    pendingCopy = Promise.withResolvers<string>();
    const m = mount(tree);
    act(() => m.host.querySelector<HTMLButtonElement>('[data-chip-face] button')!.click());
    assert.equal(await pendingCopy.promise, id, `${surface}: copies the complete id`);
    m.unmount();
  }
});

test('inbound: the PO is the identity only when no external order id exists — and never wears the word', () => {
  // A Zoho line's source_order_id is the PO's own Zoho id, not an external order.
  const zoho = s.inboundOrderIdentity(
    inboundLine({ inbound_source_type: 'zoho', zoho_purchaseorder_number: '12-14-75878476', zoho_purchaseorder_id: '5623409000002728101', source_order_id: '5623409000002728101' }),
  );
  assert.equal(zoho.kind, 'purchase-order');
  assert.equal(zoho.value, '12-14-75878476');
  assert.equal(zoho.display, '75878476');
  assert.equal(zoho.ariaLabel, 'Purchase order 12-14-75878476');

  // An external order wins; the PO rides as the detail-only fallback.
  const amazon = s.inboundOrderIdentity(inboundLine({ inbound_source_type: 'amazon', source_order_id: '111-7696143-8222608', zoho_purchaseorder_number: 'PO-00412' }));
  assert.equal(amazon.kind, 'order');
  assert.equal(amazon.display, '8222608');
  assert.deepEqual(amazon.platform, { slug: 'amazon', label: 'Amazon' });
  assert.equal(amazon.fallback?.value, 'PO-00412');

  // Nothing to copy: the line is the handle.
  const bare = s.inboundOrderIdentity(inboundLine({ id: 77 }));
  assert.equal(bare.kind, 'receiving-line');
  assert.equal(bare.display, 'Line 77');
});
