/**
 * Absorb an empty Incoming “PO shell” onto the operator’s working carton —
 * the missing dedupe path behind `ux_receiving_zoho_po_matched`.
 *
 * One `source='zoho_po'` carton is allowed per Zoho PO. Cron / Incoming often
 * pre-creates that row as an empty shell. When the operator then links a
 * scanned unmatched carton to the same PO, a blind UPDATE throws. This helper:
 *   • `free`     — no other matched carton holds the PO; caller may promote.
 *   • `already`  — working carton already is the matched holder.
 *   • `absorb`   — empty shell demoted; PO + lines/scans moved onto working.
 *   • `conflict` — another matched carton has real work; do not steal (409).
 *
 * Runs on an existing tenant tx client (relink / reconcile). Deps-injected for
 * emptiness checks so unit tests stay DB-free.
 */
import type { TxClient } from './relink-po';

interface ClaimZohoPoShellInput {
  orgId: string;
  workingReceivingId: number;
  zohoPurchaseorderId: string;
  zohoPurchaseorderNumber?: string | null;
}

type ClaimZohoPoShellResult =
  | { action: 'free' }
  | { action: 'already' }
  | { action: 'absorb'; shellReceivingId: number }
  | {
      action: 'conflict';
      shellReceivingId: number;
      status: 409;
      error: string;
    };

export interface ClaimZohoPoShellDeps {
  /** True when the shell has door/unbox progress and must not be stolen. */
  isShellBusy: (client: TxClient, shellReceivingId: number, orgId: string) => Promise<boolean>;
}

async function isShellBusyImpl(
  client: TxClient,
  shellReceivingId: number,
  orgId: string,
): Promise<boolean> {
  const door = await client.query(
    `SELECT 1 FROM receiving_triage
      WHERE receiving_id = $1 AND organization_id = $2
        AND door_received_at IS NOT NULL
      LIMIT 1`,
    [shellReceivingId, orgId],
  );
  if ((door.rowCount ?? 0) > 0) return true;

  const qty = await client.query(
    `SELECT 1 FROM receiving_line
      WHERE receiving_id = $1 AND organization_id = $2
        AND COALESCE(quantity_received, 0) > 0
      LIMIT 1`,
    [shellReceivingId, orgId],
  );
  if ((qty.rowCount ?? 0) > 0) return true;

  const unbox = await client.query(
    `SELECT 1 FROM receiving_unbox
      WHERE receiving_id = $1 AND organization_id = $2
        AND (unboxed_at IS NOT NULL OR opened_at IS NOT NULL)
      LIMIT 1`,
    [shellReceivingId, orgId],
  );
  return (unbox.rowCount ?? 0) > 0;
}

const defaultDeps: ClaimZohoPoShellDeps = {
  isShellBusy: isShellBusyImpl,
};

/**
 * Resolve / absorb a PO-shell collision for `workingReceivingId` + PO id.
 * Caller must already be inside a tenant transaction.
 */
export async function claimOrAbsorbZohoPoShell(
  input: ClaimZohoPoShellInput,
  client: TxClient,
  deps: ClaimZohoPoShellDeps = defaultDeps,
): Promise<ClaimZohoPoShellResult> {
  const {
    orgId,
    workingReceivingId,
    zohoPurchaseorderId,
  } = input;
  const poNumber = input.zohoPurchaseorderNumber?.trim() || null;
  const poId = zohoPurchaseorderId.trim();
  if (!poId || !Number.isFinite(workingReceivingId) || workingReceivingId <= 0) {
    return { action: 'free' };
  }

  const held = await client.query(
    `SELECT id FROM receiving_carton
      WHERE organization_id = $1
        AND source = 'zoho_po'
        AND zoho_purchaseorder_id = $2
      LIMIT 1`,
    [orgId, poId],
  );
  const shellId = held.rows[0]?.id != null ? Number(held.rows[0].id) : null;
  if (shellId == null || !Number.isFinite(shellId)) {
    return { action: 'free' };
  }
  if (shellId === workingReceivingId) {
    return { action: 'already' };
  }

  const busy = await deps.isShellBusy(client, shellId, orgId);
  if (busy) {
    return {
      action: 'conflict',
      shellReceivingId: shellId,
      status: 409,
      error: `PO already linked to carton #${shellId} — open that carton or unpair it first`,
    };
  }

  // ── Absorb empty shell onto working carton ───────────────────────────────
  // 1) Free the unique index on the shell (demote header only — keep line Zoho facts).
  await client.query(
    `UPDATE receiving_carton
        SET zoho_purchaseorder_id = NULL,
            zoho_purchaseorder_number = NULL,
            source = 'unmatched',
            updated_at = NOW()
      WHERE id = $1 AND organization_id = $2`,
    [shellId, orgId],
  );

  // 2) Stamp working carton as the matched holder.
  await client.query(
    `UPDATE receiving_carton
        SET zoho_purchaseorder_id = $1,
            zoho_purchaseorder_number = COALESCE($2, zoho_purchaseorder_number),
            source = 'zoho_po',
            updated_at = NOW()
      WHERE id = $3 AND organization_id = $4`,
    [poId, poNumber, workingReceivingId, orgId],
  );

  // 3) Adopt shell-attached + unattached PO lines onto working.
  await client.query(
    `UPDATE receiving_line rl
        SET receiving_id = $1
       FROM receiving_line_zoho rz
      WHERE rz.receiving_line_id = rl.id
        AND rz.organization_id = $3
        AND rz.zoho_purchaseorder_id = $2
        AND rl.organization_id = $3
        AND (rl.receiving_id IS NULL OR rl.receiving_id = $4)`,
    [workingReceivingId, poId, orgId, shellId],
  );

  // 4) Re-parent scans from shell → working.
  await client.query(
    `UPDATE receiving_scans
        SET receiving_id = $1, source = 'zoho_po'
      WHERE receiving_id = $2 AND organization_id = $3`,
    [workingReceivingId, shellId, orgId],
  );

  // 5) If working has no shipment yet, take the shell's primary shipment_id.
  await client.query(
    `UPDATE receiving_carton w
        SET shipment_id = s.shipment_id,
            updated_at = NOW()
       FROM receiving_carton s
      WHERE w.id = $1 AND w.organization_id = $3
        AND s.id = $2 AND s.organization_id = $3
        AND w.shipment_id IS NULL
        AND s.shipment_id IS NOT NULL`,
    [workingReceivingId, shellId, orgId],
  );

  // Move RECEIVING shipment_links from shell → working (idempotent on conflict skip via delete+repoint).
  await client.query(
    `UPDATE shipment_links
        SET owner_id = $1
      WHERE organization_id = $3
        AND owner_type = 'RECEIVING'
        AND owner_id = $2
        AND NOT EXISTS (
          SELECT 1 FROM shipment_links x
           WHERE x.organization_id = $3
             AND x.owner_type = 'RECEIVING'
             AND x.owner_id = $1
             AND x.shipment_id = shipment_links.shipment_id
        )`,
    [workingReceivingId, shellId, orgId],
  );
  await client.query(
    `DELETE FROM shipment_links
      WHERE organization_id = $2
        AND owner_type = 'RECEIVING'
        AND owner_id = $1`,
    [shellId, orgId],
  );

  // 6) Keep demoted shell out of Unfound.
  await client.query(
    `INSERT INTO unfound_overlay
       (organization_id, source_kind, source_id, checked, checked_at)
     VALUES ($1, 'unmatched_receiving', $2, TRUE, NOW())
     ON CONFLICT (organization_id, source_kind, source_id) DO UPDATE
       SET checked = TRUE,
           checked_at = COALESCE(unfound_overlay.checked_at, NOW())`,
    [orgId, String(shellId)],
  );

  return { action: 'absorb', shellReceivingId: shellId };
}
