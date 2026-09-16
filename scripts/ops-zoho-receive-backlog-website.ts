/**
 * Backfill executor (website path): for dogfood POs that are received locally
 * (qty > 0, Zoho-linked) but never propagated (no zoho_purchase_receive_id AND
 * mirror status 'issued' or missing), drive the DEPLOYED app — the site runs
 * mark-received-po with the working production KMS key, performs the canonical
 * Zoho push (purchase receive + unit-note line descriptions + Kai header notes
 * + mirror), and this script verifies live Zoho state before/after, then stamps
 * zoho_purchase_receive_id, promotes lines DONE, and sets the mirror locally.
 *
 * Deleted-in-Zoho POs are reported and skipped (nothing to mark there).
 * Aborts on Zoho token rate-limit. Never prints secrets.
 *
 * Usage:
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/ops-zoho-receive-backlog-website.ts [--dry-run] [--only=<po>]
 *
 * --dry-run: load targets + live Zoho compare only (GETs via the site); no
 * mark-received-po POST, no local writes.
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
import { upsertReceivingLineZoho } from '@/lib/receiving/facts/narrow';
import type { FactsDeps } from '@/lib/receiving/facts/store';
import { formatPSTTimestamp } from '@/utils/date';
import { buildZohoReceiveNoteLine } from '@/lib/receiving/zoho-receive-note';

const BASE = 'https://app.cycleforge.ai';
const KAI_STAFF_ID = 7;
const GAP_MS = 8_000;
const POST_SETTLE_MS = 8_000;

type Line = {
  line_id: number;
  receiving_id: number;
  workflow_status: string;
};

type Target = {
  po_number: string;
  zoho_purchaseorder_id: string;
  mirror_status: string | null;
  receiving_ids: number[];
  lines: Line[];
  scanned_at: Date | string | null;
  unboxed_at: Date | string | null;
};

async function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function kaiLine(t: Target): string {
  return buildZohoReceiveNoteLine({
    staffName: 'Kai',
    scannedAt: t.scanned_at,
    unboxedAt: t.unboxed_at,
  });
}

async function signIn(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: BASE,
      'x-tenant-slug': 'usav',
    },
    body: JSON.stringify({
      staffId: KAI_STAFF_ID,
      deviceKind: 'station',
      deviceLabel: 'ops-zoho-receive-backlog',
    }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const cookie = setCookie
    .map((c) => c.split(';')[0])
    .filter((c) => c.startsWith('cf_sid='))
    .join('; ');
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !body.ok || !cookie) {
    throw new Error(`signin failed: ${res.status} ${body.error || ''} cookie=${Boolean(cookie)}`);
  }
  return cookie;
}

function headers(cookie: string): HeadersInit {
  return {
    cookie,
    origin: BASE,
    'x-tenant-slug': 'usav',
    'content-type': 'application/json',
  };
}

/**
 * Targets: locally-received, Zoho-linked lines with NO purchase receive id
 * whose mirror is 'issued' or absent — grouped per Zoho PO. mirror='received'
 * POs are already propagated in Zoho (missing stamp only) and excluded.
 */
async function loadBacklog(): Promise<Target[]> {
  const res = await pool.query<{
    po_number: string;
    zoho_purchaseorder_id: string;
    mirror_status: string | null;
    receiving_ids: number[];
    line_ids: number[];
    workflow_statuses: string[];
    scanned_at: Date | string | null;
    unboxed_at: Date | string | null;
  }>(
    `SELECT COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number) AS po_number,
            rz.zoho_purchaseorder_id,
            m.status AS mirror_status,
            array_agg(DISTINCT rl.receiving_id ORDER BY rl.receiving_id) AS receiving_ids,
            array_agg(rl.id ORDER BY rl.id) AS line_ids,
            array_agg(rl.workflow_status::text ORDER BY rl.id) AS workflow_statuses,
            MIN(rl.scanned_at) AS scanned_at,
            MIN(ru.unboxed_at) AS unboxed_at
       FROM receiving_line rl
       JOIN receiving_line_zoho rz
         ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
       LEFT JOIN zoho_po_mirror m
         ON m.zoho_purchaseorder_id = rz.zoho_purchaseorder_id
        AND m.organization_id = rl.organization_id
       LEFT JOIN receiving_unbox ru
         ON ru.receiving_id = rl.receiving_id AND ru.organization_id = rl.organization_id
      WHERE rl.organization_id = $1
        AND COALESCE(rl.quantity_received, 0) > 0
        AND rz.zoho_purchaseorder_id IS NOT NULL
        AND rz.zoho_purchase_receive_id IS NULL
        AND COALESCE(lower(m.status), 'issued') = 'issued'
      GROUP BY 1, 2, 3
      ORDER BY 1`,
    [DOGFOOD_ORG_ID],
  );
  return res.rows.map((r) => ({
    po_number: r.po_number,
    zoho_purchaseorder_id: r.zoho_purchaseorder_id,
    mirror_status: r.mirror_status,
    receiving_ids: r.receiving_ids ?? [],
    lines: (r.line_ids ?? []).map((id, i) => ({
      line_id: id,
      receiving_id: 0,
      workflow_status: r.workflow_statuses?.[i] ?? '?',
    })),
    scanned_at: r.scanned_at,
    unboxed_at: r.unboxed_at,
  }));
}

async function receiveOnWebsite(
  cookie: string,
  t: Target,
  receivingId: number,
): Promise<{ ok: boolean; status: number; error: string }> {
  const res = await fetch(`${BASE}/api/receiving/mark-received-po`, {
    method: 'POST',
    headers: headers(cookie),
    body: JSON.stringify({
      receiving_id: receivingId,
      receive_intent: 'zoho_receive',
      station: 'RECEIVING',
      client_event_id: `ops-backlog-${t.zoho_purchaseorder_id}-${receivingId}-${Date.now()}`,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    ok: res.ok && body.success !== false,
    status: res.status,
    error: String(body.error || body.message || ''),
  };
}

async function getZohoPo(
  cookie: string,
  poId: string,
): Promise<{ status: string; notes: string; ok: boolean; rawStatus: number; error: string }> {
  const res = await fetch(
    `${BASE}/api/zoho/purchase-orders?purchaseorder_id=${encodeURIComponent(poId)}`,
    { headers: headers(cookie) },
  );
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    message?: string;
    purchaseorder?: { status?: string; notes?: string };
  };
  const error = String(body.error || body.message || '');
  const ok = res.ok && body.success !== false && Boolean(body.purchaseorder);
  return {
    ok,
    rawStatus: res.status,
    error,
    status: String(body.purchaseorder?.status || '')
      .toLowerCase()
      .replace(/[\s-]+/g, '_'),
    notes: String(body.purchaseorder?.notes || ''),
  };
}

async function getReceiveId(
  cookie: string,
  poId: string,
): Promise<{ id: string | null; error: string }> {
  const res = await fetch(
    `${BASE}/api/zoho/purchase-receives?purchaseorder_id=${encodeURIComponent(poId)}&per_page=25`,
    { headers: headers(cookie) },
  );
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    message?: string;
    purchasereceives?: Array<Record<string, unknown>>;
    purchase_receives?: Array<Record<string, unknown>>;
  };
  const error = String(body.error || body.message || '');
  if (!res.ok || body.success === false) return { id: null, error: error || `http ${res.status}` };
  const rows = body.purchasereceives || body.purchase_receives || [];
  const last = rows[rows.length - 1];
  const raw = last?.purchase_receive_id ?? last?.purchasereceive_id ?? last?.receive_id ?? last?.id;
  const s = raw != null ? String(raw).trim() : '';
  return { id: s || null, error: '' };
}

function isTokenRateLimit(error: string): boolean {
  const err = error.toLowerCase();
  return err.includes('too many requests') || err.includes('token refresh failed');
}

async function zohoReadWithRetry(
  cookie: string,
  poId: string,
): Promise<{ status: string; notes: string; receiveId: string | null; ok: boolean; error: string }> {
  const zoho = await getZohoPo(cookie, poId);
  if (isTokenRateLimit(zoho.error)) {
    throw new Error(`abort: Zoho token rate-limited (${zoho.error})`);
  }
  if (!zoho.ok) {
    console.warn(`  zoho read failed ${zoho.rawStatus}: ${zoho.error || '—'}`);
    return { status: zoho.status, notes: zoho.notes, receiveId: null, ok: false, error: zoho.error };
  }
  await sleep(GAP_MS);
  const rec = await getReceiveId(cookie, poId);
  if (isTokenRateLimit(rec.error)) {
    throw new Error(`abort: Zoho token rate-limited (${rec.error})`);
  }
  if (rec.error) console.warn(`  purchase-receives: ${rec.error}`);
  return { status: zoho.status, notes: zoho.notes, receiveId: rec.id, ok: true, error: '' };
}

async function stampAndPromote(
  t: Target,
  receiveId: string | null,
  zohoOk: boolean,
): Promise<string> {
  const lineIds = t.lines.map((l) => l.line_id);
  const cartonIds = t.receiving_ids;
  if (!zohoOk) {
    await withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
      for (const id of lineIds) {
        await transitionReceivingLine(
          { receivingLineId: id, to: 'UNBOXED', actorStaffId: KAI_STAFF_ID, skipEvent: true },
          client,
          DOGFOOD_ORG_ID,
        );
      }
    });
    return 'UNBOXED';
  }

  await withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
    if (receiveId) {
      await client.query(
        `UPDATE receiving_carton
            SET zoho_purchase_receive_id = COALESCE(zoho_purchase_receive_id, $1),
                updated_at = NOW()
          WHERE organization_id = $2 AND id = ANY($3::int[])`,
        [receiveId, DOGFOOD_ORG_ID, cartonIds],
      );
    }
    const txDeps: FactsDeps = {
      query: ((_org, sql, p) => client.query(sql, p as unknown[])) as FactsDeps['query'],
    };
    const linkedAt = formatPSTTimestamp();
    for (const id of lineIds) {
      if (receiveId) {
        await upsertReceivingLineZoho(
          DOGFOOD_ORG_ID,
          id,
          { zohoPurchaseReceiveId: receiveId, zohoSyncedAt: linkedAt },
          txDeps,
        );
      }
      await transitionReceivingLine(
        { receivingLineId: id, to: 'DONE', actorStaffId: KAI_STAFF_ID, skipEvent: true },
        client,
        DOGFOOD_ORG_ID,
      );
    }
    await client.query(
      `UPDATE zoho_po_mirror
          SET status = 'received', last_synced_at = NOW()
        WHERE organization_id = $1 AND zoho_purchaseorder_id = $2`,
      [DOGFOOD_ORG_ID, t.zoho_purchaseorder_id],
    );
  });
  return 'DONE';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).trim() : '';
  console.log(
    `ops-zoho-receive-backlog-website — drive prod site receive + notes + stamps${dryRun ? ' (DRY RUN)' : ''}\n`,
  );

  const cookie = await signIn();
  const health = await fetch(`${BASE}/api/zoho/health`, { headers: headers(cookie) });
  const healthBody = (await health.json().catch(() => ({}))) as {
    connected?: boolean;
    token_ok?: boolean;
    live_error?: string | null;
  };
  console.log(
    `prod zoho connected=${healthBody.connected} token_ok=${healthBody.token_ok} err=${healthBody.live_error || 'none'}`,
  );
  if (!healthBody.token_ok) {
    throw new Error('production Zoho token not ok — abort (do not hammer)');
  }

  const targets = (await loadBacklog()).filter((t) => !only || t.po_number === only);
  console.log(`targets: ${targets.length} PO(s)${only ? ` (only ${only})` : ''}\n`);
  const results: Array<{ po: string; zoho: string; action: string; pr: string; notes: string }> = [];

  for (const t of targets) {
    const wantNotes = kaiLine(t);
    console.log(
      `── ${t.po_number} zoho ${t.zoho_purchaseorder_id} carton(s) ${t.receiving_ids.join(',')} lines=${t.lines.length}`,
    );

    let zoho = await zohoReadWithRetry(cookie, t.zoho_purchaseorder_id);
    const looksDeleted = !zoho.ok && /not.*(found|exist)|no.*purchase.*order/i.test(zoho.error);
    if (looksDeleted) {
      console.log(`  deleted in Zoho — nothing to mark (local lines left as-is)`);
      results.push({ po: t.po_number, zoho: 'deleted', action: 'skip', pr: '—', notes: wantNotes });
      await sleep(GAP_MS);
      continue;
    }
    console.log(`  live zoho=${zoho.status || '—'} pr=${zoho.receiveId ? 'yes' : 'no'} ok=${zoho.ok}`);
    const zohoTerminal = ['received', 'billed', 'closed'].includes(zoho.status);
    const notesHaveKai = zoho.notes.includes(wantNotes);

    if (dryRun) {
      const action = !zoho.ok
        ? 'unreadable'
        : zohoTerminal
          ? notesHaveKai
            ? 'stamp-only'
            : 'stamp+notes'
          : 'receive+notes';
      console.log(`  PLAN: ${action} (notes ${notesHaveKai ? 'present' : 'missing Kai line'})`);
      results.push({ po: t.po_number, zoho: zoho.status || '—', action, pr: zoho.receiveId ? 'yes' : 'no', notes: notesHaveKai ? 'ok' : 'missing' });
      await sleep(GAP_MS);
      continue;
    }

    // Post when Zoho still owes a receive, OR when the PO is terminal but its
    // notes lack the Kai scan/unbox line — mark-received-po's after() patches
    // header notes + unit-note descriptions even on already-received POs (the
    // exact legs the 5k quota killed).
    if (zoho.ok && (!zohoTerminal || !notesHaveKai)) {
      for (const receivingId of t.receiving_ids) {
        const recv = await receiveOnWebsite(cookie, t, receivingId);
        console.log(`  POST mark-received-po carton ${receivingId} → ${recv.status} ok=${recv.ok} ${recv.error}`);
        if (!recv.ok) {
          console.warn(`  receive failed — moving on without local promotion`);
        }
        await sleep(POST_SETTLE_MS);
      }
      zoho = await zohoReadWithRetry(cookie, t.zoho_purchaseorder_id);
      console.log(`  after receive zoho=${zoho.status || '—'} pr=${zoho.receiveId ? 'yes' : 'no'}`);
    }

    const zohoOk = ['received', 'billed', 'closed'].includes(zoho.status);
    try {
      if (zoho.ok) {
        const promoted = await stampAndPromote(t, zoho.receiveId, zohoOk);
        console.log(`  local: ${promoted}${zoho.receiveId ? ` pr=${zoho.receiveId}` : ''}`);
      } else {
        console.warn(`  skip stamp/rewind — no live Zoho status`);
      }
    } catch (err) {
      console.warn(`  stamp/promote failed:`, err instanceof Error ? err.message : err);
    }

    const notesOut = (zoho.notes.split('\n')[0] || wantNotes).trim();
    results.push({
      po: t.po_number,
      zoho: zoho.status || '—',
      action: zohoTerminal && notesHaveKai ? 'stamp-only' : 'receive+notes',
      pr: zoho.receiveId ? 'yes' : 'no',
      notes: notesOut,
    });
    await sleep(GAP_MS);
  }

  console.log('\nPO\tZoho\taction\tPR\tnotes');
  for (const r of results) {
    console.log(`${r.po}\t${r.zoho}\t${r.action}\t${r.pr}\t${r.notes}`);
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
