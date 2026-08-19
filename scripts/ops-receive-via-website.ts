/**
 * Follow-up: stamp PR ids when Zoho is already received; Receive via
 * production mark-received-po when still issued; rewind DONE if Zoho stays
 * issued. Notes via website after() (Kai + scan/unbox). Never print secrets.
 */
import { config } from 'dotenv';
config({ path: '.env' });
config({ path: '.env.local' });

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
const NAMED = [
  '08-15004-25609',
  '64414585',
  '64415105',
  '01-14754-77677',
  '03-14751-11306',
  '20-14733-41106',
  '26-14713-28309',
  '8211985562918387',
  '08-15018-83400',
  '13-15021-78891',
  '18-15005-13532',
  '23-14979-54443',
  '24-15005-61467',
  '25-14998-20057',
  '64415128',
  '27-14971-03864',
];
const SKIP_MISSING_ZOHO_IDS = new Set([
  '5623409000002665205',
  '5623409000002662273',
  '5623409000002688968',
  '5623409000002665541',
]);
const MICHAEL_OR_STAFF_RE = /^(Michael(?:\s+Garisek)?|Staff\s*#\s*\d+)\b/i;
const STAMP_ONLY = new Set(['64414585', '64415105']);

type Target = {
  po_number: string;
  zoho_purchaseorder_id: string;
  receiving_id: number;
  line_ids: number[];
  scanned_at: Date | string | null;
  unboxed_at: Date | string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function kaiLine(t: Target): string {
  return buildZohoReceiveNoteLine({
    staffName: 'Kai',
    scannedAt: t.scanned_at,
    unboxedAt: t.unboxed_at,
  });
}

async function pushHeaderNotes(
  cookie: string,
  receivingId: number,
  notes: string,
): Promise<{ ok: boolean; status: number; error: string }> {
  const res = await fetch(`${BASE}/api/receiving/${receivingId}`, {
    method: 'PATCH',
    headers: headers(cookie),
    body: JSON.stringify({
      zoho_notes: notes,
      push_to_zoho: true,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    zoho?: { error?: string; skipped?: string };
  };
  const error = String(body.error || body.zoho?.error || body.zoho?.skipped || '');
  return { ok: res.ok && body.success !== false, status: res.status, error };
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
      deviceLabel: 'ops-website-receive',
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

async function loadTargets(): Promise<Target[]> {
  const res = await pool.query<Target>(
    `SELECT COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number) AS po_number,
            rz.zoho_purchaseorder_id,
            MIN(rl.receiving_id) AS receiving_id,
            array_agg(rl.id ORDER BY rl.id) AS line_ids,
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
        AND COALESCE(rz.zoho_purchaseorder_number, m.zoho_purchaseorder_number) = ANY($2::text[])
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    [DOGFOOD_ORG_ID, NAMED],
  );
  return res.rows;
}

async function receiveOnWebsite(
  cookie: string,
  t: Target,
): Promise<{ ok: boolean; status: number; error: string }> {
  const res = await fetch(`${BASE}/api/receiving/mark-received-po`, {
    method: 'POST',
    headers: headers(cookie),
    body: JSON.stringify({
      receiving_id: t.receiving_id,
      receive_intent: 'zoho_receive',
      station: 'RECEIVING',
      notes: kaiLine(t),
      client_event_id: `ops-website-${t.po_number}-${t.zoho_purchaseorder_id}-${Date.now()}`,
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

async function getReceiveId(cookie: string, poId: string): Promise<{ id: string | null; error: string }> {
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

async function stampAndPromote(t: Target, receiveId: string | null, zohoOk: boolean): Promise<string> {
  if (!zohoOk) {
    await withTenantTransaction(DOGFOOD_ORG_ID, async (client) => {
      for (const id of t.line_ids) {
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
          WHERE organization_id = $2 AND id = $3`,
        [receiveId, DOGFOOD_ORG_ID, t.receiving_id],
      );
    }
    const txDeps: FactsDeps = {
      query: ((_org, sql, p) => client.query(sql, p as unknown[])) as FactsDeps['query'],
    };
    const linkedAt = formatPSTTimestamp();
    for (const id of t.line_ids) {
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

async function websiteWorkflow(t: Target): Promise<{ workflow: string; hasPr: boolean }> {
  const res = await pool.query<{ workflow_status: string; has_pr: boolean }>(
    `SELECT rl.workflow_status::text AS workflow_status,
            (rz.zoho_purchase_receive_id IS NOT NULL) AS has_pr
       FROM receiving_line rl
       JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
      WHERE rl.id = ANY($1::int[])
      ORDER BY rl.id`,
    [t.line_ids],
  );
  const statuses = [...new Set(res.rows.map((r) => r.workflow_status))];
  return { workflow: statuses.join(',') || '—', hasPr: res.rows.some((r) => r.has_pr) };
}

type ResultRow = {
  po: string;
  zoho: string;
  workflow: string;
  pr: string;
  notes: string;
};

async function main() {
  const notesOnly = process.argv.includes('--notes-only');
  const onlyArgEarly = process.argv.find((a) => a.startsWith('--only='));
  if (!onlyArgEarly && !notesOnly) {
    console.log('waiting 180s for Zoho OAuth rate limit…');
    await sleep(180_000);
  }

  const healthCookie = await signIn();
  const health = await fetch(`${BASE}/api/zoho/health`, { headers: headers(healthCookie) });
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

  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length).trim() : '';
  const targets = (await loadTargets()).filter((t) => !only || t.po_number === only);
  console.log(
    `website ${notesOnly ? 'notes' : 'receive'} targets: ${targets.length}${only ? ` (only ${only})` : ''}\n`,
  );
  const cookie = healthCookie;
  const results: ResultRow[] = [];
  const postedCartons = new Set<number>();

  if (notesOnly) {
    const seenCartons = new Set<number>();
    for (const t of targets) {
      if (SKIP_MISSING_ZOHO_IDS.has(t.zoho_purchaseorder_id)) continue;
      if (seenCartons.has(t.receiving_id)) continue;
      seenCartons.add(t.receiving_id);
      const wantNotes = kaiLine(t);
      console.log(`── ${t.po_number} carton ${t.receiving_id}`);
      const zoho = await getZohoPo(cookie, t.zoho_purchaseorder_id);
      if (!zoho.ok) {
        console.warn(`  zoho read failed ${zoho.rawStatus}: ${zoho.error || '—'}`);
        results.push({
          po: t.po_number,
          zoho: zoho.status || '—',
          workflow: '—',
          pr: '—',
          notes: zoho.error || 'read failed',
        });
        await sleep(GAP_MS);
        continue;
      }
      const first = (zoho.notes.split('\n')[0] || '').trim();
      if (zoho.notes.includes(wantNotes)) {
        console.log(`  notes already have Kai scan/unbox`);
        results.push({
          po: t.po_number,
          zoho: zoho.status,
          workflow: '—',
          pr: '—',
          notes: first,
        });
        await sleep(GAP_MS);
        continue;
      }
      const nextNotes = zoho.notes.trim() ? `${wantNotes}\n${zoho.notes}` : wantNotes;
      const pushed = await pushHeaderNotes(cookie, t.receiving_id, nextNotes);
      console.log(`  PATCH notes ${pushed.status} ok=${pushed.ok} ${pushed.error}`);
      await sleep(2_000);
      const after = await getZohoPo(cookie, t.zoho_purchaseorder_id);
      const notesOut = (after.notes.split('\n')[0] || wantNotes).trim();
      results.push({
        po: t.po_number,
        zoho: after.status || zoho.status,
        workflow: '—',
        pr: '—',
        notes: notesOut,
      });
      await sleep(GAP_MS);
    }
    console.log('\nPO\tZoho\tnotes');
    for (const r of results) {
      console.log(`${r.po}\t${r.zoho}\t${r.notes}`);
    }
    return;
  }

  for (const t of targets) {
    const wantNotes = kaiLine(t);
    console.log(`── ${t.po_number} zoho ${t.zoho_purchaseorder_id} carton ${t.receiving_id}`);
    if (SKIP_MISSING_ZOHO_IDS.has(t.zoho_purchaseorder_id)) {
      const site = await websiteWorkflow(t);
      console.log(`  skip deleted Zoho PO id`);
      results.push({
        po: t.po_number,
        zoho: 'deleted',
        workflow: site.workflow,
        pr: site.hasPr ? 'yes' : 'no',
        notes: wantNotes,
      });
      continue;
    }
    let zoho = await zohoReadWithRetry(cookie, t.zoho_purchaseorder_id);
    console.log(`  live zoho=${zoho.status || '—'} pr=${zoho.receiveId ? 'yes' : 'no'} ok=${zoho.ok}`);

    const zohoTerminal = ['received', 'billed', 'closed'].includes(zoho.status);
    const firstNote = (zoho.notes.split('\n')[0] || '').trim();
    const notesNeedKai =
      MICHAEL_OR_STAFF_RE.test(firstNote) ||
      !zoho.notes.includes(wantNotes);
    const shouldPost =
      zoho.ok &&
      !postedCartons.has(t.receiving_id) &&
      ((!zohoTerminal && !STAMP_ONLY.has(t.po_number)) || (zohoTerminal && notesNeedKai));

    if (shouldPost) {
      const recv = await receiveOnWebsite(cookie, t);
      postedCartons.add(t.receiving_id);
      console.log(`  POST mark-received-po ${recv.status} ok=${recv.ok}`);
      await sleep(8_000);
      zoho = await zohoReadWithRetry(cookie, t.zoho_purchaseorder_id);
      console.log(`  after receive zoho=${zoho.status || '—'} pr=${zoho.receiveId ? 'yes' : 'no'}`);
    } else if (zohoTerminal || STAMP_ONLY.has(t.po_number)) {
      console.log(`  stamp-only (zoho ${zoho.status || '—'})`);
    }

    const zohoOk = ['received', 'billed', 'closed'].includes(zoho.status);
    try {
      if (zoho.ok) {
        await stampAndPromote(t, zoho.receiveId, zohoOk);
      } else {
        console.warn(`  skip stamp/rewind — no live Zoho status`);
      }
    } catch (err) {
      console.warn(`  stamp/promote failed:`, err instanceof Error ? err.message : err);
    }

    const site = await websiteWorkflow(t);
    const notesOut = (zoho.notes.split('\n')[0] || wantNotes).trim();
    console.log(
      `RESULT\t${t.po_number}\tzoho=${zoho.status || '—'}\tweb=${site.workflow}\tpr=${site.hasPr ? 'yes' : 'no'}\tnotes=${notesOut}`,
    );
    results.push({
      po: t.po_number,
      zoho: zoho.status || '—',
      workflow: site.workflow,
      pr: site.hasPr ? 'yes' : 'no',
      notes: notesOut,
    });
    await sleep(GAP_MS);
  }

  console.log('\nPO\tZoho\twebsite\tPR\tnotes');
  for (const r of results) {
    console.log(`${r.po}\t${r.zoho}\t${r.workflow}\t${r.pr}\t${r.notes}`);
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
