/**
 * One-shot data repair: consolidate the deleted-and-recreated Zoho PO lines.
 *
 * Each of 4 cartons carries TWO receiving_lines for one physical unit — one on
 * the dead PO id, one on the recreated id. The serial_unit_provenance owner
 * decides the keeper; the serial-less twin is retired (qty→0, →MATCHED, rz
 * link removed) so the unit is counted once against the LIVE PO.
 *
 *   keepers (repoint rz to the recreated PO + its line_item_id):
 *     3660 → 5623409000002688105 / …2688108   (twin 3705 retired)
 *     3651 → 5623409000002683120 / …2683123   (twin 3706 retired)
 *     3715 → 5623409000002701177 / …2701180   (twin 3763 retired)
 *     3673 already on the live id              (twin 3666 retired)
 *   orphans (PO deleted, no recreation — retire, keep as local-only lines):
 *     3489, 3509, 3499
 *
 * No receiving_line rows are deleted — history (testing rows, inventory
 * events) stays attached. Retired lines keep their rows with qty 0.
 *
 * Usage:
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/ops-relink-recreated-zoho-pos.ts [--dry-run]
 */
import { config } from 'dotenv';

function kmsKeyLooksValid(): boolean {
  const raw = process.env.INTEGRATION_KMS_KEY ?? '';
  if (!raw) return false;
  try {
    return Buffer.from(raw, 'base64').length === 32;
  } catch {
    return false;
  }
}

if (!kmsKeyLooksValid()) {
  config({ path: '.env' });
  config({ path: '.env.local' });
}

import pool from '@/lib/db';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { withTenantTransaction } from '@/lib/tenancy/db';

const KAI_STAFF_ID = 7;

/** keeper line → (recreated PO id, recreated line_item_id) */
const REPOINT: Record<number, { poId: string; lineItemId: string }> = {
  3660: { poId: '5623409000002688105', lineItemId: '5623409000002688108' },
  3651: { poId: '5623409000002683120', lineItemId: '5623409000002683123' },
  3715: { poId: '5623409000002701177', lineItemId: '5623409000002701180' },
};

/** serial-less twins + no-counterpart orphans: qty→0, →MATCHED, rz removed */
const RETIRE = [3705, 3706, 3763, 3666, 3489, 3509, 3499];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`ops-relink-recreated-zoho-pos${dryRun ? ' (DRY RUN)' : ''}\n`);

  const state = await pool.query<{
    id: number;
    quantity_received: number;
    workflow_status: string;
    po_id: string | null;
    li_id: string | null;
  }>(
    `SELECT rl.id, rl.quantity_received, rl.workflow_status::text AS workflow_status,
            rz.zoho_purchaseorder_id AS po_id, rz.zoho_line_item_id AS li_id
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
      WHERE rl.organization_id = $1
        AND rl.id = ANY($2::int[])
      ORDER BY rl.id`,
    [DOGFOOD_ORG_ID, [...Object.keys(REPOINT).map(Number), ...RETIRE]],
  );
  for (const r of state.rows) {
    const action = REPOINT[r.id]
      ? `REPOINT → ${REPOINT[r.id]!.poId}/${REPOINT[r.id]!.lineItemId}`
      : 'RETIRE (qty→0, →MATCHED, unlink)';
    console.log(
      `line ${r.id}: qty=${r.quantity_received} status=${r.workflow_status} po=${r.po_id ?? '—'} → ${action}`,
    );
  }

  if (dryRun) return;

  await withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    // 1. Retire twins first — frees the (org, po_id, line_item_id) keys the
    //    keepers are about to take.
    for (const id of RETIRE) {
      await client.query(
        `UPDATE receiving_line SET quantity_received = 0, received_done_at = NULL
          WHERE organization_id = $1 AND id = $2`,
        [DOGFOOD_ORG_ID, id],
      );
      await client.query(
        `DELETE FROM receiving_line_zoho WHERE organization_id = $1 AND receiving_line_id = $2`,
        [DOGFOOD_ORG_ID, id],
      );
      const tr = await transitionReceivingLine(
        { receivingLineId: id, to: 'MATCHED', actorStaffId: KAI_STAFF_ID, skipEvent: true },
        client,
        DOGFOOD_ORG_ID,
      );
      console.log(`retire line ${id}: transition ${tr.ok ? 'ok' : `${tr.status} ${tr.error}`}`);
    }

    // 2. Repoint keepers onto the recreated PO ids.
    for (const [lineId, target] of Object.entries(REPOINT)) {
      const res = await client.query(
        `UPDATE receiving_line_zoho
            SET zoho_purchaseorder_id = $3,
                zoho_line_item_id = $4,
                zoho_purchaseorder_number = (SELECT zoho_purchaseorder_number FROM zoho_po_mirror WHERE organization_id = $1 AND zoho_purchaseorder_id = $3),
                zoho_purchase_receive_id = NULL,
                zoho_synced_at = NOW()
          WHERE organization_id = $1 AND receiving_line_id = $2
          RETURNING receiving_line_id`,
        [DOGFOOD_ORG_ID, Number(lineId), target.poId, target.lineItemId],
      );
      console.log(
        `repoint line ${lineId} → ${target.poId}/${target.lineItemId}: ${res.rowCount ?? 0} rz row(s)`,
      );
    }
  });

  const after = await pool.query(
    `SELECT rl.id, rl.quantity_received, rl.workflow_status::text AS workflow_status,
            rz.zoho_purchaseorder_id AS po_id
       FROM receiving_line rl
       LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
      WHERE rl.organization_id = $1 AND rl.id = ANY($2::int[])
      ORDER BY rl.id`,
    [DOGFOOD_ORG_ID, [...Object.keys(REPOINT).map(Number), ...RETIRE]],
  );
  console.log('\nafter:');
  for (const r of after.rows) {
    console.log(
      `line ${r.id}: qty=${r.quantity_received} status=${r.workflow_status} po=${r.po_id ?? '—'}`,
    );
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
