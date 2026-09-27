/**
 * create_task (ROI row 7) — YELLOW, confirm-before-write. "Assign Sang and
 * Tuan: call the customer on order 111-…, remind me at 3pm" becomes ONE task
 * on every assignee's task list, about the order, linked to a ticket when one
 * is named, with its deadline and reminder resolved server-side in the org's
 * time zone (`resolve-when.ts`). Staff names resolve against the active roster
 * (the AssigneeCombobox set); the order / ticket through find_records. Any name
 * or record that does not resolve is refused back, never guessed.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { TaskDraft } from '@/lib/assistant/mutations/chat-write-dispatch';
import { formatWhen, resolveWhen } from '@/lib/tasks/resolve-when';
import { listTaskLinks } from '@/lib/tasks/task-links-db';
import {
  buildConfirmableWriteTool,
  pendingConfirmableNote,
  type ConfirmableWriteDeps,
  type ConfirmableWriteSpec,
  type ProposeOutcome,
} from './confirmable-write';
import { ORDER_STATUS_SPECS, extractIdentifierTokens, resolveOrderTokens } from './order-status-tools';
import type { AssistantToolDef } from './types';

export const CREATE_TASK_TOOL = 'create_task';

const fields = z.object({
  task: z.string().trim().min(1).max(2000).optional().describe('What to do, in the user\'s words, e.g. "Call the customer about the replacement".'),
  assignees: z.string().max(400).optional().describe('Staff names as the user wrote them, e.g. "Sang and Tuan" ("me" = the user).'),
  order: z.string().max(80).optional().describe('The order # the task is about, as typed.'),
  ticket: z.string().max(40).optional().describe('A support ticket # to link, as typed.'),
  due: z.string().max(80).optional().describe('Deadline as the user said it, e.g. "Friday 5pm" (never convert it).'),
  remind: z.string().max(80).optional().describe('Reminder time as the user said it, e.g. "3pm", "tomorrow 9am" (never convert it).'),
});

const ROSTER_SQL = `SELECT id, name FROM staff WHERE organization_id = $1 AND active = TRUE ORDER BY name`;
const TZ_SQL = `SELECT settings->>'timezone' AS tz FROM organizations WHERE id = $1`;
const TASK_SQL = `SELECT w.id, w.notes, w.deadline_at, w.remind_at, w.entity_id, w.status::text AS status,
       ARRAY(SELECT s.name FROM work_assignment_assignees a
               JOIN staff s ON s.id = a.staff_id AND s.organization_id = a.organization_id
              WHERE a.organization_id = w.organization_id AND a.assignment_id = w.id
              ORDER BY s.name) AS assignees
  FROM work_assignments w
 WHERE w.organization_id = $1 AND w.id = $2`;

const fold = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Names as typed → staff ids. Exact full name first, then a unique first
 * name; "me" / "myself" is the caller. Every miss is reported by name.
 */
export function matchStaff(
  typed: string,
  roster: ReadonlyArray<{ id: number; name: string }>,
  selfId: number | null,
): { staff: Array<{ id: number; name: string }>; unmatched: string[] } {
  const staff = new Map<number, { id: number; name: string }>();
  const unmatched: string[] = [];
  for (const raw of typed.split(/,|&|\+|\band\b/i).map((s) => s.trim()).filter(Boolean)) {
    const want = fold(raw);
    if (/^(me|myself|i)$/.test(want)) {
      const self = roster.find((s) => s.id === selfId);
      if (self) staff.set(self.id, self);
      else unmatched.push(raw);
      continue;
    }
    const exact = roster.filter((s) => fold(s.name) === want);
    const first = exact.length ? exact : roster.filter((s) => fold(s.name).split(/\s+/)[0] === want);
    if (first.length === 1) staff.set(first[0].id, first[0]);
    else unmatched.push(raw);
  }
  return { staff: [...staff.values()], unmatched };
}

async function orgTimeZone(deps: ConfirmableWriteDeps, orgId: OrgId): Promise<string> {
  const tz = String((await deps.query(orgId, TZ_SQL, [orgId])).rows[0]?.tz ?? '').trim();
  try {
    if (tz) new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz || WAREHOUSE_TIME_ZONE;
  } catch {
    return WAREHOUSE_TIME_ZONE;
  }
}

type Payload = { task: TaskDraft; display: { assignees: string[]; order: string | null; timeZone: string } };

const spec: ConfirmableWriteSpec<typeof fields, Payload> = {
  name: CREATE_TASK_TOOL,
  kind: 'task.create',
  permission: 'work_orders.claim',
  description:
    'Create a task and assign it to one or more staff (it appears on each one\'s task list), optionally about an order and linked to a support ticket, with a deadline and a reminder. Pass names, order #, ticket # and times exactly as the user said them — they are resolved for you. Two steps: action "propose" shows the task and returns needs_confirmation — ASK the user to confirm and stop. Next message: "confirm" (yes) or "cancel" (no).',
  fields,
  pendingPhrase: (p) => `create the task "${p.task?.note ?? ''}" for ${(p.display?.assignees ?? []).join(', ')}`,
  propose: async (ctx, input, deps): Promise<ProposeOutcome<Payload>> => {
    if (!input.task) return { ok: false, error: 'What is the task? Ask the user what needs doing. Nothing was created.' };
    if (!input.assignees) return { ok: false, error: 'Who should do it? Ask the user for the staff names. Nothing was created.' };
    const [roster, timeZone] = await Promise.all([
      deps.query(ctx.organizationId, ROSTER_SQL, [ctx.organizationId]),
      orgTimeZone(deps, ctx.organizationId),
    ]);
    const people = roster.rows.map((r) => ({ id: Number(r.id), name: String(r.name) }));
    const { staff, unmatched } = matchStaff(input.assignees, people, ctx.staffId);
    if (unmatched.length > 0 || staff.length === 0) {
      return {
        ok: false,
        error: `Couldn't match staff: ${unmatched.join(', ') || input.assignees}. Active staff: ${people.map((p) => p.name).slice(0, 25).join(', ')}. Ask the user who they meant. Nothing was created.`,
      };
    }

    let orderRowId: number | null = null;
    let orderNumber: string | null = null;
    if (input.order) {
      const tokens = extractIdentifierTokens(input.order);
      const { lines, unmatched: missed } = await resolveOrderTokens(ctx, tokens.length ? tokens : [input.order.trim()], deps, false);
      const numbers = [...new Set(lines.map((l) => l.orderNumber))];
      if (missed.length > 0 || numbers.length !== 1) {
        return { ok: false, error: `Couldn't match order ${input.order}${missed[0] ? ` (${missed[0].why})` : ''}. Ask the user to check the order number. Nothing was created.` };
      }
      orderNumber = numbers[0];
      orderRowId = Math.min(...lines.map((l) => l.id));
    }

    let ticket: string | null = null;
    if (input.ticket) {
      const typed = input.ticket.replace(/^#/, '').trim();
      const { payload } = await deps.find({ orgId: ctx.organizationId, staffId: ctx.staffId, query: typed, limit: 5, surface: 'assistant' });
      if (payload.relaxed || !payload.rows.some((r) => r.entityType === 'ticket')) {
        return { ok: false, error: `Couldn't match ticket ${input.ticket}. Ask the user to check the ticket number. Nothing was created.` };
      }
      ticket = typed;
    }

    const now = new Date();
    const due = input.due ? resolveWhen(input.due, { now, timeZone, defaultHour: 17 }) : null;
    if (input.due && !due) return { ok: false, error: `Couldn't read the deadline "${input.due}". Ask for a day and time (e.g. "Friday 5pm"). Nothing was created.` };
    const remind = input.remind ? resolveWhen(input.remind, { now, timeZone, defaultHour: 9 }) : null;
    if (input.remind && !remind) return { ok: false, error: `Couldn't read the reminder time "${input.remind}". Ask for a time (e.g. "3pm" or "tomorrow 9am"). Nothing was created.` };

    const names = staff.map((s) => s.name);
    const draft: TaskDraft = {
      note: input.task,
      assigneeStaffIds: staff.map((s) => s.id),
      orderRowId,
      ticket,
      deadlineAt: due?.iso ?? null,
      remindAt: remind?.iso ?? null,
      actorStaffId: ctx.staffId,
    };
    return {
      ok: true,
      payload: { task: draft, display: { assignees: names, order: orderNumber, timeZone } },
      preview: (mutationId) =>
        brandReportEnvelope(
          {
            artifact: {
              kind: 'record',
              title: 'New task · confirm',
              path: orderRowId ? `/search?sel=order:${orderRowId}` : '/m/home',
              identity: {
                title: input.task!.slice(0, 120),
                subtitle: 'Task · not created yet',
                ids: orderNumber ? [{ label: 'Order', value: orderNumber }] : [],
                chips: names.slice(0, 6),
                ...(orderRowId ? { href: `/search?sel=order:${orderRowId}` } : {}),
              },
              fields: [
                { label: 'Assignees', value: names.join(', ') },
                { label: 'Due', value: due?.label ?? 'No deadline' },
                { label: 'Remind', value: remind?.label ?? 'No reminder' },
                ...(orderNumber ? [{ label: 'Order', value: orderNumber }] : []),
                ...(ticket ? [{ label: 'Ticket', value: `#${ticket}` }] : []),
              ],
            },
            summary: `Ready to create "${input.task}" for ${names.join(' and ')}${orderNumber ? ` about order ${orderNumber}` : ''}${due ? `, due ${due.label}` : ''}${remind ? `, reminder ${remind.label}` : ''} (change #${mutationId}). NOT created yet. Reply with exactly this question and stop: "Create this task for ${names.join(' and ')}${remind ? ` with a reminder ${remind.label}` : ''}? Reply yes to confirm." — call this tool with action "confirm" only after the user replies yes ("cancel" if they decline).`,
            answer: `Create this task for ${names.join(' and ')}${remind ? ` with a reminder ${remind.label}` : ''}? Reply yes to confirm.`,
          },
          CREATE_TASK_TOOL,
        ),
    };
  },
  settled: async (ctx, payload, mutationId, targetRef, deps) => {
    const taskId = Number(targetRef);
    const row = (await deps.query(ctx.organizationId, TASK_SQL, [ctx.organizationId, taskId])).rows[0];
    if (!row) return { ok: false, error: `Task ${targetRef} was not found after creating it.` };
    const tz = payload.display.timeZone;
    const at = (v: unknown) => (v ? formatWhen(new Date(String(v)), tz) : null);
    const names = (row.assignees as string[]) ?? [];
    const links = (await listTaskLinks(ctx.organizationId, taskId).catch(() => null)) ?? [];
    const ticket = links.find((l) => l.kind === 'ticket');
    const orderRowId = row.entity_id != null ? Number(row.entity_id) : null;
    return brandReportEnvelope(
      {
        artifact: {
          kind: 'record',
          title: `Task #${taskId} created`,
          path: `/m/home?task=${taskId}`,
          identity: {
            title: String(row.notes ?? payload.task.note).slice(0, 120),
            subtitle: `Task #${taskId} · on ${names.length === 1 ? `${names[0]}'s` : 'each assignee\'s'} task list`,
            ids: payload.display.order ? [{ label: 'Order', value: payload.display.order }] : [],
            chips: names.slice(0, 6),
            href: `/m/home?task=${taskId}`,
          },
          fields: [
            { label: 'Assignees', value: names.join(', ') },
            { label: 'Due', value: at(row.deadline_at) ?? 'No deadline' },
            { label: 'Remind', value: at(row.remind_at) ?? 'No reminder' },
            ...(payload.display.order && orderRowId ? [{ label: 'Order', value: payload.display.order }] : []),
            ...(payload.task.ticket ? [{ label: 'Ticket', value: ticket ? `#${payload.task.ticket} linked` : `#${payload.task.ticket} — not linked (helpdesk refused)` }] : []),
            { label: 'Change', value: `#${mutationId} · revertable (cancels the task)` },
          ],
        },
        summary: `Created task #${taskId} for ${names.join(' and ')} (change #${mutationId}; say "undo that" to cancel it). It is on their task lists.`,
        answer: `Done — task #${taskId} is on ${names.join(' and ')}'s task list${at(row.remind_at) ? `, reminder ${at(row.remind_at)}` : ''}.`,
      },
      CREATE_TASK_TOOL,
    );
  },
};

export const CREATE_TASK_SPEC = spec;

export function buildCreateTaskTool(
  sessionId: string | null,
  turnStartedAt: Date,
  deps?: ConfirmableWriteDeps,
): AssistantToolDef<z.ZodTypeAny, unknown> {
  return buildConfirmableWriteTool(spec, sessionId, turnStartedAt, deps);
}

/** Every ChatWrites confirmable tool by name — the pending-confirmation note reads its spec. */
export const CHAT_WRITE_SPECS: Readonly<Record<string, Parameters<typeof pendingConfirmableNote>[0]>> = {
  ...ORDER_STATUS_SPECS,
  [CREATE_TASK_TOOL]: spec,
};
