/**
 * PoOrderLink goldens — "this PO is for order N", end to end on the dev DB:
 *
 *  po-link thread (import-with-order): a PO paste whose note names an order
 *    that does not exist → Still needed asks which order; the real order # →
 *    card complete; "Import this PO" → proposal naming the order; "yes" → the
 *    `receiving_order_link` edge exists (PO carton ↔ order row), and the order
 *    record's side reads the PO.
 *  po-link-existing thread (link-existing, unlink/cleanup): a fresh thread links
 *    the now-existing PO to a second order (propose → yes → edge), then
 *    unlinks it (propose → yes → edge gone, the first stays); the last check
 *    removes everything the run wrote.
 *  rc-chips thread: a reconcile paste, then each "missing ones" chip opens its
 *    draft prefilled with the "Not in system" ref — server-side, no model.
 */

import type { EvalFixtures } from './fixtures';
import type { Check, Golden, TurnResult } from './goldens';
import { cleanupPoLink, poLinkLeftovers, readOrderSidePos, readPoLinks } from './po-link-fixture';

const called = (r: TurnResult, name: string, arg?: string) =>
  r.tools.some((t) => t.name === name && (!arg || JSON.stringify(t.input ?? {}).toLowerCase().includes(arg.toLowerCase())));
const has = (t: string, ...needles: Array<string | number>) =>
  needles.every((n) => t.replace(/\s+/g, ' ').toLowerCase().includes(String(n).toLowerCase()));

export function poLinkGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const tag = run.startedAt.getTime().toString(36).toUpperCase();
  const po = `EVPL-${tag}`;
  const vendor = `Eval Link Vendor ${tag}`;
  const tracking = `EVPLT${String(run.startedAt.getTime()).slice(-10)}`;
  const bogus = `ZZ${tag}77`;
  const orderA = f.chatReads.reconcile.pendingOrder;
  const orderB = f.orderWithLabel.orderNumber;
  const sku = f.multiBin.sku;
  const rc = f.chatReads.reconcile;
  const card = (r: TurnResult) => r.artifacts.some((a) => a.producedBy === 'draft_po_import' && a.kind === 'po_draft' && has(a.title ?? '', po));
  return [
    // ── import-with-order ──
    {
      id: 'pl-paste',
      thread: 'po-link',
      question: `Import this purchase order:\nPO number: ${po}\nVendor: ${vendor}\n1 x SKU ${sku}\nTracking: ${tracking}\nNotes: this PO is for order ${bogus}`,
      bins: [],
      check: (r) => [
        ['tool draft_po_import', called(r, 'draft_po_import')],
        ['PO card for the PO', card(r)],
        ['asks which order (unresolved)', /which order/i.test(r.text) && has(r.text, bogus)],
        ['nothing written yet', !called(r, 'import_purchase_order')],
      ],
    },
    {
      id: 'pl-order',
      thread: 'po-link',
      question: `For order: ${orderA}`,
      bins: [],
      check: (r) => [
        ['card updated by draft_po_import (directly or via link_po_to_order)', called(r, 'draft_po_import') || called(r, 'link_po_to_order')],
        ['same PO card, updated', card(r)],
        ['no longer asks which order', !/which order/i.test(r.text)],
        ['nothing written yet', !called(r, 'import_purchase_order')],
      ],
    },
    {
      id: 'pl-import',
      thread: 'po-link',
      question: 'Import this PO',
      bins: [],
      check: (r) => [
        ['tool import_purchase_order (propose)', called(r, 'import_purchase_order')],
        ['asks for a yes, naming the order', /\byes\b/i.test(r.text) && has(r.text, orderA)],
      ],
    },
    {
      id: 'pl-confirm',
      thread: 'po-link',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const links = await readPoLinks(f.orgId, po);
        const a = links.find((l) => l.external_order_id === orderA);
        return [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          ['record card from the import', r.artifacts.some((x) => x.producedBy === 'import_purchase_order' && x.kind === 'record')],
          [`one edge PO → ${orderA}`, links.length === 1 && a != null],
          ['edge names the order row, the carton and the PO header', a?.local_order_id != null && a.receiving_id != null && a.inbound_order_id != null && a.source === 'po_import'],
          ['the order record reads the PO', (await readOrderSidePos(f.orgId, orderA)).some((p) => p.toUpperCase() === po)],
          ['says it is linked', has(r.text, orderA)],
        ];
      },
    },
    // ── link-existing ──
    {
      id: 'pl-link',
      thread: 'po-link-existing',
      question: `PO ${po} is also for order ${orderB} — link it`,
      bins: [],
      check: (r) => [
        ['tool link_po_to_order', called(r, 'link_po_to_order')],
        ['asks for a yes, naming the order', /\byes\b/i.test(r.text) && has(r.text, orderB)],
      ],
    },
    {
      id: 'pl-link-yes',
      thread: 'po-link-existing',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const links = await readPoLinks(f.orgId, po);
        return [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          [`edges to ${orderA} and ${orderB}`, links.length === 2 && links.some((l) => l.external_order_id === orderB && l.local_order_id != null)],
        ];
      },
    },
    // ── unlink / cleanup ──
    {
      id: 'pl-unlink',
      thread: 'po-link-existing',
      question: `Unlink PO ${po} from order ${orderB}`,
      bins: [],
      check: (r) => [
        ['tool link_po_to_order (unlink)', called(r, 'link_po_to_order', '"unlink":true') || called(r, 'link_po_to_order', 'unlink')],
        ['asks for a yes', /\byes\b/i.test(r.text) && has(r.text, orderB)],
      ],
    },
    {
      id: 'pl-unlink-yes',
      thread: 'po-link-existing',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const links = await readPoLinks(f.orgId, po);
        const checks: Check[] = [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          [`only ${orderA} left`, links.length === 1 && links[0].external_order_id === orderA],
        ];
        await cleanupPoLink(f.orgId, po, tracking);
        checks.push(['cleaned up', (await poLinkLeftovers(f.orgId, po)) === 0]);
        return checks;
      },
    },
    // ── reconcile chips open the real drafts ──
    {
      id: 'rc-chip-paste',
      thread: 'rc-chips',
      question: `which of these did we get?\n${rc.received[0]}\n${rc.received[1]}\n${rc.notReceivedTracking}\n${rc.notReceivedPo}\n${rc.pendingOrder}\n${rc.unknown}`,
      bins: [],
      check: (r) => [
        ['tool reconcile_refs', called(r, 'reconcile_refs')],
        ['offers both chips', r.suggestions.some((s) => /as purchase orders/i.test(s)) && r.suggestions.some((s) => /as new orders/i.test(s))],
      ],
    },
    {
      id: 'rc-chip-po',
      thread: 'rc-chips',
      question: 'Import the missing ones as purchase orders',
      bins: [],
      check: (r) => [
        ['server fast path, no model', r.done?.mode === 'reconcile_follow_through' && !r.done?.usage],
        ['draft_po_import with the missing ref as tracking', called(r, 'draft_po_import', rc.unknown)],
        ['PO card opened', r.artifacts.some((a) => a.producedBy === 'draft_po_import' && a.kind === 'po_draft')],
        ['names the ref and what is still needed', has(r.text, rc.unknown) && /still needed/i.test(r.text)],
      ],
    },
    {
      id: 'rc-chip-orders',
      thread: 'rc-chips',
      question: 'Add the missing ones as new orders',
      bins: [],
      check: (r) => [
        ['server fast path, no model', r.done?.mode === 'reconcile_follow_through' && !r.done?.usage],
        ['draft_manual_order with the missing ref as order #', called(r, 'draft_manual_order', rc.unknown)],
        ['order card opened', r.artifacts.some((a) => a.producedBy === 'draft_manual_order' && a.kind === 'order_draft')],
        ['names the ref', has(r.text, rc.unknown)],
      ],
    },
  ];
}
