/**
 * Plan-agent server tools (ALP-3.5) — AI SDK `tool()` definitions for the
 * /forge plan agent (`POST /api/forge/chat`).
 *
 * `mutate_master_plan` edits the shared Y.Text through a short-lived server
 * doc session (server-doc.ts); Ably fans the update out to every web client
 * and the local sync daemon (which persists it into master-plan.mdx). The
 * global dock assistant's tool registry is untouched — these tools exist only
 * inside the forge chat route (locked decision: AI SDK is the forge beachhead).
 *
 * Deps-injected so unit tests run with a local in-memory doc and a captured
 * audit sink — no Ably, no DB (house pattern).
 */

import { tool } from 'ai';
import { z } from 'zod';
import type * as Y from 'yjs';
import { readMasterPlan, applyMasterPlanReplace } from '../doc';
import {
  TICKET_STATUSES,
  scanTicketStatuses,
  setTicketStatusInMdx,
  rollupTicketStatuses,
  type TicketStatus,
} from '../ticket-status';
import { withMasterPlanDoc, type WithMasterPlanDocResult } from '../server-doc';

export interface PlanToolsCtx {
  orgId: string;
  staffId: number;
}

export interface PlanToolsDeps {
  /**
   * Opens a synced doc session and runs the mutator (real impl: Ably join).
   * `seedForRead` local-seeds an empty forge-org room for display on read
   * paths; mutations pass false so they never fabricate+broadcast a doc.
   */
  withDoc: <T>(orgId: string, fn: (doc: Y.Doc) => T, opts?: { seedForRead?: boolean }) => Promise<WithMasterPlanDocResult<T>>;
  /** Audit sink — real impl wraps recordAudit; tests capture. Never throws. */
  audit: (entry: {
    orgId: string;
    staffId: number;
    ticketId: string;
    from: TicketStatus | null;
    to: TicketStatus;
    resolutionCommit?: string;
  }) => Promise<void>;
  /** Fire-and-forget hook after a successful mutation (ops-plans bridge etc.). */
  onMutated?: (ctx: PlanToolsCtx, mdx: string) => void;
}

export const MUTATE_MASTER_PLAN_INPUT = z.object({
  action: z.literal('set_ticket_status'),
  ticketId: z.string().min(1).max(80).describe('The ticket id, e.g. "ALP-3.4" or "P1-TRACE-02"'),
  status: z.enum(TICKET_STATUSES).describe('New status — ONLY pending | in-progress | deployed'),
  resolutionCommit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/i)
    .optional()
    .describe('Short/long git SHA; only meaningful when status is "deployed"'),
});

export function createPlanTools(ctx: PlanToolsCtx, deps: PlanToolsDeps) {
  const read_master_plan = tool({
    description:
      'Read the current shared master plan (raw MDX) plus a rollup of every <TicketStatus /> ticket. ' +
      'Call this before proposing or making changes.',
    inputSchema: z.object({}),
    execute: async () => {
      const { result } = await deps.withDoc(ctx.orgId, (doc) => readMasterPlan(doc), { seedForRead: true });
      const tickets = scanTicketStatuses(result);
      return {
        mdx: result,
        rollup: rollupTicketStatuses(tickets),
        tickets: tickets.map((t) => ({
          ticketId: t.ticketId,
          status: t.status ?? `INVALID(${t.rawStatus})`,
          href: t.href ?? null,
          resolutionCommit: t.resolutionCommit ?? null,
        })),
      };
    },
  });

  const mutate_master_plan = tool({
    description:
      'Mutate the shared master plan document. Currently supports flipping a <TicketStatus /> ticket ' +
      'to pending | in-progress | deployed (optionally stamping a resolutionCommit when deployed). ' +
      'The edit merges via CRDT and broadcasts live to every open dashboard and the local plan file.',
    inputSchema: MUTATE_MASTER_PLAN_INPUT,
    execute: async ({ ticketId, status, resolutionCommit }) => {
      // Never seed on the mutation path — a mutation broadcasts, and a
      // fabricated seed would collide with the daemon's authoritative one.
      const { result } = await deps.withDoc(
        ctx.orgId,
        (doc) => {
          const current = readMasterPlan(doc);
          const edit = setTicketStatusInMdx(current, ticketId, status, resolutionCommit ? { resolutionCommit } : undefined);
          if (edit.previousStatus === null && !edit.changed) {
            return { ok: false as const, error: 'ticket_not_found' as const, mdx: current };
          }
          if (edit.changed) applyMasterPlanReplace(doc, edit.mdx, 'plan-agent');
          return {
            ok: true as const,
            changed: edit.changed,
            previousStatus: edit.previousStatus,
            mdx: edit.mdx,
          };
        },
        { seedForRead: false },
      );

      if (result.ok && result.changed) {
        await deps.audit({
          orgId: ctx.orgId,
          staffId: ctx.staffId,
          ticketId,
          from: result.previousStatus,
          to: status,
          resolutionCommit,
        });
        deps.onMutated?.(ctx, result.mdx);
      }

      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        ticketId,
        previousStatus: result.previousStatus,
        status,
        changed: result.changed,
      };
    },
  });

  return { read_master_plan, mutate_master_plan };
}

/** Real deps used by the route (kept here so the route stays thin). */
export function defaultPlanToolsDeps(overrides: Partial<PlanToolsDeps> = {}): PlanToolsDeps {
  return {
    withDoc: (orgId, fn, opts) => withMasterPlanDoc(orgId, fn, undefined, opts),
    audit: async () => {
      /* wired by the route with recordAudit — kept inert here to stay DB-free */
    },
    ...overrides,
  };
}
