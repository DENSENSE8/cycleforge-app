#!/usr/bin/env node
/**
 * One-shot local NAS claim archive for Zendesk ticket folders.
 *
 * Uses local .env (GCS signed reads). Push path uses office NAS media agent
 * through the tunnel — does NOT go through Vercel.
 *
 * Agent mode (writes to Synology claims root via tunnel):
 *   NAS_AGENT_TOKEN=… npx tsx scripts/nas-archive-tickets.mjs 9600 9601 9602
 *
 * Stage mode (download to a local folder — no agent token needed):
 *   npx tsx scripts/nas-archive-tickets.mjs --stage=/tmp/nas-claims 9600 9601 9602
 *
 * Optional:
 *   NAS_AGENT_URL=https://nas-photos.michaelgarisek.com/_agent
 *   ORG_ID=00000000-0000-0000-0000-000000000001
 */
import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '.env.local'), override: true });

const ORG_ID = process.env.ORG_ID || '00000000-0000-0000-0000-000000000001';
const AGENT_URL = (process.env.NAS_AGENT_URL || 'https://nas-photos.michaelgarisek.com/_agent').replace(
  /\/+$/,
  '',
);
const AGENT_TOKEN = (process.env.NAS_AGENT_TOKEN || '').trim();

const args = process.argv.slice(2);
const stageArg = args.find((a) => a.startsWith('--stage'));
const STAGE_DIR = stageArg
  ? resolve(stageArg.includes('=') ? stageArg.slice('--stage='.length) : '/tmp/nas-claims')
  : null;
const tickets = args
  .filter((a) => !a.startsWith('--'))
  .map((t) => t.replace(/^#/, '').trim())
  .filter(Boolean);

if (tickets.length === 0) {
  console.error(
    'Usage:\n' +
      '  NAS_AGENT_TOKEN=… npx tsx scripts/nas-archive-tickets.mjs <ticket…>\n' +
      '  npx tsx scripts/nas-archive-tickets.mjs --stage[=DIR] <ticket…>',
  );
  process.exit(2);
}

if (!STAGE_DIR && !AGENT_TOKEN) {
  console.error(
    'NAS_AGENT_TOKEN is required for agent mode (or pass --stage to download locally first).',
  );
  process.exit(2);
}

const dbMod = await import('../src/lib/db.ts');
const pool = dbMod.default;
const { getStorageAdapter } = await import('../src/lib/photos/storage/registry.ts');
const { listAllReceivingPhotoIds } = await import('../src/lib/photos/queries/receiving-list.ts');
const { getPrimaryPhotoStorage } = await import('../src/lib/photos/storage/resolve-primary.ts');

async function resolveReceiving(ticketId) {
  const links = await pool.query(
    `SELECT entity_type, entity_id, is_primary
       FROM ticket_links
      WHERE organization_id = $1
        AND zendesk_ticket_id = $2
      ORDER BY is_primary DESC, id ASC`,
    [ORG_ID, Number(ticketId)],
  );
  for (const row of links.rows) {
    if (row.entity_type === 'RECEIVING') {
      return { receivingId: Number(row.entity_id), lineId: null, via: 'RECEIVING' };
    }
    if (row.entity_type === 'RECEIVING_LINE') {
      const parent = await pool.query(
        `SELECT receiving_id FROM receiving_line WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [Number(row.entity_id), ORG_ID],
      );
      const receivingId = Number(parent.rows[0]?.receiving_id);
      if (Number.isFinite(receivingId) && receivingId > 0) {
        return { receivingId, lineId: Number(row.entity_id), via: 'RECEIVING_LINE' };
      }
    }
  }
  return null;
}

async function resolvePhotoUrl(photoId) {
  const storage = await getPrimaryPhotoStorage(photoId, ORG_ID);
  if (!storage) return null;
  if (storage.provider === 'gcs' && storage.bucket) {
    try {
      return await getStorageAdapter('gcs').getSignedReadUrl({
        bucket: storage.bucket,
        objectKey: storage.objectKey,
        ttlSeconds: 60 * 30,
      });
    } catch (err) {
      console.warn(`  photo ${photoId}: GCS sign failed`, err instanceof Error ? err.message : err);
    }
  }
  const legacy = String(storage.legacyUrl || '').trim();
  return legacy || null;
}

function buildInfo(ticketId, linked, photoIds, resolvedCount) {
  return [
    `Archive target: ${ticketId}`,
    `Mode: Local one-shot NAS archive (scripts/nas-archive-tickets.mjs${STAGE_DIR ? ' --stage' : ''})`,
    `Receiving id: ${linked.receivingId}`,
    linked.lineId != null ? `Receiving line id: ${linked.lineId}` : null,
    `Link via: ${linked.via}`,
    `Captured: ${new Date().toISOString()}`,
    `Photos on claim record: ${photoIds.length}`,
    `Photos resolved for NAS archive: ${resolvedCount}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function stageTicket(ticketId, linked, photos, info) {
  const folder = join(STAGE_DIR, String(ticketId));
  await mkdir(folder, { recursive: true });
  let copied = 0;
  const used = new Set();
  for (const p of photos) {
    const res = await fetch(p.url);
    if (!res.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    let name = basename(new URL(p.url).pathname) || `photo_${copied + 1}.jpg`;
    // Strip signed-url junk
    name = name.split('?')[0] || name;
    if (!extname(name)) name += '.jpg';
    const key = name.toLowerCase();
    if (used.has(key)) {
      const dot = name.lastIndexOf('.');
      name = `${name.slice(0, dot)}_${copied}${name.slice(dot)}`;
    }
    used.add(name.toLowerCase());
    await writeFile(join(folder, name), buf);
    copied++;
  }
  await writeFile(join(folder, '_ticket-info.txt'), info, 'utf8');
  return { folder, copied, total: photos.length };
}

async function archiveViaAgent(ticketId, photos, info) {
  const res = await fetch(`${AGENT_URL}/archive`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-agent-token': AGENT_TOKEN,
      'x-nas-org-id': ORG_ID,
    },
    body: JSON.stringify({ ticketId, photos, info }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `agent HTTP ${res.status}`);
  }
  return {
    folder: data.folder,
    copied: data.copied ?? 0,
    total: data.total ?? photos.length,
  };
}

async function archiveTicket(ticketId) {
  const linked = await resolveReceiving(ticketId);
  if (!linked) {
    return { ticketId, ok: false, error: 'No RECEIVING / RECEIVING_LINE link in ticket_links' };
  }

  const photoIds = await listAllReceivingPhotoIds(ORG_ID, linked.receivingId);
  const photos = [];
  for (const photoId of photoIds) {
    const url = await resolvePhotoUrl(photoId);
    if (url) photos.push({ url });
  }

  const info = buildInfo(ticketId, linked, photoIds, photos.length);
  const archived = STAGE_DIR
    ? await stageTicket(ticketId, linked, photos, info)
    : await archiveViaAgent(ticketId, photos, info);

  return {
    ticketId,
    ok: true,
    receivingId: linked.receivingId,
    folder: archived.folder,
    copied: archived.copied,
    total: archived.total,
    resolved: photos.length,
    photoIds: photoIds.length,
  };
}

console.log(STAGE_DIR ? `Stage dir: ${STAGE_DIR}` : `Agent: ${AGENT_URL}`);
console.log(`Org:   ${ORG_ID}`);
console.log(`Tickets: ${tickets.join(', ')}`);

const results = [];
for (const ticketId of tickets) {
  console.log(`\n→ ${STAGE_DIR ? 'Staging' : 'Archiving'} #${ticketId}…`);
  try {
    const r = await archiveTicket(ticketId);
    results.push(r);
    console.log(r.ok ? `  ✓ ${r.copied}/${r.total} → ${r.folder}` : `  ✗ ${r.error}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ ticketId, ok: false, error: msg });
    console.log(`  ✗ ${msg}`);
  }
}

console.log('\n=== Summary ===');
console.log(JSON.stringify(results, null, 2));

const failed = results.filter((r) => !r.ok);
await pool.end().catch(() => {});
process.exit(failed.length ? 1 : 0);
