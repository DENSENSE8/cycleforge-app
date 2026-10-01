/** Workflow engine — production tap. */

import { and, asc, desc, eq, notExists, sql } from 'drizzle-orm';
import { db } from '@/lib/drizzle/db';
import { withTenantDrizzle } from '@/lib/drizzle/tenant-db';
import {
  itemWorkflowState,
  workflowDefinitions,
  workflowEdges,
  workflowNodes,
} from '@/lib/drizzle/schema';
import { recordOpsEvent, type RecordOpsEventInput } from '@/lib/ops-events';
import { isWorkflowTapOutboxEnabled } from '@/lib/feature-flags';
import type { NodeContext } from './contract';
import type { AdvanceArgs, AdvanceOutcome } from './advance';
import { advance } from './index';
import { enrollItem } from './store';
import { defaultTapOutbox, type TapOutboxDeps } from './tap-outbox';

/** Domain events the built-in station nodes are gated on. */
export type WorkflowTapEvent =
  | 'unit_received'
  | 'test_verdict'
  // Fired by the data-wipe station action (recordDataWipe) after a secure erase / factory reset.
  | 'data_wiped'
  | 'repair_completed'
  | 'listed'
  | 'packed'
  // Fired when the packer confirms the box contents against the SKU's kit-parts BOM (the kit_verify node).
  | 'pack_verified'
  | 'shipped'
  // Fired twice per return, by design (see the done-unit re-entry branch below and the `returns` node, nodes/returns.node.ts):
  | 'return_received';

export interface WorkflowTapArgs {
  serialUnitId: number;
  event: WorkflowTapEvent;
  /** Extra event payload merged into the node's ctx.input (e.g. { verdict }). */
  input?: Record<string, unknown>;
  staffId?: number | null;
  source?: NodeContext['actor']['source'];
  /**
   * Tenant id — required to ENROLL (only `unit_received` enrolls); ignored
   * for units that already have a workflow position.
   */
  orgId?: string | null;
  /** Position guard (opt-in). */
  expectNodeType?: string;
}

/** Why a tap did not land as an engine step. */
type WorkflowTapDropReason =
  /** Unit has no workflow row and this event can't enroll it (non-receiving event, or receiving with no org). */
  | 'unenrolled'
  /** unit_received with an org, but the org has no active workflow / entry node. */
  | 'no_active_workflow'
  /** Run already completed and the event isn't a return — stays finished by design. */
  | 'already_done'
  /** return_received on a done unit, but the org's graph has no returns node. */
  | 'no_returns_node'
  /** Defensive: no org resolvable after enrollment branches (should not happen). */
  | 'missing_org'
  /** Opt-in position guard: unit is parked at a different node type. */
  | 'node_type_mismatch'
  /** advance() returned a noop (locked / not_enrolled / already_terminal / broken_graph). */
  | 'advance_noop'
  /** advance() parked the unit in `error` (node error output). */
  | 'advance_error'
  /** tapWorkflow itself threw (DB down, engine bug) — the catch-all path. */
  | 'tap_exception';

/**
 * Injectable collaborators (house `Deps` pattern, backend-patterns.md) so the
 * drop/outbox behavior is unit-testable with zero DB — see tap.test.ts.
 * Production callers never pass this; defaults are the real impls.
 */
export interface TapDeps {
  loadTapState: typeof loadTapState;
  findEntryNode: typeof findEntryNode;
  findNodeOfType: typeof findNodeOfType;
  enroll: typeof enrollItem;
  advance: (orgId: string, args: Omit<AdvanceArgs, 'orgId'>) => Promise<AdvanceOutcome>;
  /** Best-effort ops_events emit for drop/divergence observability. */
  emitOps: (input: RecordOpsEventInput) => Promise<unknown>;
  /** Intended-tap outbox gate — real impl reads WORKFLOW_TAP_OUTBOX (default OFF). */
  outboxEnabled: () => boolean;
  outbox: TapOutboxDeps;
}

export const defaultTapDeps: TapDeps = {
  loadTapState,
  findEntryNode,
  findNodeOfType,
  enroll: enrollItem,
  advance,
  emitOps: recordOpsEvent,
  outboxEnabled: isWorkflowTapOutboxEnabled,
  outbox: defaultTapOutbox,
};

export async function tapWorkflow(
  args: WorkflowTapArgs,
  deps: TapDeps = defaultTapDeps,
): Promise<void> {
  // Best org we know for drop-event emission; refined once state loads. When
  // it stays null (unenrolled unit, caller passed no org) the drop event is
  // skipped — ops_events is org-scoped and there is nothing to scope to.
  let dropOrgId: string | null = args.orgId ?? null;
  // The unit's parked node, for the drop event's workflow_node_id "where"
  // axis (ops-events unification Phase 2). Null until state loads / when the
  // unit is unenrolled — the column is nullable by design.
  let dropNodeId: string | null = null;
  try {
    // Deliberate pre-read even though advance() loads state again:
    const state = await loadState(args, deps);

    let orgId = state?.organizationId ?? null;
    dropOrgId = orgId ?? dropOrgId;
    dropNodeId = state?.currentNodeId ?? null;

    if (!state) {
      // Only the receiving event starts a run; later-stage events on an
      // unenrolled unit (legacy stock, pre-rollout units) are dropped.
      if (args.event !== 'unit_received' || !args.orgId) {
        await emitDrop(deps, args, dropOrgId, 'unenrolled', { hasOrg: Boolean(args.orgId) }, dropNodeId);
        return;
      }
      orgId = args.orgId;
      dropOrgId = orgId;

      const start = await deps.findEntryNode(orgId);
      if (!start) {
        // no active workflow for this org — nothing to do
        await emitDrop(deps, args, orgId, 'no_active_workflow', undefined, dropNodeId);
        return;
      }
      await deps.enroll({
        orgId,
        serialUnitId: args.serialUnitId,
        workflowDefinitionId: start.workflowDefinitionId,
        startNodeId: start.nodeId,
      });
    } else if (state.status === 'done') {
      // A completed run stays finished for every event EXCEPT a return:
      if (args.event !== 'return_received') {
        await emitDrop(deps, args, orgId, 'already_done', {
          currentNodeType: state.currentNodeType,
        }, dropNodeId);
        return;
      }
      const returnsNode = await deps.findNodeOfType(state.organizationId, 'returns');
      if (!returnsNode) {
        // no returns node in this org's graph
        await emitDrop(deps, args, orgId, 'no_returns_node', undefined, dropNodeId);
        return;
      }
      await deps.enroll({
        orgId: state.organizationId,
        serialUnitId: args.serialUnitId,
        workflowDefinitionId: returnsNode.workflowDefinitionId,
        startNodeId: returnsNode.nodeId,
      });
      // Fall through to advance() below so this same tap also runs the node
      // once parked (mirrors the fresh-enrollment branch above).
    }

    if (!orgId) {
      await emitDrop(deps, args, dropOrgId, 'missing_org', undefined, dropNodeId);
      return;
    }

    // Position guard: only advance when the unit is parked at the node this
    // event is meant for. Off that node, no-op (don't run the wrong node and
    // park it `blocked`). Only enrolled units reach here, so `state` is set.
    if (args.expectNodeType && state && state.currentNodeType !== args.expectNodeType) {
      await emitDrop(deps, args, orgId, 'node_type_mismatch', {
        expectedNodeType: args.expectNodeType,
        currentNodeType: state.currentNodeType,
      }, dropNodeId);
      return;
    }

    // Intended-tap outbox:
    let intentId: number | null = null;
    if (deps.outboxEnabled()) {
      try {
        intentId = await deps.outbox.recordIntent({
          organizationId: orgId,
          serialUnitId: args.serialUnitId,
          eventType: args.event,
          payload: {
            input: args.input ?? {},
            staffId: args.staffId ?? null,
            source: args.source ?? 'scan',
            expectNodeType: args.expectNodeType ?? null,
          },
        });
      } catch (err) {
        console.warn('[workflow-tap] outbox intent write failed (non-fatal):', err);
      }
    }

    const outcome = await deps.advance(orgId, {
      serialUnitId: args.serialUnitId,
      actor: { staffId: args.staffId ?? null, source: args.source ?? 'scan' },
      input: { event: args.event, ...(args.input ?? {}) },
    });

    if (outcome.status === 'noop' || outcome.status === 'error') {
      // The engine did not durably apply this event — surface the divergence.
      await emitDrop(
        deps,
        args,
        orgId,
        outcome.status === 'noop' ? 'advance_noop' : 'advance_error',
        { outcome },
        dropNodeId,
      );
      if (intentId != null) {
        // `locked` is transient contention — leave the intent PENDING so the
        // reconciler re-drives it. Everything else is a durable non-apply.
        if (outcome.status === 'noop' && outcome.reason === 'locked') return;
        await safeOutbox(() =>
          deps.outbox.markFailed(
            intentId as number,
            outcome.status === 'noop' ? `noop:${outcome.reason}` : `error:${outcome.error}`,
          ),
        );
      }
      return;
    }

    // moved | done | blocked all mean the engine durably recorded the event
    // (blocked is a normal await-park, not a loss) — the intent landed.
    if (intentId != null) {
      await safeOutbox(() => deps.outbox.markLanded(intentId as number));
    }
  } catch (err) {
    console.warn(
      `[workflow-tap] ${args.event} for unit ${args.serialUnitId} failed (non-fatal):`,
      err,
    );
    // A thrown error after an intent was recorded deliberately leaves the row
    // PENDING — that is exactly the "lost tap" the reconciler exists for.
    await emitDrop(deps, args, dropOrgId, 'tap_exception', {
      error: err instanceof Error ? err.message : String(err),
    }, dropNodeId);
  }
}

/** Injected-state read, kept out of the main flow for readability. */
async function loadState(args: WorkflowTapArgs, deps: TapDeps) {
  return deps.loadTapState(args.serialUnitId, args.orgId ?? null);
}

/**
 * Best-effort `workflow_tap_dropped` ops_events emit. Never throws (a failed
 * observability write must not fail a production scan, same contract as the
 * tap itself). Skipped when no org is resolvable — ops_events is org-scoped.
 */
async function emitDrop(
  deps: TapDeps,
  args: WorkflowTapArgs,
  orgId: string | null,
  reason: WorkflowTapDropReason,
  extra?: Record<string, unknown>,
  nodeId: string | null = null,
): Promise<void> {
  if (!orgId) return;
  try {
    await deps.emitOps({
      organizationId: orgId,
      entityType: 'serial_unit',
      entityId: args.serialUnitId,
      eventType: 'workflow_tap_dropped',
      // The unit's parked node when the drop happened — the tenant's Studio
      // "where" axis (ops-events unification Phase 2). Null when unenrolled.
      workflowNodeId: nodeId,
      payload: {
        event: args.event,
        reason,
        expectNodeType: args.expectNodeType ?? null,
        source: args.source ?? 'scan',
        ...(extra ?? {}),
      },
    });
  } catch (err) {
    console.warn('[workflow-tap] drop-event emit failed (non-fatal):', err);
  }
}

/** Outbox status flips are best-effort — the reconciler tolerates stale rows. */
async function safeOutbox(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.warn('[workflow-tap] outbox status update failed (non-fatal):', err);
  }
}

interface TapStateRow {
  organizationId: string;
  status: string;
  /** Current parked node's registry type — for the opt-in position guard. */
  currentNodeType: string | null;
  /** Current parked node's id (workflow_nodes.id) — threaded onto the drop event's `ops_events.workflow_node_id` "where" axis (Phase 2 of the… */
  currentNodeId?: string | null;
}

/** The org-discovery + position-guard pre-read against item_workflow_state. */
async function loadTapState(
  serialUnitId: number,
  orgId: string | null,
): Promise<TapStateRow | undefined> {
  if (orgId) {
    const [row] = await withTenantDrizzle(orgId, (tx) =>
      tx
        .select({
          organizationId: itemWorkflowState.organizationId,
          status: itemWorkflowState.status,
          currentNodeType: workflowNodes.type,
          currentNodeId: itemWorkflowState.currentNodeId,
        })
        .from(itemWorkflowState)
        .leftJoin(
          workflowNodes,
          and(
            eq(workflowNodes.id, itemWorkflowState.currentNodeId),
            eq(workflowNodes.workflowDefinitionId, itemWorkflowState.workflowDefinitionId),
          ),
        )
        .where(
          and(
            eq(itemWorkflowState.organizationId, orgId),
            eq(itemWorkflowState.serialUnitId, serialUnitId),
          ),
        )
        .limit(1),
    );
    return row;
  }

  const [row] = await db
    .select({
      organizationId: itemWorkflowState.organizationId,
      status: itemWorkflowState.status,
      currentNodeType: workflowNodes.type,
      currentNodeId: itemWorkflowState.currentNodeId,
    })
    .from(itemWorkflowState)
    .leftJoin(
      workflowNodes,
      and(
        eq(workflowNodes.id, itemWorkflowState.currentNodeId),
        eq(workflowNodes.workflowDefinitionId, itemWorkflowState.workflowDefinitionId),
      ),
    )
    .where(eq(itemWorkflowState.serialUnitId, serialUnitId))
    .limit(1);
  return row;
}

/** The org's active workflow definition + its entry node (the leftmost node with no inbound edges — what the canvas draws first). */
const ENTRY_CACHE_TTL_MS = 60_000;
const entryCache = new Map<
  string,
  { value: { workflowDefinitionId: number; nodeId: string } | null; at: number }
>();

async function findEntryNode(
  orgId: string,
): Promise<{ workflowDefinitionId: number; nodeId: string } | null> {
  const cached = entryCache.get(orgId);
  if (cached && Date.now() - cached.at < ENTRY_CACHE_TTL_MS) return cached.value;

  const value = await loadEntryNode(orgId);
  entryCache.set(orgId, { value, at: Date.now() });
  return value;
}

async function loadEntryNode(
  orgId: string,
): Promise<{ workflowDefinitionId: number; nodeId: string } | null> {
  const [def] = await db
    .select({ id: workflowDefinitions.id })
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.organizationId, orgId),
        eq(workflowDefinitions.isActive, true),
      ),
    )
    .orderBy(desc(workflowDefinitions.version))
    .limit(1);
  if (!def) return null;

  const [entry] = await db
    .select({ id: workflowNodes.id })
    .from(workflowNodes)
    .where(
      and(
        eq(workflowNodes.workflowDefinitionId, def.id),
        notExists(
          db
            .select({ one: sql`1` })
            .from(workflowEdges)
            .where(
              and(
                eq(workflowEdges.workflowDefinitionId, def.id),
                eq(workflowEdges.targetNode, workflowNodes.id),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(workflowNodes.positionX))
    .limit(1);
  if (!entry) return null;

  return { workflowDefinitionId: def.id, nodeId: entry.id };
}

/** The org's active workflow definition's node of a given registry TYPE (e.g. */
const nodeTypeCache = new Map<
  string,
  { value: { workflowDefinitionId: number; nodeId: string } | null; at: number }
>();

async function findNodeOfType(
  orgId: string,
  nodeType: string,
): Promise<{ workflowDefinitionId: number; nodeId: string } | null> {
  const cacheKey = `${orgId}:${nodeType}`;
  const cached = nodeTypeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ENTRY_CACHE_TTL_MS) return cached.value;

  const value = await loadNodeOfType(orgId, nodeType);
  nodeTypeCache.set(cacheKey, { value, at: Date.now() });
  return value;
}

async function loadNodeOfType(
  orgId: string,
  nodeType: string,
): Promise<{ workflowDefinitionId: number; nodeId: string } | null> {
  const [def] = await db
    .select({ id: workflowDefinitions.id })
    .from(workflowDefinitions)
    .where(
      and(
        eq(workflowDefinitions.organizationId, orgId),
        eq(workflowDefinitions.isActive, true),
      ),
    )
    .orderBy(desc(workflowDefinitions.version))
    .limit(1);
  if (!def) return null;

  const [node] = await db
    .select({ id: workflowNodes.id })
    .from(workflowNodes)
    .where(
      and(
        eq(workflowNodes.workflowDefinitionId, def.id),
        eq(workflowNodes.type, nodeType),
      ),
    )
    .limit(1);
  if (!node) return null;

  return { workflowDefinitionId: def.id, nodeId: node.id };
}
