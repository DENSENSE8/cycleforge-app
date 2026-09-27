/**
 * ChatWrites goldens — order-status writes and tasks, confirm-before-write:
 *
 *  - cw-flag-*: "put these on hold: <seed order>, <bogus>" → preview table with
 *    a Couldn't-match row, nothing written → "yes" → every seed line flagged
 *    Hold → cleaned up.
 *  - cw-oos-*: mark the seed order out of stock → yes → lines out of stock → cleaned up.
 *  - cw-scan-*: scan out all packed orders → preview (count) → "no" → nothing scanned out.
 *  - cw-task-*: "Assign Sang and Tuan: call the customer on order …, remind me
 *    at 3pm" → task card → yes → one task on both lists, about the order, with
 *    a reminder → deleted.
 */

import {
  CHAT_WRITES_ORDER,
  cleanupOrderWrites,
  cleanupTasks,
  countAssistantShortages,
  countMutations,
  readCreatedTask,
  readOrderLines,
} from './chat-writes-fixture';
import type { EvalFixtures } from './fixtures';
import type { Golden, TurnResult } from './goldens';

const called = (r: TurnResult, name: string) => r.tools.some((t) => t.name === name);
const card = (r: TurnResult, tool: string, kind: string) => r.artifacts.some((a) => a.producedBy === tool && a.kind === kind);

export function chatWritesGoldens(f: EvalFixtures, run: { startedAt: Date }): Golden[] {
  const order = CHAT_WRITES_ORDER;
  const since = run.startedAt;
  return [
    {
      id: 'cw-flag-propose',
      thread: 'cw-flag',
      question: `Put these orders on hold: ${order}, ZZ-NOPE-40404`,
      bins: [],
      check: async (r) => [
        ['tool set_order_flag', called(r, 'set_order_flag')],
        ['preview table', card(r, 'set_order_flag', 'table')],
        ['asks for a yes', /\byes\b|confirm/i.test(r.text)],
        ['nothing written yet', (await readOrderLines(f.orgId, order)).every((l) => l.flag === null)],
      ],
    },
    {
      id: 'cw-flag-confirm',
      thread: 'cw-flag',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const lines = await readOrderLines(f.orgId, order);
        const checks: Array<[string, boolean]> = [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          ['result table', card(r, 'set_order_flag', 'table')],
          [`all ${lines.length} lines on hold`, lines.length > 0 && lines.every((l) => l.flag === 'hold')],
          ['mutation applied', (await countMutations(f.orgId, 'order.set_flag', since, 'applied')) === 1],
        ];
        await cleanupOrderWrites(f.orgId, order, since);
        checks.push(['cleaned up', (await readOrderLines(f.orgId, order)).every((l) => l.flag === null)]);
        return checks;
      },
    },
    {
      id: 'cw-oos-propose',
      thread: 'cw-oos',
      question: `Mark order ${order} out of stock`,
      bins: [],
      check: async (r) => [
        ['tool mark_out_of_stock', called(r, 'mark_out_of_stock')],
        ['preview table', card(r, 'mark_out_of_stock', 'table')],
        ['nothing written yet', (await countMutations(f.orgId, 'order.mark_out_of_stock', since, 'applied')) === 0],
      ],
    },
    {
      id: 'cw-oos-confirm',
      thread: 'cw-oos',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const lines = await readOrderLines(f.orgId, order);
        const checks: Array<[string, boolean]> = [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          [`all ${lines.length} lines out of stock`, lines.length > 0 && lines.every((l) => l.is_out_of_stock)],
        ];
        await cleanupOrderWrites(f.orgId, order, since);
        checks.push(['cleaned up', (await countAssistantShortages(f.orgId, order, since)) === 0]);
        return checks;
      },
    },
    {
      id: 'cw-scan-propose',
      thread: 'cw-scan',
      question: 'Mark all the packed orders as scanned out',
      bins: [],
      check: async (r) => [
        ['tool bulk_scan_out', called(r, 'bulk_scan_out')],
        ['preview table or nothing-to-do', card(r, 'bulk_scan_out', 'table') || /no packed/i.test(r.text)],
      ],
    },
    {
      id: 'cw-scan-cancel',
      thread: 'cw-scan',
      question: 'no',
      bins: [],
      check: async () => {
        const applied = await countMutations(f.orgId, 'order.scan_out', since, 'applied');
        await cleanupOrderWrites(f.orgId, order, since);
        return [['nothing scanned out', applied === 0]];
      },
    },
    {
      id: 'cw-task-propose',
      thread: 'cw-task',
      question: `Assign Sang and Tuan: call the customer on order ${order}, remind me at 3pm`,
      bins: [],
      check: async (r) => [
        ['tool create_task', called(r, 'create_task')],
        ['task card', card(r, 'create_task', 'record')],
        ['nothing created yet', (await readCreatedTask(f.orgId, since)) === null],
      ],
    },
    {
      id: 'cw-task-confirm',
      thread: 'cw-task',
      question: 'yes',
      bins: [],
      check: async (r) => {
        const task = await readCreatedTask(f.orgId, since);
        const checks: Array<[string, boolean]> = [
          ['settled on the confirmation path', r.done?.mode === 'confirmation'],
          ['result card', card(r, 'create_task', 'record')],
          ['task exists', task !== null],
          ['on Sang and Tuan', JSON.stringify(task?.assignees ?? []) === JSON.stringify(['Sang', 'Tuan'])],
          ['about the order', task?.entity_id != null],
          ['reminder at 3pm org time', task?.remind_at != null &&
            new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }).format(new Date(task.remind_at)) === '3:00 PM'],
        ];
        await cleanupTasks(f.orgId, since);
        checks.push(['cleaned up', (await readCreatedTask(f.orgId, since)) === null]);
        return checks;
      },
    },
  ];
}
