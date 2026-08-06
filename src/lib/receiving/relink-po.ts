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
 * Busy-shell conflict: when another matched carton already has real work on
 * this PO, mirror `reconcileUnmatchedReceiving` — attach the working carton's
 * tracking onto that shell, re-parent scans, dismiss the orphan, and return
 * the shell as `receivingId` / `pairedOnto` (UI opens the winner). Hard 409
 * only when there is no tracking to attach.
 *
 * SoT note (items vs sku_catalog collision): a SKU correction rewrites `sku` +
 * `zoho_item_id` only. We do NOT derive `sku_catalog_id` from the SKU string
 * here — the read-side title-guarded join owns that (the two SKU namespaces
 * collide; see source-of-truth rules). Inject `Deps` so unit tests run DB-free.
 */
import { withTenantTransaction } from '@/lib/tenancy/db';
import { recomputeCartonSourceLink } from './carton-source-link';
import { claimOrAbsorbZohoPoShell } from './claim-zoho-po-shell';
import { reparentReceivingCartonPhotos } from './reparent-carton-photos';
import {
  ensurePoLinesOnReceiving,
  type AdoptPoLinesResult,
} from './adopt-po-lines';
import type { AttachBoxResult } from './attach-box';

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
  /**
   * When set, the working carton was an unmatched orphan paired onto a busy
   * matched shell — UI should open this carton (same as `receivingId`).
   */
  pairedOnto?: number;
  /** Photos moved from the orphan unmatched carton onto the winning shell. */
  photosMoved?: number;
  /** Lines adopted/claimed/imported onto the winning carton after link. */
  linesImported?: number;
}

/** Minimal query surface — lets the unit test pass a fake client (DB-free). */
export interface TxClient {
  query: (
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

type ClaimFn = typeof claimOrAbsorbZohoPoShell;

export interface RelinkDeps {
  recompute: (receivingId: number, db: TxClient) => Promise<void>;
  /** Transaction runner — defaults to withTenantTransaction; faked in tests. */
  runTx: <T>(orgId: string, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  claimShell?: ClaimFn;
  attachBox?: (params: {
    receivingId: number;
    trackingNumber: string;
    staffId: number | null;
    organizationId: string;
  }) => Promise<AttachBoxResult>;
  /** After a successful carton/both link — adopt/claim/import PO lines. */
  ensurePoLines?: (
    poId: string,
    receivingId: number,
    orgId: string,
    options?: { importIfEmpty?: boolean },
  ) => Promise<AdoptPoLinesResult>;
}

const defaultDeps: RelinkDeps = {
  recompute: (receivingId, db) => recomputeCartonSourceLink(receivingId, db),
  runTx: (orgId, fn) => withTenantTransaction(orgId, (client) => fn(client as unknown as TxClient)),
  claimShell: claimOrAbsorbZohoPoShell,
  // Lazy — attach-box pulls `server-only` / db; keep relink unit tests DB-free.
};

type TxRelinkResult = RelinkPoResult & {
  /** Internal — tracking to attach after the tenant tx commits. */
  attachTracking?: string;
  /** Internal — orphan carton id for post-tx photo realtime publish. */
  orphanReceivingId?: number;
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
  const claimShell = deps.claimShell ?? claimOrAbsorbZohoPoShell;
  const attachBox =
    deps.attachBox ??
    (await import('./attach-box')).attachBoxToReceiving;

  const txResult: TxRelinkResult = await deps.runTx(orgId, async (client) => {
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
    // throw; on busy shell, attach working tracking onto the shell (reconcile).
    if (scope === 'carton' || scope === 'both') {
      const claim = await claimShell(
        {
          orgId,
          workingReceivingId: receivingId,
          zohoPurchaseorderId,
          zohoPurchaseorderNumber: poNumber,
        },
        client,
      );
      if (claim.action === 'conflict') {
        const trackRes = await client.query(
          `SELECT COALESCE(
             NULLIF(stn.tracking_number_raw, ''),
             (
               SELECT rs.tracking_number
                 FROM receiving_scans rs
                WHERE rs.receiving_id = rc.id
                  AND rs.organization_id = $2
                ORDER BY rs.scanned_at DESC NULLS LAST
                LIMIT 1
             )
           ) AS tracking
             FROM receiving_carton rc
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
            WHERE rc.id = $1 AND rc.organization_id = $2
            LIMIT 1`,
          [receivingId, orgId],
        );
        const tracking = String(trackRes.rows[0]?.tracking ?? '').trim();
        if (!tracking) {
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

        // Re-parent scans + photos; dismiss orphan from Unfound + Unbox rail.
        await client.query(
          `UPDATE receiving_scans
              SET receiving_id = $1, source = 'zoho_po'
            WHERE receiving_id = $2 AND organization_id = $3`,
          [claim.shellReceivingId, receivingId, orgId],
        );
        const photos = await reparentReceivingCartonPhotos(
          {
            orgId,
            fromReceivingId: receivingId,
            toReceivingId: claim.shellReceivingId,
            poRef: poNumber,
          },
          client,
        );
        // Drop Unbox-open membership so the lineless orphan leaves Recent rail
        // (overlay.checked alone only hides triage Unfound).
        await client.query(
          `UPDATE receiving_unbox
              SET opened_at = NULL,
                  unboxed_at = NULL
            WHERE receiving_id = $1 AND organization_id = $2`,
          [receivingId, orgId],
        );
        await client.query(
          `INSERT INTO unfound_overlay
             (organization_id, source_kind, source_id, checked, checked_at)
           VALUES ($1, 'unmatched_receiving', $2, TRUE, NOW())
           ON CONFLICT (organization_id, source_kind, source_id) DO UPDATE
             SET checked = TRUE,
                 checked_at = COALESCE(unfound_overlay.checked_at, NOW())`,
          [orgId, String(receivingId)],
        );

        return {
          ok: true,
          status: 200,
          receivingId: claim.shellReceivingId,
          pairedOnto: claim.shellReceivingId,
          linesUpdated,
          poId: zohoPurchaseorderId,
          poNumber,
          photosMoved: photos.moved,
          attachTracking: tracking,
          orphanReceivingId: receivingId,
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

  if (txResult.ok && txResult.attachTracking && txResult.pairedOnto != null) {
    const tracking = txResult.attachTracking;
    const shellId = txResult.pairedOnto;
    const orphanId = txResult.orphanReceivingId ?? receivingId;
    await attachBox({
      receivingId: shellId,
      trackingNumber: tracking,
      staffId: null,
      organizationId: orgId,
    }).catch((attachErr) => {
      console.warn(
        `[relink-po] attach-box to shell failed working=${receivingId} shell=${shellId}:`,
        attachErr instanceof Error ? attachErr.message : attachErr,
      );
    });
    // Recompute on the winning shell (orphan was not promoted).
    await deps
      .runTx(orgId, async (client) => {
        await deps.recompute(shellId, client);
      })
      .catch(() => undefined);

    // Claim / import PO lines onto the winning shell (unmatched donors + Zoho).
    const linesEnsured = await ensurePoLinesOnWinningCarton(
      zohoPurchaseorderId,
      shellId,
      orgId,
      deps,
    );

    // Realtime: both galleries so the rail/photo panes refresh combined shots.
    if ((txResult.photosMoved ?? 0) > 0) {
      try {
        const { publishReceivingPhotoChanged } = await import('@/lib/realtime/publish');
        await publishReceivingPhotoChanged({
          organizationId: orgId,
          receivingId: orphanId,
          action: 'delete',
          source: 'receiving.relink.pair',
        });
        await publishReceivingPhotoChanged({
          organizationId: orgId,
          receivingId: shellId,
          action: 'insert',
          source: 'receiving.relink.pair',
        });
      } catch (err) {
        console.warn('[relink-po] photo realtime publish failed', err);
      }
    }

    const { attachTracking: _a, orphanReceivingId: _o, ...publicResult } = txResult;
    return { ...publicResult, linesImported: linesEnsured };
  }

  // Same-carton promote / free claim — bring lines onto the working carton.
  let linesImported = 0;
  if (txResult.ok && (scope === 'carton' || scope === 'both')) {
    linesImported = await ensurePoLinesOnWinningCarton(
      zohoPurchaseorderId,
      txResult.receivingId,
      orgId,
      deps,
    );
  }

  const { attachTracking: _a, orphanReceivingId: _o, ...publicResult } = txResult;
  return { ...publicResult, linesImported };
}

async function ensurePoLinesOnWinningCarton(
  poId: string,
  receivingId: number,
  orgId: string,
  deps: RelinkDeps,
): Promise<number> {
  try {
    const ensure = deps.ensurePoLines ?? ensurePoLinesOnReceiving;
    const result = await ensure(poId, receivingId, orgId, { importIfEmpty: true });
    return result.lineCount;
  } catch (err) {
    console.warn(
      `[relink-po] ensurePoLines failed po=${poId} receiving=${receivingId}:`,
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}
