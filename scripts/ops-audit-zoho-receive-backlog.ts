/**
 * Read-only audit: POs that are received locally (qty_received > 0, Zoho-linked)
 * but not propagated to Zoho (no purchase_receive_id and/or mirror still issued).
 * Groups per PO, counts lines, serials, and local statuses. Writes nothing.
 *
 * Usage:
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/ops-audit-zoho-receive-backlog.ts
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
  if (process.env.OPS_ENV_FILE) {
    config({ path: process.env.OPS_ENV_FILE, override: true });
  }
}

import pool from '@/lib/db';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';

type PoRow = {
  zoho_purchaseorder_id: string;
  zoho_purchaseorder_number: string | null;
  mirror_status: string | null;
  lines: number;
  pending_lines: number;
  done_lines: number;
  qty: number;
  serials: number;
  oldest: Date | null;
  newest: Date | null;
};

async function main() {
  const res = await pool.query<PoRow>(
    `SELECT rz.zoho_purchaseorder_id,
            COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number) AS zoho_purchaseorder_number,
            m.status AS mirror_status,
            COUNT(*)::int AS lines,
            COUNT(*) FILTER (WHERE rz.zoho_purchase_receive_id IS NULL)::int AS pending_lines,
            COUNT(*) FILTER (WHERE rl.workflow_status::text = 'DONE')::int AS done_lines,
            SUM(COALESCE(rl.quantity_received, 0))::int AS qty,
            COUNT(su.id)::int AS serials,
            MIN(COALESCE(ru.unboxed_at, rl.received_at, rl.scanned_at)) AS oldest,
            MAX(COALESCE(ru.unboxed_at, rl.received_at, rl.scanned_at)) AS newest
       FROM receiving_line rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
       LEFT JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
        AND m.organization_id = rl.organization_id
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = rl.receiving_id
        AND ru.organization_id = rl.organization_id
       LEFT JOIN serial_unit_provenance sp
         ON sp.origin_type = 'RECEIVING_LINE' AND sp.origin_id = rl.id
        AND sp.organization_id = rl.organization_id
       LEFT JOIN serial_units su ON su.id = sp.serial_unit_id
      WHERE rl.organization_id = $1
        AND COALESCE(rl.quantity_received, 0) > 0
        AND rz.zoho_purchaseorder_id IS NOT NULL
        AND rz.zoho_purchase_receive_id IS NULL
      GROUP BY rz.zoho_purchaseorder_id, COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number), m.status
      ORDER BY MAX(COALESCE(ru.unboxed_at, rl.received_at, rl.scanned_at)) NULLS LAST`,
    [DOGFOOD_ORG_ID],
  );

  console.log(`POs with unpropagated received lines: ${res.rows.length}\n`);
  for (const r of res.rows) {
    console.log(
      `${r.zoho_purchaseorder_number ?? '—'}\tzoho=${r.zoho_purchaseorder_id}\tmirror=${r.mirror_status ?? '—'}\t` +
        `lines=${r.lines} pending=${r.pending_lines} done=${r.done_lines} qty=${r.qty} serials=${r.serials}\t` +
        `${r.oldest ? new Date(r.oldest).toISOString().slice(0, 16) : '—'} → ${r.newest ? new Date(r.newest).toISOString().slice(0, 16) : '—'}`,
    );
  }

  // Stale-mirror check: local DONE but mirror says issued (receive may already
  // exist in Zoho; the mirror just was never refreshed).
  const stale = await pool.query<{ n: number }>(
    `SELECT COUNT(DISTINCT rz.zoho_purchaseorder_id)::int AS n
       FROM receiving_line rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
       JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
        AND m.organization_id = rl.organization_id
      WHERE rl.organization_id = $1
        AND rl.workflow_status::text = 'DONE'
        AND lower(m.status) = 'issued'`,
    [DOGFOOD_ORG_ID],
  );
  console.log(`\nDONE-but-mirror-issued POs (distinct): ${stale.rows[0]?.n ?? 0}`);

  const totalLines = res.rows.reduce((a, r) => a + r.pending_lines, 0);
  const totalSerials = res.rows.reduce((a, r) => a + r.serials, 0);
  console.log(`totals: pending_lines=${totalLines} serials=${totalSerials}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
