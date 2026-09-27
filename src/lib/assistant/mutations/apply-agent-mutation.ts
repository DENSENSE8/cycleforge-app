/** applyAgentMutation — the single AI write chokepoint (universal-feed plan §2.6 / §6). */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { recordOpsEvent } from '@/lib/ops-events';
import { publishAssistantMutation } from '@/lib/realtime/publish';

/** recordAudit's first param type (the local Queryable is unexported). */
type AuditDb = Parameters<typeof recordAudit>[0];
import {
  MUTATION_KINDS,
  isMutationKind,
  mutationTrustClass,
  type MutationKind,
  type MutationTrustClass,
} from '@/lib/surfaces/registry';
import {
  createNodeSurface,
  deleteNodeSurface,
  insertStaffRailExclusion,
  deleteStaffRailExclusion,
  setFeedMembershipState,
  setNodeSurfaceConfig,
  type FeedWriteClient,
  type FeedWriteInverse,
} from '@/lib/surfaces/feed-writes';
import { recordEntitySignal } from '@/lib/surfaces/record-entity-signal';
import {
  PhotoReassignError,
  makeReassignDepsForClient,
  reassignReceivingPhoto,
  type ReassignClient,
} from '@/lib/photos/reassign-receiving-photo';
import { normalizeReassignPayload } from './reassign-payload';
import {
  draftAddEdge,
  draftAddNode,
  draftRemoveEdge,
  draftRemoveNode,
  draftReplaceNodeConfig,
  draftRestoreNode,
  draftSetAnnotations,
  draftUpdateNodeConfig,
  type DraftGraphClient,
  type DraftGraphInverse,
} from '@/lib/workflow/draft-graph-writes';
import { assignSkuBrand, createBrand, updateBrand } from '@/lib/brands/brands';
import { sqlBrandStore, type Queryable } from '@/lib/brands/store';
import {
  BrandCreateMutationPayload,
  BrandUpdateMutationPayload,
  SkuBrandAssignPayload,
} from '@/lib/schemas/brands';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { OrderManualError, linkManualToSkuInTx, restoreManualPairingInTx } from '@/lib/manuals/order-manuals';
import { ManualOrderRefused, createManualOrderInTx, registerDraftTracking } from '@/lib/orders/create-order';
import { manualOrderDraftSchema } from '@/lib/orders/manual-order-draft';
import { PoImportRefused, importPurchaseOrderInTx } from '@/lib/inbound/import-po';
import { poImportDraftSchema } from '@/lib/inbound/po-import-draft';
import type { TxClient } from '@/lib/inbound/purchase-links';
import { dispatchChatWrite } from './chat-write-dispatch';

type Client = FeedWriteClient & DraftGraphClient;
type Payload = Record<string, unknown>;
type Inverse = { kind: string; payload: Payload } | null;

interface ApplyAgentMutationInput {
  organizationId: OrgId;
  mutationKind: string;
  payload: Payload;
  proposedByStaffId?: number | null;
  aiChatSessionId?: string | null;
}

type ApplyAgentMutationResult =
  | { ok: true; status: 'applied' | 'proposed'; mutationId: number; trust: MutationTrustClass; targetRef: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

export interface AgentMutationSideEffects {
  organizationId: OrgId;
  mutationId: number;
  mutationKind: MutationKind;
  action: string;
  actorStaffId: number | null;
  targetRef: string | null;
  db: AuditDb;
}

export interface ApplyAgentMutationDeps {
  runTransaction: <T>(orgId: OrgId, fn: (client: Client) => Promise<T>) => Promise<T>;
  /** Post-commit audit + ops_event + Ably. Overridable/no-op in tests. */
  sideEffects: (e: AgentMutationSideEffects) => Promise<void>;
}

/** One guarded write per mutation kind → { ok, inverse, targetRef } or an error. */
async function dispatchApply(
  client: Client,
  orgId: OrgId,
  kind: MutationKind,
  payload: Payload,
): Promise<{ ok: true; inverse: Inverse; targetRef: string | null } | { ok: false; status: 400 | 404 | 409; error: string }> {
  const p = payload;
  switch (kind) {
    case 'staff_rail_exclusion.insert': {
      const r = await insertStaffRailExclusion(client, orgId, p as never);
      return r.ok
        ? { ok: true, inverse: r.inverse as Inverse, targetRef: r.entityId != null ? String(r.entityId) : null }
        : { ok: false, status: 400, error: r.error ?? 'invalid' };
    }
    case 'staff_rail_exclusion.delete': {
      const r = await deleteStaffRailExclusion(client, orgId, p as never);
      return r.ok
        ? { ok: true, inverse: r.inverse as Inverse, targetRef: r.entityId != null ? String(r.entityId) : null }
        : { ok: false, status: 400, error: r.error ?? 'invalid' };
    }
    case 'feed_membership.set_state': {
      const r = await setFeedMembershipState(client, orgId, p as never);
      return r.ok
        ? { ok: true, inverse: r.inverse as Inverse, targetRef: r.entityId != null ? String(r.entityId) : null }
        : { ok: false, status: 404, error: r.error ?? 'invalid' };
    }
    case 'entity_signal.insert': {
      // Append-only fact — the signal IS the action, so a validation/DB failure must surface (unlike the fire-and-forget chokepoint taps).
      const sig = await recordEntitySignal(
        {
          ...(p as Record<string, unknown>),
          organizationId: orgId,
          client,
        } as unknown as Parameters<typeof recordEntitySignal>[0],
      );
      if (!sig.ok) return { ok: false, status: 400, error: sig.error };
      return { ok: true, inverse: null, targetRef: sig.id != null ? String(sig.id) : null };
    }
    case 'receiving_photo.reassign': {
      const norm = normalizeReassignPayload(p);
      if (!norm.ok) return { ok: false, status: 400, error: norm.error };

      // ALL-OR-NOTHING, on purpose.
      const undo: Array<{ photoId: number; targetEntityType: string; targetEntityId: number }> = [];
      const deps = makeReassignDepsForClient(client as unknown as ReassignClient);
      try {
        for (const move of norm.moves) {
          const r = await reassignReceivingPhoto(
            {
              organizationId: orgId,
              photoId: move.photoId,
              targetEntityType: move.targetEntityType,
              targetEntityId: move.targetEntityId,
            },
            deps,
          );
          // Each photo's OWN prior home — a batch's photos can come from
          // different places, which is exactly why the inverse is a list.
          undo.push({
            photoId: move.photoId,
            targetEntityType: r.from.entityType,
            targetEntityId: r.from.entityId,
          });
        }
      } catch (err) {
        if (err instanceof PhotoReassignError) {
          return {
            ok: false,
            status: err.status,
            error:
              norm.moves.length > 1
                ? `${err.message} (no photos were moved — the whole change was rolled back)`
                : err.message,
          };
        }
        throw err;
      }

      return {
        ok: true,
        inverse: { kind: 'receiving_photo.reassign', payload: { moves: undo } },
        // One target ref for a single move; the batch is described by the
        // mutation payload itself.
        targetRef: undo.length === 1 ? String(undo[0]!.photoId) : `${undo.length} photos`,
      };
    }
    case 'node_surface.set_config': {
      const r = await setNodeSurfaceConfig(client, orgId, p as never);
      return feedToDispatch(r);
    }
    case 'node_surface.create': {
      const r = await createNodeSurface(client, orgId, p as never);
      return feedToDispatch(r);
    }
    case 'node_surface.delete': {
      const r = await deleteNodeSurface(client, orgId, p as never);
      return feedToDispatch(r);
    }
    case 'workflow_draft.add_node':
      return draftToDispatch(await draftAddNode(client, orgId, p as never));
    case 'workflow_draft.remove_node':
      return draftToDispatch(await draftRemoveNode(client, orgId, p as never));
    case 'workflow_draft.restore_node' as MutationKind:
      return draftToDispatch(await draftRestoreNode(client, orgId, p as never));
    case 'workflow_draft.update_node_config':
      return draftToDispatch(await draftUpdateNodeConfig(client, orgId, p as never));
    case 'workflow_draft.replace_node_config' as MutationKind:
      return draftToDispatch(await draftReplaceNodeConfig(client, orgId, p as never));
    case 'workflow_draft.add_edge':
      return draftToDispatch(await draftAddEdge(client, orgId, p as never));
    case 'workflow_draft.remove_edge':
      return draftToDispatch(await draftRemoveEdge(client, orgId, p as never));
    case 'workflow_draft.set_annotations':
      return draftToDispatch(await draftSetAnnotations(client, orgId, p as never));
    case 'brand.create':
    case 'brand.update':
    case 'sku_brand.assign':
      return dispatchBrand(client, orgId, kind, payload);
    case 'product_manual.link_sku':
      return dispatchManualLink(client, orgId, payload);
    case 'order.create_manual':
      return dispatchManualOrder(client, orgId, payload);
    case 'receiving.import_po':
      return dispatchPoImport(client, orgId, payload);
    case 'order.set_flag':
    case 'order.mark_out_of_stock':
    case 'order.clear_out_of_stock':
    case 'order.scan_out':
    case 'task.create':
      return dispatchChatWrite(client as unknown as PoolClient, orgId, kind, payload);
    default:
      // review-class kinds never reach dispatchApply; anything else is a gap.
      return { ok: false, status: 400, error: `no apply path for mutation kind "${kind}"` };
  }
}

type DispatchResult =
  | { ok: true; inverse: Inverse; targetRef: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

function payloadError(kind: string, issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): DispatchResult {
  const detail = issues.map((i) => `${i.path.map(String).join('.') || '(payload)'}: ${i.message}`).join('; ');
  return { ok: false, status: 400, error: `invalid ${kind} payload — ${detail}` };
}

const ManualLinkPayload = z.union([
  z.object({ manualId: z.number().int().positive(), sku: z.string().trim().min(1).max(100) }).strict(),
  // The inverse: the manual's exact prior pairing.
  z
    .object({
      manualId: z.number().int().positive(),
      restore: z
        .object({
          orderId: z.number().int().positive().nullable(),
          itemNumber: z.string().max(64).nullable(),
          sku: z.string().max(100).nullable(),
          skuCatalogId: z.number().int().positive().nullable(),
        })
        .strict(),
    })
    .strict(),
]);

/** Manual ↔ SKU pairing (review class: applied by the operator's confirmation or a reviewer, or by a revert). */
async function dispatchManualLink(client: Client, orgId: OrgId, payload: Payload): Promise<DispatchResult> {
  const parsed = ManualLinkPayload.safeParse(payload);
  if (!parsed.success) return payloadError('product_manual.link_sku', parsed.error.issues);
  const pg = client as unknown as PoolClient;
  try {
    if ('restore' in parsed.data) {
      await restoreManualPairingInTx(pg, orgId, parsed.data.manualId, parsed.data.restore);
      return { ok: true, inverse: null, targetRef: String(parsed.data.manualId) };
    }
    const link = await linkManualToSkuInTx(pg, orgId, parsed.data.manualId, parsed.data.sku);
    return {
      ok: true,
      inverse: { kind: 'product_manual.link_sku', payload: { manualId: link.manualId, restore: link.before } },
      targetRef: String(link.manualId),
    };
  } catch (err) {
    if (err instanceof OrderManualError) {
      return { ok: false, status: err.status === 404 ? 404 : 400, error: err.message };
    }
    throw err;
  }
}

const ManualOrderPayload = z.object({ draft: manualOrderDraftSchema }).strict();

/**
 * A chat-drafted order — phone or any sales channel (review class: applied by
 * the operator's confirmation or a reviewer). The same writes as POST
 * /api/orders/add, inside the review transaction; its tracking is registered
 * as a shipment first, as that route does. Not revertable — an order is
 * cancelled, not undone. `targetRef` is the order NUMBER: one order may be
 * several rows.
 */
async function dispatchManualOrder(client: Client, orgId: OrgId, payload: Payload): Promise<DispatchResult> {
  const parsed = ManualOrderPayload.safeParse(payload);
  if (!parsed.success) return payloadError('order.create_manual', parsed.error.issues);
  try {
    const shipmentIds = await registerDraftTracking(orgId, parsed.data.draft);
    const created = await createManualOrderInTx(client as unknown as PoolClient, orgId, null, parsed.data.draft, undefined, shipmentIds);
    return { ok: true, inverse: null, targetRef: created.orderNumber };
  } catch (err) {
    if (err instanceof ManualOrderRefused) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}

const PoImportPayload = z.object({ draft: poImportDraftSchema }).strict();

/**
 * A chat-drafted purchase order (review class: applied by the operator's
 * confirmation or a reviewer). The same ingestPurchase the Incoming desk Add
 * runs, inside the review transaction. Not revertable. `targetRef` is the PO
 * number; the receiving ids ride back through the tool's read-back.
 */
async function dispatchPoImport(client: Client, orgId: OrgId, payload: Payload): Promise<DispatchResult> {
  const parsed = PoImportPayload.safeParse(payload);
  if (!parsed.success) return payloadError('receiving.import_po', parsed.error.issues);
  try {
    const imported = await importPurchaseOrderInTx(client as unknown as TxClient, orgId, parsed.data.draft);
    return { ok: true, inverse: null, targetRef: imported.poNumber };
  } catch (err) {
    if (err instanceof PoImportRefused) return { ok: false, status: err.status, error: err.message };
    throw err;
  }
}

/** Brand vocabulary + SKU brand writes (review class: reached only through an approval or a revert). */
async function dispatchBrand(
  client: Client,
  orgId: OrgId,
  kind: 'brand.create' | 'brand.update' | 'sku_brand.assign',
  payload: Payload,
): Promise<DispatchResult> {
  const store = sqlBrandStore(client as unknown as Queryable, orgId);
  if (kind === 'brand.create') {
    const parsed = BrandCreateMutationPayload.safeParse(payload);
    if (!parsed.success) return payloadError(kind, parsed.error.issues);
    const { assignSkuCatalogIds, dedupeKey: _dedupeKey, aliasSource, ...input } = parsed.data;
    const r = await createBrand(store, { ...input, aliasSource: aliasSource ?? 'agent' });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    if (assignSkuCatalogIds?.length) {
      // A Zoho brand is the Zoho item's own fact; anything else a human just confirmed.
      const source = aliasSource === 'zoho' ? 'zoho' : 'operator';
      await store.writeDerivedBrands(
        assignSkuCatalogIds.map((skuCatalogId) => ({ skuCatalogId, brandId: r.brand.id, confidence: 1, source })),
      );
    }
    // Creating vocabulary is not undone by deleting it (SKUs may already point at it).
    return { ok: true, inverse: null, targetRef: String(r.brand.id) };
  }
  if (kind === 'brand.update') {
    const parsed = BrandUpdateMutationPayload.safeParse(payload);
    if (!parsed.success) return payloadError(kind, parsed.error.issues);
    const { brandId, dedupeKey: _dedupeKey, ...patch } = parsed.data;
    const before = await store.getBrand(brandId);
    if (!before) return { ok: false, status: 404, error: 'brand not found' };
    const aliasesBefore = await store.listAliases(brandId);
    const r = await updateBrand(store, brandId, { ...patch, aliasSource: 'agent' });
    if (!r.ok) return { ok: false, status: r.status, error: r.error };
    const had = new Set(aliasesBefore.map((a) => a.normalizedAlias));
    const has = new Set(r.aliases.map((a) => a.normalizedAlias));
    const inverse: Payload = {
      brandId,
      ...(r.brand.name !== before.name ? { name: before.name } : {}),
      ...(r.brand.kind !== before.kind ? { kind: before.kind } : {}),
      ...(r.brand.parentBrandId !== before.parentBrandId ? { parentBrandId: before.parentBrandId } : {}),
      ...(r.brand.publisher !== before.publisher ? { publisher: before.publisher } : {}),
      ...(r.brand.isActive !== before.isActive ? { isActive: before.isActive } : {}),
      aliasesAdd: aliasesBefore.filter((a) => !has.has(a.normalizedAlias)).map((a) => a.alias),
      aliasesRemove: r.aliases.filter((a) => !had.has(a.normalizedAlias)).map((a) => a.alias),
    };
    return { ok: true, inverse: r.changed ? { kind: 'brand.update', payload: inverse } : null, targetRef: String(brandId) };
  }
  const parsed = SkuBrandAssignPayload.safeParse(payload);
  if (!parsed.success) return payloadError(kind, parsed.error.issues);
  const { skuCatalogId, brandId, restore } = parsed.data;
  if (brandId == null && !restore && parsed.data.reason === 'compat_mention') {
    return {
      ok: false,
      status: 400,
      error: 'a compatibility proposal names no brand — approve it with the brand to set (brandId)',
    };
  }
  const r = await assignSkuBrand(store, { skuCatalogId, brandId, restore });
  if (!r.ok) return { ok: false, status: r.status, error: r.error };
  return {
    ok: true,
    inverse: { kind: 'sku_brand.assign', payload: { skuCatalogId, brandId: r.previous.brandId, restore: r.previous } },
    targetRef: String(skuCatalogId),
  };
}

function feedToDispatch(r: { ok: boolean; error?: string; status?: 400 | 404 | 409; inverse: FeedWriteInverse; entityId?: number }) {
  return r.ok
    ? { ok: true as const, inverse: r.inverse as Inverse, targetRef: r.entityId != null ? String(r.entityId) : null }
    : { ok: false as const, status: (r.status ?? 400) as 400 | 404 | 409, error: r.error ?? 'invalid' };
}

function draftToDispatch(r: { ok: boolean; error?: string; status?: 400 | 404 | 409 | 422; inverse: DraftGraphInverse; targetRef?: string }) {
  return r.ok
    ? { ok: true as const, inverse: r.inverse as Inverse, targetRef: r.targetRef ?? null }
    : { ok: false as const, status: (r.status === 422 ? 400 : r.status ?? 400) as 400 | 404 | 409, error: r.error ?? 'invalid' };
}

const defaultDeps: ApplyAgentMutationDeps = {
  runTransaction: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as Client)),
  sideEffects: defaultSideEffects,
};

async function defaultSideEffects(e: AgentMutationSideEffects): Promise<void> {
  try {
    await recordAudit(e.db, null, null, {
      source: 'assistant.mutation',
      action: e.action,
      entityType: AUDIT_ENTITY.AGENT_MUTATION,
      entityId: e.mutationId,
      method: 'system',
      actorStaffIdOverride: e.actorStaffId,
      organizationIdOverride: e.organizationId,
      extra: { mutationKind: e.mutationKind, targetRef: e.targetRef },
    });
  } catch (err) {
    console.warn('[agent-mutation] audit failed (non-fatal):', err);
  }
  try {
    await recordOpsEvent({
      organizationId: e.organizationId,
      entityType: 'other',
      entityId: e.mutationId,
      eventType: e.action,
      actorStaffId: e.actorStaffId,
      clientEventId: `agent-mutation:${e.mutationId}:${e.action}`,
      payload: { mutationKind: e.mutationKind, targetRef: e.targetRef },
    });
  } catch (err) {
    console.warn('[agent-mutation] ops_event failed (non-fatal):', err);
  }
  try {
    await publishAssistantMutation({
      organizationId: e.organizationId,
      mutationId: e.mutationId,
      mutationKind: e.mutationKind,
      action: e.action,
      targetRef: e.targetRef,
    });
  } catch (err) {
    console.warn('[agent-mutation] realtime publish failed (non-fatal):', err);
  }
}

export async function applyAgentMutation(
  input: ApplyAgentMutationInput,
  deps: ApplyAgentMutationDeps = defaultDeps,
): Promise<ApplyAgentMutationResult> {
  if (!input.organizationId) return { ok: false, status: 400, error: 'organizationId is required' };
  if (!isMutationKind(input.mutationKind)) {
    return { ok: false, status: 400, error: `unknown mutation kind "${input.mutationKind}"` };
  }
  const kind = input.mutationKind;
  const trust = mutationTrustClass(kind);
  const payload = input.payload ?? {};
  const actorStaffId = input.proposedByStaffId ?? null;
  const sessionId = input.aiChatSessionId ?? null;

  // ── review-class: propose only, never apply ────────────────────────────────
  if (trust === 'review') {
    const outcome = await deps.runTransaction(input.organizationId, async (client) => {
      const row = await client.query(
        `INSERT INTO agent_mutations
           (organization_id, proposed_by_staff_id, ai_chat_session_id, status, mutation_kind, payload)
         VALUES ($1, $2, $3, 'proposed', $4, $5::jsonb)
         RETURNING id`,
        [input.organizationId, actorStaffId, sessionId, kind, JSON.stringify(payload)],
      );
      const mutationId = Number(row.rows[0].id);
      await insertAffects(client, input.organizationId, mutationId, kind, MUTATION_KINDS[kind].targetKind, null);
      return mutationId;
    });
    await deps.sideEffects({
      organizationId: input.organizationId,
      mutationId: outcome,
      mutationKind: kind,
      action: AUDIT_ACTION.AGENT_MUTATION_PROPOSE,
      actorStaffId,
      targetRef: null,
      db: poolDb(deps),
    });
    return { ok: true, status: 'proposed', mutationId: outcome, trust, targetRef: null };
  }

  // ── auto / draft_scoped: apply in one tx ───────────────────────────────────
  type ApplyOutcome =
    | { failed: ApplyAgentMutationResult & { ok: false } }
    | { failed: null; mutationId: number; targetRef: string | null };
  const outcome: ApplyOutcome = await deps.runTransaction(input.organizationId, async (client): Promise<ApplyOutcome> => {
    const applied = await dispatchApply(client, input.organizationId, kind, payload);
    if (!applied.ok) return { failed: { ok: false, status: applied.status, error: applied.error } };

    const row = await client.query(
      `INSERT INTO agent_mutations
         (organization_id, proposed_by_staff_id, ai_chat_session_id, status, mutation_kind, payload,
          applied_by, applied_at, extra_audit)
       VALUES ($1, $2, $3, 'applied', $4, $5::jsonb, $2, NOW(), $6::jsonb)
       RETURNING id`,
      [
        input.organizationId,
        actorStaffId,
        sessionId,
        kind,
        JSON.stringify(payload),
        JSON.stringify({ inverse: applied.inverse, trust }),
      ],
    );
    const mutationId = Number(row.rows[0].id);
    await insertAffects(client, input.organizationId, mutationId, kind, MUTATION_KINDS[kind].targetKind, applied.targetRef);
    return { failed: null, mutationId, targetRef: applied.targetRef };
  });

  if (outcome.failed) return outcome.failed;

  await deps.sideEffects({
    organizationId: input.organizationId,
    mutationId: outcome.mutationId,
    mutationKind: kind,
    action: AUDIT_ACTION.AGENT_MUTATION_APPLY,
    actorStaffId,
    targetRef: outcome.targetRef,
    db: poolDb(deps),
  });
  return { ok: true, status: 'applied', mutationId: outcome.mutationId, trust, targetRef: outcome.targetRef };
}

// ─── revert ──────────────────────────────────────────────────────────────────

interface RevertAgentMutationResult {
  ok: boolean;
  /** 403 = the actor may not revert this KIND (see MutationKindDef.permission). */
  status: 200 | 400 | 403 | 404 | 409;
  error?: string;
}

export async function revertAgentMutation(
  mutationId: number,
  orgId: OrgId,
  actorStaffId: number | null,
  deps: ApplyAgentMutationDeps = defaultDeps,
  /** The actor's permissions. */
  actorPermissions?: ReadonlySet<string>,
): Promise<RevertAgentMutationResult> {
  const outcome = await deps.runTransaction(orgId, async (client) => {
    const row = await client.query(
      `SELECT status, mutation_kind, extra_audit FROM agent_mutations
        WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
      [orgId, mutationId],
    );
    if (row.rows.length === 0) return { status: 404 as const, error: 'mutation not found' };
    const r = row.rows[0];
    if (r.status !== 'applied') return { status: 409 as const, error: `mutation is ${r.status}, only applied mutations revert` };
    const revertKind = String(r.mutation_kind);
    if (actorPermissions && isMutationKind(revertKind)) {
      const need = MUTATION_KINDS[revertKind].permission;
      if (!actorPermissions.has(need)) {
        return { status: 403 as const, error: `reverting "${revertKind}" requires ${need}` };
      }
    }
    const extra = (r.extra_audit ?? {}) as { inverse?: Inverse };
    const inverse = extra.inverse ?? null;
    if (!inverse) return { status: 409 as const, error: 'this mutation is not revertable (append-only or missing inverse)' };

    if (!isMutationKind(inverse.kind) && !inverse.kind.startsWith('workflow_draft.')) {
      return { status: 400 as const, error: `unknown inverse kind "${inverse.kind}"` };
    }
    const applied = await dispatchApply(client, orgId, inverse.kind as MutationKind, inverse.payload);
    if (!applied.ok) return { status: applied.status, error: applied.error };

    await client.query(
      `UPDATE agent_mutations SET status = 'reverted', updated_at = NOW() WHERE organization_id = $1 AND id = $2`,
      [orgId, mutationId],
    );
    // Carry the ORIGINAL mutation's kind out so the side-effects (audit / ops /
    // Ably) classify the revert by what was reverted, not by the inverse.
    const revertedKind = isMutationKind(String(r.mutation_kind))
      ? (String(r.mutation_kind) as MutationKind)
      : null;
    return { status: 200 as const, mutationKind: revertedKind };
  });

  if (outcome.status === 200) {
    await deps.sideEffects({
      organizationId: orgId,
      mutationId,
      mutationKind: outcome.mutationKind ?? 'entity_signal.insert',
      action: AUDIT_ACTION.AGENT_MUTATION_REVERT,
      actorStaffId,
      targetRef: null,
      db: poolDb(deps),
    });
  }
  return { ok: outcome.status === 200, status: outcome.status, error: outcome.error };
}

// ─── review (approval-first queue, LAWS T28) ─────────────────────────────────

export interface ReviewAgentMutationInput {
  organizationId: OrgId;
  mutationId: number;
  decision: 'approve' | 'reject';
  actorStaffId: number | null;
  /** The reviewer's permissions — the kind's own permission is required to decide it. */
  actorPermissions: ReadonlySet<string>;
  notes?: string | null;
  /** Reviewer edits merged over the proposed payload before it applies (e.g. the brand a compat proposal lacks). */
  payloadPatch?: Payload;
  /** Restrict to these kinds (a domain-scoped queue); another kind is refused untouched. */
  kinds?: readonly MutationKind[];
}

export type ReviewAgentMutationResult =
  | { ok: true; status: 'applied' | 'rejected'; mutationId: number; targetRef: string | null }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

class ReviewRefused extends Error {
  constructor(readonly status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

/**
 * A human decides a queued proposal. Approve runs the kind's guarded write
 * and marks the row applied (with its inverse, so it stays revertable);
 * reject closes it. Any refusal rolls the whole transaction back.
 */
export async function reviewAgentMutation(
  input: ReviewAgentMutationInput,
  deps: ApplyAgentMutationDeps = defaultDeps,
): Promise<ReviewAgentMutationResult> {
  let outcome: { status: 'applied' | 'rejected'; kind: MutationKind; targetRef: string | null };
  try {
    outcome = await deps.runTransaction(input.organizationId, async (client) => {
      const row = await client.query(
        `SELECT status, mutation_kind, payload FROM agent_mutations
          WHERE organization_id = $1 AND id = $2 FOR UPDATE`,
        [input.organizationId, input.mutationId],
      );
      if (row.rows.length === 0) throw new ReviewRefused(404, 'mutation not found');
      const r = row.rows[0];
      if (r.status !== 'proposed' && r.status !== 'under_review') {
        throw new ReviewRefused(409, `mutation is ${r.status}; only proposed mutations can be reviewed`);
      }
      const kind = String(r.mutation_kind);
      if (!isMutationKind(kind)) throw new ReviewRefused(400, `unknown mutation kind "${kind}"`);
      if (input.kinds && !input.kinds.includes(kind)) {
        throw new ReviewRefused(400, `a "${kind}" mutation cannot be reviewed here`);
      }
      const need = MUTATION_KINDS[kind].permission;
      if (!input.actorPermissions.has(need)) throw new ReviewRefused(403, `reviewing "${kind}" requires ${need}`);

      if (input.decision === 'reject') {
        await client.query(
          `UPDATE agent_mutations
              SET status = 'rejected', review_notes = COALESCE($3, review_notes), updated_at = NOW()
            WHERE organization_id = $1 AND id = $2`,
          [input.organizationId, input.mutationId, input.notes ?? null],
        );
        return { status: 'rejected' as const, kind, targetRef: null };
      }

      const payload: Payload = { ...((r.payload ?? {}) as Payload), ...(input.payloadPatch ?? {}) };
      const applied = await dispatchApply(client, input.organizationId, kind, payload);
      if (!applied.ok) throw new ReviewRefused(applied.status, applied.error);
      await client.query(
        `UPDATE agent_mutations
            SET status = 'applied', payload = $3::jsonb, applied_by = $4, applied_at = NOW(),
                review_notes = COALESCE($5, review_notes), extra_audit = $6::jsonb, updated_at = NOW()
          WHERE organization_id = $1 AND id = $2`,
        [
          input.organizationId,
          input.mutationId,
          JSON.stringify(payload),
          input.actorStaffId,
          input.notes ?? null,
          JSON.stringify({ inverse: applied.inverse, trust: mutationTrustClass(kind), reviewedBy: input.actorStaffId }),
        ],
      );
      await insertAffects(client, input.organizationId, input.mutationId, kind, MUTATION_KINDS[kind].targetKind, applied.targetRef);
      return { status: 'applied' as const, kind, targetRef: applied.targetRef };
    });
  } catch (err) {
    if (err instanceof ReviewRefused) return { ok: false, status: err.status, error: err.message };
    throw err;
  }

  await deps.sideEffects({
    organizationId: input.organizationId,
    mutationId: input.mutationId,
    mutationKind: outcome.kind,
    action: outcome.status === 'applied' ? AUDIT_ACTION.AGENT_MUTATION_APPLY : AUDIT_ACTION.AGENT_MUTATION_REJECT,
    actorStaffId: input.actorStaffId,
    targetRef: outcome.targetRef,
    db: poolDb(deps),
  });
  return { ok: true, status: outcome.status, mutationId: input.mutationId, targetRef: outcome.targetRef };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function insertAffects(
  client: Client,
  orgId: OrgId,
  mutationId: number,
  kind: MutationKind,
  targetKind: string,
  targetRef: string | null,
): Promise<void> {
  if (!targetRef) return;
  await client.query(
    `INSERT INTO agent_mutation_affects (organization_id, agent_mutation_id, target_kind, target_ref, role_in_mutation)
     VALUES ($1, $2, $3, $4, 'primary')`,
    [orgId, mutationId, targetKind, `${targetKind}:entity:${targetRef}`],
  );
}

// The default sideEffects needs an audit db for recordAudit; the real one is
// the shared pool. Tests inject their own sideEffects and never call this.
function poolDb(deps: ApplyAgentMutationDeps): AuditDb {
  if (deps.sideEffects !== defaultSideEffects) {
    // Test path — sideEffects is overridden and won't touch db.
    return {} as AuditDb;
  }
  return (require('@/lib/db') as { default: AuditDb }).default;
}
