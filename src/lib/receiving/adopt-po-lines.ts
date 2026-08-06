/**
 * Adopt / claim Zoho PO receiving lines onto a carton.
 *
 * Scan and Package Pairing open a `zoho_po` carton by PO id, then need the
 * local `receiving_line` rows on that carton. Incoming sync often already
 * created them — sometimes unattached (`receiving_id IS NULL`), sometimes
 * stuck on an unmatched tracking carton (door scan missed the PO). This
 * helper:
 *   1. Adopts unattached lines for the PO.
 *   2. Claims lines whose Zoho PO id matches and whose current carton is
 *      `source = 'unmatched'` (never steals from another `zoho_po` carton).
 *   3. Optionally live-imports from Zoho when the carton still has zero lines
 *      for that PO (Package Pairing / empty local adopt).
 *
 * Lookup-po keeps its local-only hot-path guard by never importing
 * `zoho-receiving-sync` in the route file — this module owns the optional
 * import branch. Default deps are lazy-loaded so unit tests stay DB-free.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import type { TxClient } from '@/lib/receiving/relink-po';
import type { transitionReceivingLine } from '@/lib/receiving/state-machine';

export interface AdoptPoLinesResult {
  /** Lines moved onto the carton in this call (unattached + unmatched donors). */
  adopted: number;
  /** True when a live Zoho import ran because local adopt left the carton empty. */
  imported: boolean;
  /** Lines present on the carton for this PO after adopt (+ optional import). */
  lineCount: number;
}

export interface AdoptPoLinesDeps {
  runTx: <T>(orgId: string, fn: (client: TxClient) => Promise<T>) => Promise<T>;
  transition: typeof transitionReceivingLine;
  /**
   * Live Zoho PO → receiving_line import. Injected so unit tests stay DB-free
   * and lookup-po never mentions the Zoho sync module by name.
   */
  importPo?: (
    orgId: OrgId,
    poId: string,
    options: { receivingId: number },
  ) => Promise<{ line_items_synced?: number } | void>;
  /** Count lines for this PO already on the carton (post-adopt / post-import). */
  countLinesOnCarton?: (
    orgId: string,
    poId: string,
    receivingId: number,
  ) => Promise<number>;
}

async function defaultRunTx<T>(
  orgId: string,
  fn: (client: TxClient) => Promise<T>,
): Promise<T> {
  const { withTenantTransaction } = await import('@/lib/tenancy/db');
  return withTenantTransaction(orgId, (client) => fn(client as unknown as TxClient));
}

async function defaultTransition(
  ...args: Parameters<typeof transitionReceivingLine>
): ReturnType<typeof transitionReceivingLine> {
  const { transitionReceivingLine: transition } = await import('@/lib/receiving/state-machine');
  return transition(...args);
}

const defaultDeps: AdoptPoLinesDeps = {
  runTx: defaultRunTx,
  transition: defaultTransition,
};

async function countPoLinesOnCarton(
  client: TxClient,
  orgId: string,
  poId: string,
  receivingId: number,
): Promise<number> {
  const res = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM receiving_line rl
       JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
      WHERE rl.organization_id = $1
        AND rl.receiving_id = $2
        AND rz.zoho_purchaseorder_id = $3`,
    [orgId, receivingId, poId],
  );
  return Number(res.rows[0]?.n ?? 0);
}

/**
 * Local adopt + unmatched-donor claim. No Zoho round-trip.
 * Returns how many lines were moved onto `receivingId`.
 */
export async function adoptPoLinesOntoReceiving(
  poId: string,
  receivingId: number,
  orgId: string,
  deps: AdoptPoLinesDeps = defaultDeps,
): Promise<number> {
  const normalizedPoId = String(poId || '').trim();
  if (!normalizedPoId || !Number.isFinite(receivingId) || receivingId <= 0) return 0;

  return deps.runTx(orgId, async (client) => {
    // Unattached OR on an unmatched carton (not already on the winner).
    // Never pulls from another source='zoho_po' carton.
    const lines = await client.query(
      `SELECT rl.id, rl.workflow_status::text AS workflow_status
         FROM receiving_line rl
         JOIN receiving_line_zoho rz
           ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         LEFT JOIN receiving_carton rc
           ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
        WHERE rz.zoho_purchaseorder_id = $1
          AND rl.organization_id = $2
          AND rl.receiving_id IS DISTINCT FROM $3
          AND (
            rl.receiving_id IS NULL
            OR rc.source = 'unmatched'
          )
        ORDER BY rl.id
        FOR UPDATE OF rl`,
      [normalizedPoId, orgId, receivingId],
    );
    if (lines.rows.length === 0) return 0;

    const ids = lines.rows.map((r) => Number(r.id));
    await client.query(
      `UPDATE receiving_line
          SET receiving_id = $1
        WHERE id = ANY($2::int[])
          AND organization_id = $3`,
      [receivingId, ids, orgId],
    );

    for (const row of lines.rows) {
      if (String(row.workflow_status ?? '') !== 'EXPECTED') continue;
      await deps.transition(
        { receivingLineId: Number(row.id), to: 'MATCHED', skipEvent: true },
        client as never,
        orgId as OrgId,
      );
    }
    return ids.length;
  });
}

/**
 * Adopt/claim local lines, then optionally live-import when the carton still
 * has zero lines for this PO.
 */
export async function ensurePoLinesOnReceiving(
  poId: string,
  receivingId: number,
  orgId: string,
  options: { importIfEmpty?: boolean } = {},
  deps: AdoptPoLinesDeps = defaultDeps,
): Promise<AdoptPoLinesResult> {
  const normalizedPoId = String(poId || '').trim();
  const adopted = await adoptPoLinesOntoReceiving(normalizedPoId, receivingId, orgId, deps);

  let lineCount = deps.countLinesOnCarton
    ? await deps.countLinesOnCarton(orgId, normalizedPoId, receivingId)
    : await deps.runTx(orgId, (client) =>
        countPoLinesOnCarton(client, orgId, normalizedPoId, receivingId),
      );

  let imported = false;
  if (options.importIfEmpty && lineCount === 0) {
    const importPo =
      deps.importPo ??
      (async (o, p, opts) => {
        const { importZohoPurchaseOrderToReceiving } = await import('@/lib/zoho-receiving-sync');
        return importZohoPurchaseOrderToReceiving(o, p, opts);
      });
    try {
      await importPo(orgId as OrgId, normalizedPoId, { receivingId });
      imported = true;
      lineCount = deps.countLinesOnCarton
        ? await deps.countLinesOnCarton(orgId, normalizedPoId, receivingId)
        : await deps.runTx(orgId, (client) =>
            countPoLinesOnCarton(client, orgId, normalizedPoId, receivingId),
          );
    } catch (err) {
      console.warn(
        `[adopt-po-lines] import failed po=${normalizedPoId} receiving=${receivingId}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { adopted, imported, lineCount };
}
