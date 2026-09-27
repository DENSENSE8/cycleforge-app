/**
 * ChatReads goldens — one per read tool, on real dev-DB values
 * (`chat-reads-fixture.ts`), plus the 6-number reconcile paste:
 *
 *  - cr-reconcile: a vendor paste (2 received, 2 not received, 1 pending order,
 *    1 unknown) → reconcile_refs on the fast path, no model, grouped counts.
 *  - cr-customer: "who is <phone>?" → get_customer dossier for the buyer.
 *  - cr-worklist: "which exceptions first?" → get_worklist ranked exceptions table.
 *  - cr-staff: "<name>'s performance on <day>" → get_staff_report with the boxes.
 *  - cr-tracking: carrier status of a delivered package → get_tracking_status timeline.
 *  - cr-watch / cr-unwatch: watch a (synthetic) tracking → the requester's
 *    watch row exists → stop → muted → deleted.
 */

import { deleteTrackingWatch, readTrackingWatch } from './chat-reads-fixture';
import type { EvalFixtures } from './fixtures';
import type { Golden, TurnResult } from './goldens';

const called = (r: TurnResult, name: string, arg?: string) =>
  r.tools.some((t) => t.name === name && (!arg || JSON.stringify(t.input ?? {}).toLowerCase().includes(arg.toLowerCase())));
const artifact = (r: TurnResult, tool: string, kind: string) => r.artifacts.some((a) => a.producedBy === tool && a.kind === kind);
const has = (t: string, ...needles: Array<string | number>) =>
  needles.every((n) => t.replace(/\s+/g, ' ').toLowerCase().includes(String(n).toLowerCase()));

export function chatReadsGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const c = f.chatReads;
  const rc = c.reconcile;
  const phone = f.corpus.customer.phone;
  const typedPhone = `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  const watchTracking = `1ZEVAL${String(run.startedAt.getTime()).slice(-12)}`;
  return [
    {
      id: 'cr-reconcile',
      question: `which of these did we get?\n${rc.received[0]}\n${rc.received[1]}\n${rc.notReceivedTracking}\n${rc.notReceivedPo}\n${rc.pendingOrder}\n${rc.unknown}`,
      bins: [],
      check: (r) => [
        ['fast path, no model', r.done?.mode === 'identifier' && !r.done?.usage],
        ['tool reconcile_refs', called(r, 'reconcile_refs')],
        ['grouped table of 6', r.artifacts.some((a) => a.producedBy === 'reconcile_refs' && a.kind === 'table' && a.rows === 6)],
        ['counts: 2 received · 2 not received · 1 not in system · 1 pending', has(r.text, '6 numbers: 2 received · 2 not received · 1 not in system · 1 pending')],
        ['names the unknown + pending refs', has(r.text, `Not in system: ${rc.unknown}`) && has(r.text, rc.pendingOrder)],
        ['offers the import', r.suggestions.some((s) => /import the missing/i.test(s))],
      ],
    },
    {
      id: 'cr-customer',
      question: `A customer is calling from ${typedPhone} — who is it?`,
      bins: [],
      check: (r) => [
        ['tool get_customer', called(r, 'get_customer', phone.slice(-4))],
        ['dossier card, identity first', r.artifacts.some((a) => a.producedBy === 'get_customer' && a.kind === 'record' && has(a.identity?.title ?? '', f.corpus.customer.name))],
        ['text: the buyer', has(r.text, f.corpus.customer.name)],
      ],
    },
    {
      // exceptions + need_to_order read today; the to-ship / pick / blocked lists wait on the
      // unapplied 2026-09-27_work_type_pick migration (desk-view-sql emits work_type 'PICK').
      id: 'cr-worklist',
      question: 'Which orders in the exceptions queue should I work first?',
      bins: [],
      check: (r) => [
        ['tool get_worklist(exceptions)', called(r, 'get_worklist', 'exceptions')],
        ['ranked exceptions table', artifact(r, 'get_worklist', 'table')],
        ['says what to do first', /first/i.test(r.text)],
      ],
    },
    {
      id: 'cr-staff',
      question: `How did ${c.staffDay.name} do on ${c.staffDay.day}? Packing and time spent.`,
      bins: [],
      check: (r) => [
        [`tool get_staff_report(${c.staffDay.name})`, called(r, 'get_staff_report', c.staffDay.name)],
        ['report artifact', artifact(r, 'get_staff_report', 'report')],
        [`text: ${c.staffDay.boxes} boxes`, new RegExp(`\\b${c.staffDay.boxes}\\b`).test(r.text)],
      ],
    },
    {
      id: 'cr-tracking',
      question: `What is the carrier status of ${c.tracking.tracking}? Has it been delivered?`,
      bins: [],
      check: (r) => [
        ['tool get_tracking_status', called(r, 'get_tracking_status', c.tracking.tracking)],
        ['carrier timeline', artifact(r, 'get_tracking_status', 'timeline')],
        ['text: delivered', /deliver/i.test(r.text)],
      ],
    },
    {
      id: 'cr-watch',
      thread: 'cr-watch',
      question: `Watch tracking ${watchTracking} and tell me when it arrives`,
      bins: [],
      check: async (r) => {
        const rows = await readTrackingWatch(f.orgId, watchTracking);
        return [
          ['tool watch_tracking', called(r, 'watch_tracking', watchTracking)],
          ['one subscribed watch for the requester', rows.length === 1 && rows[0].state === 'subscribed'],
          ['confirms in words', /watch/i.test(r.text)],
        ];
      },
    },
    {
      id: 'cr-unwatch',
      thread: 'cr-watch',
      question: `Stop watching ${watchTracking}`,
      bins: [],
      check: async (r) => {
        const rows = await readTrackingWatch(f.orgId, watchTracking);
        const checks: Array<[string, boolean]> = [
          ['tool watch_tracking (unwatch)', called(r, 'watch_tracking', 'unwatch')],
          ['watch muted', rows.length === 1 && rows[0].state === 'muted'],
        ];
        checks.push(['cleaned up', (await deleteTrackingWatch(f.orgId, watchTracking)) === 1]);
        return checks;
      },
    },
  ];
}
