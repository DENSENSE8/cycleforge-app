/** Link ANY identifier to a carton — whether or not the order exists yet. */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { relinkReceivingPo, type RelinkPoResult, type TxClient } from './relink-po';
import {
  listPurchaseLinksForLine,
  upsertPurchaseLink,
  type PurchaseLinkRow,
} from '@/lib/inbound/purchase-links';
import { importSalesOrderByNumber } from './returned-serial-link';
import { inferMarketplaceFromOrderId } from '@/lib/marketplace-order-id';

/**
 * The `source_type` a hand-linked identifier wears until an import resolves it.
 * Registered in `src/lib/inbound/source-registry.ts` and in every polymorphic
 * CHECK — this is not a new discriminator.
 */
const PENDING_IDENTIFIER_SOURCE = 'manual';

/**
 * Comparison key for an external identifier: uppercase alphanumerics only, so
 * `PO-6001`, `po 6001` and `PO6001` are one id. Mirrors
 * `zoho_purchaseorder_number_norm` and the po-search normalization.
 */
export function normalizeIdentifierKey(raw: string | null | undefined): string {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

interface LinkCartonIdentifierInput {
  receivingId: number;
  /** The line to carry the purchase-identity link. Optional: carton-only link. */
  lineId?: number | null;
  /** Raw operator input — PO#, order#, RMA, supplier ref. */
  identifier: string;
}

type LinkCartonIdentifierOutcome = 'linked' | 'pending';

interface LinkCartonIdentifierResult {
  ok: boolean;
  /** HTTP status the route maps straight through. */
  status: number;
  error?: string;
  outcome?: LinkCartonIdentifierOutcome;
  receivingId: number;
  identifier: string;
  /** Set only when the identifier resolved to a purchase order. */
  poId?: string | null;
  poNumber?: string | null;
  /** Lines adopted/imported onto the carton by the resolved link. */
  linesImported: number;
  /** Set when the relink paired this carton onto a busy matched shell. */
  pairedOnto?: number;
}

export interface ResolvedPurchaseOrder {
  poId: string;
  poNumber: string | null;
}

export interface LinkCartonIdentifierDeps {
  runTx: <T>(orgId: string, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  /** Mirror lookup — exact id / normalized number / normalized reference. */
  resolvePurchaseOrder: (
    client: TxClient,
    orgId: string,
    identifier: string,
  ) => Promise<ResolvedPurchaseOrder | null>;
  relink: typeof relinkReceivingPo;
  /** Second namespace: */
  importSalesOrder: typeof importSalesOrderByNumber;
  listLinks: (orgId: OrgId, receivingLineId: number) => Promise<PurchaseLinkRow[]>;
  upsertLink: typeof upsertPurchaseLink;
}

async function resolvePurchaseOrderFromMirror(
  client: TxClient,
  orgId: string,
  identifier: string,
): Promise<ResolvedPurchaseOrder | null> {
  const key = normalizeIdentifierKey(identifier);
  if (!key) return null;
  const { rows } = await client.query(
    `SELECT zoho_purchaseorder_id, zoho_purchaseorder_number
       FROM zoho_po_mirror
      WHERE organization_id = $1
        AND (
          zoho_purchaseorder_id = $2
          OR zoho_purchaseorder_number_norm = $3
          OR NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $3
        )
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT 1`,
    [orgId, identifier.trim(), key],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    poId: String(row.zoho_purchaseorder_id),
    poNumber: row.zoho_purchaseorder_number == null ? null : String(row.zoho_purchaseorder_number),
  };
}

const defaultDeps: LinkCartonIdentifierDeps = {
  runTx: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as TxClient)),
  resolvePurchaseOrder: resolvePurchaseOrderFromMirror,
  relink: relinkReceivingPo,
  importSalesOrder: importSalesOrderByNumber,
  listLinks: (orgId, receivingLineId) => listPurchaseLinksForLine(orgId, receivingLineId),
  upsertLink: upsertPurchaseLink,
};

/**
 * Link `identifier` to the carton. Resolves against the local PO mirror first
 * and imports that order's items; otherwise records the id as pending so a
 * later import can claim it. Never invents a Zoho identity for an unknown id.
 */
export async function linkCartonIdentifier(
  orgId: OrgId,
  input: LinkCartonIdentifierInput,
  deps: LinkCartonIdentifierDeps = defaultDeps,
): Promise<LinkCartonIdentifierResult> {
  const receivingId = Number(input.receivingId);
  const lineId = input.lineId != null && Number(input.lineId) > 0 ? Number(input.lineId) : null;
  const identifier = String(input.identifier ?? '').trim();

  const base = { receivingId, identifier, linesImported: 0 };

  if (!Number.isFinite(receivingId) || receivingId <= 0) {
    return { ...base, ok: false, status: 400, error: 'receiving_id must be a positive integer' };
  }
  if (!identifier) {
    return { ...base, ok: false, status: 400, error: 'identifier is required' };
  }

  const resolved = await deps.runTx(orgId, async (client) => {
    const carton = await client.query(
      `SELECT id FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [receivingId, orgId],
    );
    if (carton.rows.length === 0) return { missing: true as const };
    return { missing: false as const, po: await deps.resolvePurchaseOrder(client, orgId, identifier) };
  });

  if (resolved.missing) {
    return { ...base, ok: false, status: 404, error: `Carton ${receivingId} not found` };
  }

  // ── Resolved: the order exists locally. Relink imports its SKUs/items. ──────
  if (resolved.po) {
    const relinked: RelinkPoResult = await deps.relink(
      {
        receivingId,
        lineId,
        scope: lineId ? 'both' : 'carton',
        zohoPurchaseorderId: resolved.po.poId,
        zohoPurchaseorderNumber: resolved.po.poNumber,
      },
      orgId,
    );
    if (!relinked.ok) {
      return {
        ...base,
        ok: false,
        status: relinked.status,
        error: relinked.error ?? 'Relink failed',
        poId: resolved.po.poId,
        poNumber: resolved.po.poNumber,
      };
    }
    return {
      ok: true,
      status: 200,
      outcome: 'linked',
      receivingId: relinked.receivingId,
      identifier,
      poId: relinked.poId,
      poNumber: relinked.poNumber,
      linesImported: relinked.linesImported ?? 0,
      ...(relinked.pairedOnto != null ? { pairedOnto: relinked.pairedOnto } : {}),
    };
  }

  // ── Second namespace:
  if (lineId) {
    const sale = await deps.importSalesOrder(
      { orderNumber: identifier, receivingLineId: lineId, receivingId },
      orgId,
    );
    if (sale.imported) {
      return {
        ok: true,
        status: 200,
        outcome: 'linked',
        receivingId,
        identifier,
        poNumber: sale.matchedOrder?.order_id ?? identifier,
        linesImported: 1,
      };
    }
  }

  // ── Pending: keep the id, keep the truth (still unmatched).
  const inferredPlatform = inferMarketplaceFromOrderId(identifier);
  await deps.runTx(orgId, async (client) => {
    await client.query(
      `UPDATE receiving_carton
          SET source_order_id = $1,
              source_platform = COALESCE(source_platform, $4),
              last_pair_attempt_at = NOW(),
              updated_at = NOW()
        WHERE id = $2 AND organization_id = $3`,
      [identifier, receivingId, orgId, inferredPlatform],
    );
  });

  if (lineId) {
    const links = await deps.listLinks(orgId, lineId);
    await deps.upsertLink(orgId, {
      receivingLineId: lineId,
      sourceType: PENDING_IDENTIFIER_SOURCE,
      sourceOrderId: identifier,
      // First identity on the line becomes the badge; never demote an existing one.
      isPrimary: !links.some((link) => link.is_primary),
    });
  }

  return { ...base, ok: true, status: 200, outcome: 'pending' };
}
