/**
 * Unmatched-receiving reconciliation.
 *
 * Background: when a tracking number scans into receiving with no Zoho PO
 * match, /api/receiving/lookup-po creates a `receiving` row with
 * source='unmatched' and a `tracking_exceptions` row. Later — sometimes
 * minutes, sometimes days — the matching Zoho PO arrives (via cron sync or
 * a vendor uploading the PO). At that point the unmatched receiving COULD
 * be promoted to a Zoho-linked one, but nothing was wired to do that.
 *
 * This helper re-runs the same Zoho tracking search that lookup-po does,
 * and if it now finds a PO, promotes the receiving in place (or absorbs an
 * empty Incoming PO shell onto this carton when the unique index would
 * collide):
 *   • receiving_carton.source           → 'zoho_po'
 *   • receiving_carton.zoho_purchaseorder_id → matched PO id
 *   • receiving_line             → imported from the Zoho PO
 *   • tracking_exceptions        → resolved
 *   • unfound_overlay            → checked (operator can ignore the row)
 *
 * Trigger points:
 *   • Hourly cron sweep (src/app/api/cron/reconcile-unmatched/route.ts)
 *   • Manually from the unfound queue UI ("Retry Zoho lookup")
 *   • After mailbox triage marks a PO uploaded
 *
 * Failures are non-fatal — anything that goes wrong leaves the receiving
 * as 'unmatched' (except busy-shell attach, which redirects to the shell)
 * and the helper returns { promoted: false, reason }. The caller decides
 * whether to retry.
 */

import pool from '@/lib/db';
import {
  searchPurchaseReceivesByTracking,
  searchPurchaseOrdersByTracking,
} from '@/lib/zoho';
import { ZohoRateLimitError } from '@/lib/zoho/httpClient';
import { importZohoPurchaseOrderToReceiving } from '@/lib/zoho-receiving-sync';
import { resolveReceivingExceptionsByReceivingId } from '@/lib/tracking-exceptions';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { claimOrAbsorbZohoPoShell } from '@/lib/receiving/claim-zoho-po-shell';
import { attachBoxToReceiving } from '@/lib/receiving/attach-box';
import type { TxClient } from '@/lib/receiving/relink-po';
import {
  canonicalizeTrackingKey,
  pickMirrorPoIdFromCandidates,
} from '@/lib/zoho/call-reduction';
import type { OrgId } from '@/lib/tenancy/constants';

export interface ReconcileResult {
  receivingId: number;
  promoted: boolean;
  /** Set when promoted; the Zoho PO id that won the match. */
  zohoPurchaseorderId?: string;
  /** Number of receiving_line created by the Zoho import. */
  linesImported?: number;
  /** Number of tracking_exceptions rows closed. */
  exceptionsResolved?: number;
  /** Short reason explaining why promotion was skipped or failed. */
  reason?: string;
  /** Stable machine code for UI branching (e.g. ZOHO_RATE_LIMITED). */
  code?: string;
  /** Human-readable error for toasts when reason alone is not enough. */
  error?: string;
}

interface ReceivingSnapshot {
  id: number;
  source: string | null;
  receiving_tracking_number: string | null;
  organization_id: string | null;
}

function last8Digits(tracking: string | null | undefined): string | null {
  const digits = String(tracking || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits.slice(-8);
}

function isRateLimit(err: unknown): boolean {
  return err instanceof ZohoRateLimitError || (err as { name?: string })?.name === 'ZohoRateLimitError';
}

/**
 * Match an unmatched carton's tracking against `zoho_po_mirror` before any
 * live Zoho search. Exact Reference# first; unique last-8 suffix as fallback
 * (same digit window the live search uses).
 */
async function findMirrorPoIdForTracking(
  orgId: OrgId,
  trackingRaw: string | null | undefined,
  last8: string,
): Promise<string | null> {
  const canon = canonicalizeTrackingKey(trackingRaw);
  if (!canon && !last8) return null;

  const { rows } = await tenantQuery<{
    zoho_purchaseorder_id: string;
    ref_canon: string | null;
  }>(
    orgId,
    `SELECT zoho_purchaseorder_id,
            NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '')
              AS ref_canon
       FROM zoho_po_mirror
      WHERE COALESCE(reference_number, '') <> ''
        AND (
          NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $1
          OR right(
               NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), ''),
               8
             ) = $2
        )
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT 25`,
    [canon || null, last8],
  );

  const exactPoIds: string[] = [];
  const suffixPoIds: string[] = [];
  for (const row of rows) {
    const id = String(row.zoho_purchaseorder_id || '').trim();
    if (!id) continue;
    const ref = String(row.ref_canon || '');
    if (canon && ref === canon) exactPoIds.push(id);
    else if (ref.length >= 8 && ref.slice(-8) === last8) suffixPoIds.push(id);
  }
  return pickMirrorPoIdFromCandidates({ exactPoIds, suffixPoIds });
}

export async function reconcileUnmatchedReceiving(
  receivingId: number,
): Promise<ReconcileResult> {
  // ─── Load the receiving row ─────────────────────────────────────────────
  const recRes = await pool.query<ReceivingSnapshot>(
    `SELECT r.id, r.source,
            stn.tracking_number_raw AS receiving_tracking_number,
            r.organization_id
       FROM receiving_carton r
       LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
      WHERE r.id = $1
      LIMIT 1`,
    [receivingId],
  );
  const rec = recRes.rows[0];
  if (!rec) {
    return { receivingId, promoted: false, reason: 'receiving not found' };
  }
  if (rec.source !== 'unmatched') {
    return {
      receivingId,
      promoted: false,
      reason: `already ${rec.source}`,
    };
  }

  const last8 = last8Digits(rec.receiving_tracking_number);
  if (!last8) {
    return {
      receivingId,
      promoted: false,
      reason: 'tracking number has fewer than 8 digits',
    };
  }

  // ─── Local mirror first (0 Zoho calls) ──────────────────────────────────
  const zohoPoIds = new Set<string>();
  const orgId = rec.organization_id;
  if (orgId) {
    try {
      const mirrorPoId = await findMirrorPoIdForTracking(
        orgId as OrgId,
        rec.receiving_tracking_number,
        last8,
      );
      if (mirrorPoId) zohoPoIds.add(mirrorPoId);
    } catch {
      // Soft failure — fall through to live Zoho search.
    }
  }

  // ─── Re-query Zoho only when mirror missed ──────────────────────────────
  // Same fallback chain as lookup-po: purchase_receives first, then
  // purchase_orders. Soft misses stay empty; hard rate-limits surface so the
  // Auto-match button can toast (not pretend "no match").
  if (zohoPoIds.size === 0) {
    try {
      let receives: Awaited<ReturnType<typeof searchPurchaseReceivesByTracking>> = [];
      try {
        receives = await searchPurchaseReceivesByTracking(last8);
      } catch (err) {
        if (isRateLimit(err)) {
          const message = err instanceof Error ? err.message : 'Zoho rate limit reached';
          return {
            receivingId,
            promoted: false,
            reason: 'zoho_rate_limited',
            code: 'ZOHO_RATE_LIMITED',
            error: message,
          };
        }
        // Soft failure on receives — fall through to PO search.
      }
      for (const r of receives) {
        const poId = String(r.purchaseorder_id || '');
        if (poId) zohoPoIds.add(poId);
      }
      if (zohoPoIds.size === 0) {
        try {
          const pos = await searchPurchaseOrdersByTracking(last8);
          for (const po of pos) {
            if (po.purchaseorder_id) zohoPoIds.add(po.purchaseorder_id);
          }
        } catch (err) {
          if (isRateLimit(err)) {
            const message = err instanceof Error ? err.message : 'Zoho rate limit reached';
            return {
              receivingId,
              promoted: false,
              reason: 'zoho_rate_limited',
              code: 'ZOHO_RATE_LIMITED',
              error: message,
            };
          }
          // Soft failure — treat as no match.
        }
      }
    } catch (err) {
      if (isRateLimit(err)) {
        const message = err instanceof Error ? err.message : 'Zoho rate limit reached';
        return {
          receivingId,
          promoted: false,
          reason: 'zoho_rate_limited',
          code: 'ZOHO_RATE_LIMITED',
          error: message,
        };
      }
      return {
        receivingId,
        promoted: false,
        reason: `zoho lookup threw: ${err instanceof Error ? err.message : 'unknown'}`,
        error: err instanceof Error ? err.message : 'Zoho lookup failed',
      };
    }
  }

  if (zohoPoIds.size === 0) {
    return { receivingId, promoted: false, reason: 'no zoho match yet' };
  }

  const poIds = Array.from(zohoPoIds);
  const primaryPoId = poIds[0]!;

  // ─── Promote in place (or absorb empty PO shell) ────────────────────────
  let winningReceivingId = receivingId;
  let promoted = false;

  try {
    const promoteRes = await pool.query<{ id: number }>(
      `UPDATE receiving_carton
          SET source = 'zoho_po',
              zoho_purchaseorder_id = $1,
              updated_at = NOW()
        WHERE id = $2
          AND (source = 'unmatched' OR zoho_purchaseorder_id IS NULL)
        RETURNING id`,
      [primaryPoId, receivingId],
    );
    promoted = (promoteRes.rowCount ?? 0) > 0;
  } catch (err) {
    const pgCode = (err as { code?: string } | null)?.code;
    if (pgCode !== '23505' || !orgId) {
      return {
        receivingId,
        promoted: false,
        reason: `promote update failed: ${err instanceof Error ? err.message : 'unknown'}`,
        error: err instanceof Error ? err.message : 'Promote failed',
      };
    }
    // Unique conflict — absorb empty shell or attach onto busy shell.
    const claim = await withTenantTransaction(orgId, async (client) =>
      claimOrAbsorbZohoPoShell(
        {
          orgId,
          workingReceivingId: receivingId,
          zohoPurchaseorderId: primaryPoId,
        },
        client as unknown as TxClient,
      ),
    );

    if (claim.action === 'absorb' || claim.action === 'already') {
      promoted = true;
      winningReceivingId = receivingId;
    } else if (claim.action === 'conflict') {
      // Busy shell owns the PO — attach this box's tracking and re-parent scans.
      const tracking = (rec.receiving_tracking_number || '').trim();
      if (tracking && orgId) {
        await attachBoxToReceiving({
          receivingId: claim.shellReceivingId,
          trackingNumber: tracking,
          staffId: null,
          organizationId: orgId,
        }).catch((attachErr) => {
          console.warn(
            `[reconcile-unmatched] attach-box to shell failed receiving=${receivingId} shell=${claim.shellReceivingId}:`,
            attachErr instanceof Error ? attachErr.message : attachErr,
          );
        });
      }
      await pool.query(
        `UPDATE receiving_scans
            SET receiving_id = $1, source = 'zoho_po'
          WHERE receiving_id = $2
            AND ($3::uuid IS NULL OR organization_id = $3::uuid)`,
        [claim.shellReceivingId, receivingId, orgId],
      ).catch(() => undefined);
      try {
        await pool.query(
          `INSERT INTO unfound_overlay
             (organization_id, source_kind, source_id, checked, checked_at)
           VALUES ($1, 'unmatched_receiving', $2, TRUE, NOW())
           ON CONFLICT (organization_id, source_kind, source_id) DO UPDATE
             SET checked = TRUE,
                 checked_at = COALESCE(unfound_overlay.checked_at, NOW())`,
          [orgId, String(receivingId)],
        );
      } catch { /* best-effort */ }

      winningReceivingId = claim.shellReceivingId;
      promoted = true;
    } else {
      // free after race — unlikely; leave unmatched
      return {
        receivingId,
        promoted: false,
        reason: 'promote update failed: unique conflict unresolved',
      };
    }
  }

  if (!promoted) {
    // Soft miss on UPDATE (race) — try absorb in case a shell already holds the PO
    // without throwing (e.g. concurrent promote already claimed it between SELECT).
    if (orgId) {
      const claim = await withTenantTransaction(orgId, async (client) =>
        claimOrAbsorbZohoPoShell(
          {
            orgId,
            workingReceivingId: receivingId,
            zohoPurchaseorderId: primaryPoId,
          },
          client as unknown as TxClient,
        ),
      );
      if (claim.action === 'absorb' || claim.action === 'already') {
        promoted = true;
        winningReceivingId = receivingId;
      } else if (claim.action === 'conflict') {
        winningReceivingId = claim.shellReceivingId;
        promoted = true;
        const tracking = (rec.receiving_tracking_number || '').trim();
        if (tracking) {
          await attachBoxToReceiving({
            receivingId: claim.shellReceivingId,
            trackingNumber: tracking,
            staffId: null,
            organizationId: orgId,
          }).catch(() => undefined);
        }
      }
    }
    if (!promoted) {
      return {
        receivingId,
        promoted: false,
        reason: 'row no longer unmatched (race)',
      };
    }
  }

  // ─── Import Zoho lines onto the winning carton ──────────────────────────
  let linesImported = 0;
  if (!orgId) {
    console.warn(
      `[reconcile-unmatched] receiving=${receivingId} has no organization_id; skipping Zoho line import`,
    );
  } else {
    try {
      const importResult = await importZohoPurchaseOrderToReceiving(
        orgId,
        primaryPoId,
        { receivingId: winningReceivingId },
      );
      if (importResult && typeof importResult === 'object') {
        const maybeLines = (importResult as { linesImported?: number; lines?: unknown[] })
          .linesImported;
        const maybeArr = (importResult as { lines?: unknown[] }).lines;
        linesImported = typeof maybeLines === 'number'
          ? maybeLines
          : Array.isArray(maybeArr)
            ? maybeArr.length
            : 0;
      }
    } catch (err) {
      console.warn(
        `[reconcile-unmatched] line import failed for receiving=${winningReceivingId} po=${primaryPoId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const exceptionsResolved = await resolveReceivingExceptionsByReceivingId(
    winningReceivingId,
  ).catch(() => 0);

  try {
    await pool.query(
      `INSERT INTO unfound_overlay
         (organization_id, source_kind, source_id, checked, checked_at)
       VALUES ($1, 'unmatched_receiving', $2, TRUE, NOW())
       ON CONFLICT (organization_id, source_kind, source_id) DO UPDATE
         SET checked = TRUE,
             checked_at = COALESCE(unfound_overlay.checked_at, NOW())`,
      [orgId, String(winningReceivingId)],
    );
  } catch (err) {
    console.warn(
      `[reconcile-unmatched] overlay check failed for receiving=${winningReceivingId}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return {
    receivingId: winningReceivingId,
    promoted: true,
    zohoPurchaseorderId: primaryPoId,
    linesImported,
    exceptionsResolved,
  };
}

/**
 * Sweep recent unmatched receivings, retrying Zoho lookup for each.
 */
export async function sweepUnmatchedReceivings(
  options: {
    maxAgeDays?: number;
    limit?: number;
  } = {},
): Promise<{
  scanned: number;
  promoted: number;
  results: ReconcileResult[];
}> {
  const maxAgeDays = Math.max(1, Math.min(30, options.maxAgeDays ?? 7));
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));

  const candidates = await pool.query<{ id: number }>(
    `SELECT id
       FROM receiving_carton
      WHERE source = 'unmatched'
        AND shipment_id IS NOT NULL
        AND receiving_date_time > NOW() - ($1 || ' days')::interval
      ORDER BY receiving_date_time DESC
      LIMIT $2`,
    [String(maxAgeDays), limit],
  );

  const results: ReconcileResult[] = [];
  let promoted = 0;
  for (const row of candidates.rows) {
    const r = await reconcileUnmatchedReceiving(Number(row.id));
    results.push(r);
    if (r.promoted) promoted++;
  }

  return { scanned: candidates.rows.length, promoted, results };
}
