/**
 * PoOrderLink goldens — "this PO is for order N", end to end on the dev DB:
 *
 *  po-link thread (link, unlink/cleanup): an existing PO on the spine (the
 *    reconcile fixture's not-yet-received PO) is linked to an order (propose →
 *    yes → edge), then unlinked (propose → yes → edge gone); the last check
 *    removes everything the run wrote and leaves the PO's own links alone.
 *  rc-chips thread: a reconcile paste, then the "missing ones" chip opens the
 *    order draft prefilled with the "Not in system" ref — server-side, no model.
 */

import type { EvalFixtures } from './fixtures';
import type { Check, Golden, TurnResult } from './goldens';
import { cleanupPoLink, poLinkLeftovers, readPoLinks } from './po-link-fixture';

const called = (r: TurnResult, name: string, arg?: string) =>
  r.tools.some((t) => t.name === name && (!arg || JSON.stringify(t.input ?? {}).toLowerCase().includes(arg.toLowerCase())));
const has = (t: string, ...needles: Array<string | number>) =>
  needles.every((n) => t.replace(/\s+/g, ' ').toLowerCase().includes(String(n).toLowerCase()));

export function poLinkGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const rc = f.chatReads.reconcile;
  const po = rc.notReceivedPo;
  const order = f.orderWithLabel.orderNumber;
  const linkedTo = async () =>
    (await readPoLinks(f.orgId, po)).find((l) => l.external_order_id.toUpperCase() === order.toUpperCase());
  return [
    // ── link ──
    {
      id: 'pl-link',
      thread: 'po-link',
      question: `PO ${po} is for order ${order} — link it`,
      bins: [],
      check: (r) => [
        ['tool link_po_to_order', called(r, 'link_po_to_order')],
        ['asks for a yes, naming the order', /\byes\b/i.test(r.text) && has(r.text, order)],
      ],
    },
    {
      id: 'pl-link-yes',
      thread: 'po-link',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const edge = await linkedTo();
        return [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          [`edge PO → ${order}`, edge != null && edge.local_order_id != null && edge.receiving_id != null],
        ];
      },
    },
    // ── unlink / cleanup ──
    {
      id: 'pl-unlink',
      thread: 'po-link',
      question: `Unlink PO ${po} from order ${order}`,
      bins: [],
      check: (r) => [
        ['tool link_po_to_order (unlink)', called(r, 'link_po_to_order', '"unlink":true') || called(r, 'link_po_to_order', 'unlink')],
        ['asks for a yes', /\byes\b/i.test(r.text) && has(r.text, order)],
      ],
    },
    {
      id: 'pl-unlink-yes',
      thread: 'po-link',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const checks: Check[] = [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          [`no edge to ${order}`, (await linkedTo()) == null],
        ];
        await cleanupPoLink(f.orgId, po, order, run.startedAt);
        checks.push(['cleaned up', (await poLinkLeftovers(f.orgId, po, order, run.startedAt)) === 0]);
        return checks;
      },
    },
    // ── the reconcile chip opens the real draft ──
    {
      id: 'rc-chip-paste',
      thread: 'rc-chips',
      question: `which of these did we get?\n${rc.received[0]}\n${rc.received[1]}\n${rc.notReceivedTracking}\n${rc.notReceivedPo}\n${rc.pendingOrder}\n${rc.unknown}`,
      bins: [],
      check: (r) => [
        ['tool reconcile_refs', called(r, 'reconcile_refs')],
        ['offers the new-orders chip', r.suggestions.some((s) => /as new orders/i.test(s))],
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
