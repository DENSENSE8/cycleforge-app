/**
 * Operator-driven PO relink — the website is authoritative over Zoho.
 *
 * "Someone linked the wrong PO/SKU in Zoho, but I know the correct PO" → this
 * writes the chosen PO (and an optional SKU correction) onto the line AND the
 * carton header, even when Zoho already had a different (wrong) link. It
 * DELIBERATELY overrides the upgrade-only guard that the general
 * `PATCH /api/receiving/[id]` enforces (that guard exists so a passive sync
 * can't downgrade a carton; an explicit operator relink is the sanctioned
 * exception).
 *
 * SoT note (items vs sku_catalog collision): a SKU correction rewrites `sku` +
 * `zoho_item_id` only. We do NOT derive `sku_catalog_id` from the SKU string
 * here — the read-side title-guarded join owns that (the two SKU namespaces
 * collide; see source-of-truth rules). Inject `Deps` so unit tests run DB-free.
 */
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recomputeCartonSourceLink } from './carton-source-link';
import { claimOrAbsorbZohoPoShell } from './claim-zoho-po-shell';

export type RelinkScope = 'line' | 'carton' | 'both';

export interface RelinkPoInput {
  receivingId: number;
  /** Required for scope 'line' | 'both' — the line whose PO/SKU is rewritten. */
  lineId?: number | null;
  scope: RelinkScope;
  zohoPurchaseorderId: string;
  zohoPurchaseorderNumber?: string | null;
  /** Optional SKU correction (the "wrong SKU on the right PO" fix). */
  sku?: string | null;
  zohoItemId?: string | null;
}

export interface RelinkPoResult {
  ok: boolean;
  status: number;
  error?: string;
  receivingId: number;
  linesUpdated: number;
  poId: string;
  poNumber: string | null;
}

/** Minimal query surface — lets the unit test pass a fake client (DB-free). */
export interface TxClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

export interface RelinkDeps {
  recompute: (receivingId: number, db: TxClient) => Promise<void>;
  /** Transaction runner — defaults to withTenantTransaction; faked in tests. */
  runTx: <T>(orgId: string, fn: (client: TxClient) => Promise<T>) => Promise<T>;
}
const defaultDeps: RelinkDeps = {
  recompute: (receivingId, db) => recomputeCartonSourceLink(receivingId, db),
  runTx: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as TxClient)),
};

export async function relinkReceivingPo(
  input: RelinkPoInput,
  orgId: string,
  deps: RelinkDeps = defaultDeps,
): Promise<RelinkPoResult> {
  const { receivingId, lineId, scope, zohoPurchaseorderId } = input;
  const poNumber = input.zohoPurchaseorderNumber?.trim() || null;
  const sku = input.sku?.trim() || null;
  const zohoItemId = input.zohoItemId?.trim() || null;

  return deps.runTx(orgId, async (client) => {
    const carton = await client.query(
      `SELECT id FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [receivingId, orgId],
    );
    if (carton.rowCount === 0) {
      return {
        ok: false, status: 404, error: 'carton not found',
        receivingId, linesUpdated: 0, poId: zohoPurchaseorderId, poNumber,
      };
    }

    // ── LINE rewrite (W3 writer inversion) ──────────────────────────────────
    // The line's zoho identity lives on receiving_line_zoho (the spine zoho
    // columns are dead); only the SKU correction still touches the spine.
    // Inline upserts (not facts/narrow.ts) because relink must also maintain the
    // derived zoho_purchaseorder_number_norm (GENERATED on the old spine column)
    // and needs overwrite-when-provided semantics on zoho_item_id.
    let linesUpdated = 0;
    if (scope === 'carton') {
      // Re-point every line of the carton at the chosen PO.
      const res = await client.query(
        `INSERT INTO receiving_line_zoho (
           receiving_line_id, organization_id,
           zoho_purchaseorder_id, zoho_purchaseorder_number, zoho_purchaseorder_number_norm)
         SELECT rl.id, rl.organization_id, $1, $2,
                NULLIF(upper(regexp_replace($2, '[^A-Za-z0-9]', '', 'g')), '')
           FROM receiving_line rl
          WHERE rl.receiving_id = $3 AND rl.organization_id = $4
         ON CONFLICT (receiving_line_id) DO UPDATE SET
           zoho_purchaseorder_id          = EXCLUDED.zoho_purchaseorder_id,
           zoho_purchaseorder_number      = EXCLUDED.zoho_purchaseorder_number,
           zoho_purchaseorder_number_norm = EXCLUDED.zoho_purchaseorder_number_norm,
           updated_at                     = now()`,
        [zohoPurchaseorderId, poNumber, receivingId, orgId],
      );
      linesUpdated = res.rowCount ?? 0;
    } else if (lineId != null && lineId > 0) {
      // Validate the line belongs to this carton + org (the old UPDATE's WHERE),
      // then re-point it, plus the optional SKU correction (spine-staying).
      const lineProbe = await client.query(
        `SELECT id FROM receiving_line
          WHERE id = $1 AND receiving_id = $2 AND organization_id = $3`,
        [lineId, receivingId, orgId],
      );
      if ((lineProbe.rowCount ?? 0) > 0) {
        if (sku != null) {
          // updated_at is trigger-maintained on receiving_line (never set by hand).
          await client.query(
            `UPDATE receiving_line SET sku = $1
              WHERE id = $2 AND organization_id = $3`,
            [sku, lineId, orgId],
          );
        }
        await client.query(
          `INSERT INTO receiving_line_zoho (
             receiving_line_id, organization_id,
             zoho_purchaseorder_id, zoho_purchaseorder_number, zoho_purchaseorder_number_norm,
             zoho_item_id)
           VALUES ($1, $2, $3, $4,
                   NULLIF(upper(regexp_replace($4, '[^A-Za-z0-9]', '', 'g')), ''),
                   $5)
           ON CONFLICT (receiving_line_id) DO UPDATE SET
             zoho_purchaseorder_id          = EXCLUDED.zoho_purchaseorder_id,
             zoho_purchaseorder_number      = EXCLUDED.zoho_purchaseorder_number,
             zoho_purchaseorder_number_norm = EXCLUDED.zoho_purchaseorder_number_norm,
             zoho_item_id                   = COALESCE(EXCLUDED.zoho_item_id, receiving_line_zoho.zoho_item_id),
             updated_at                     = now()`,
          [lineId, orgId, zohoPurchaseorderId, poNumber, zohoItemId],
        );
        linesUpdated = 1;
      }
    }

    // ── CARTON header rewrite (explicit override of upgrade-only) ────────────
    // Absorb an empty Incoming PO shell when the unique index would otherwise
    // throw; return 409 when another matched carton has real work.
    if (scope === 'carton' || scope === 'both') {
      const claim = await claimOrAbsorbZohoPoShell(
        {
          orgId,
          workingReceivingId: receivingId,
          zohoPurchaseorderId,
          zohoPurchaseorderNumber: poNumber,
        },
        client,
      );
      if (claim.action === 'conflict') {
        return {
          ok: false,
          status: claim.status,
          error: claim.error,
          receivingId,
          linesUpdated,
          poId: zohoPurchaseorderId,
          poNumber,
        };
      }
      if (claim.action === 'free') {
        try {
          await client.query(
            `UPDATE receiving_carton
                SET zoho_purchaseorder_id = $1,
                    zoho_purchaseorder_number = $2,
                    source = 'zoho_po',
                    updated_at = NOW()
              WHERE id = $3 AND organization_id = $4`,
            [zohoPurchaseorderId, poNumber, receivingId, orgId],
          );
        } catch (err) {
          // Last-resort: unique index race → never bubble as withAuth INTERNAL.
          const pgCode = (err as { code?: string } | null)?.code;
          if (pgCode === '23505') {
            return {
              ok: false,
              status: 409,
              error: 'PO already linked to another carton',
              receivingId,
              linesUpdated,
              poId: zohoPurchaseorderId,
              poNumber,
            };
          }
          throw err;
        }
      }
      // absorb | already — header already correct (absorb stamped it; already was us).
    }

    // Re-derive the carton's representative source link. No-op for a real-Zoho
    // carton (guarded inside), so it can't undo what we just wrote.
    await deps.recompute(receivingId, client);

    return {
      ok: true, status: 200,
      receivingId, linesUpdated, poId: zohoPurchaseorderId, poNumber,
    };
  });
}
