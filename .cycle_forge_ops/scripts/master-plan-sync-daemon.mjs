/**
 * Master-plan sync daemon (ALP-2.1..2.3) — the local file bridge.
 *
 *   upstream:   Cursor save → fs.watch → Y.Text → Ably (org:{uuid}:forge:master-plan)
 *   downstream: Ably → Y.Text → atomic file write (temp + rename)
 *
 * Echo suppression is two-layer (src/lib/master-plan/README.md): the Ably side
 * drops our own publishes by provider clientTag; the file side drops our own
 * writes by generation token (exact-content match in FileSyncEngine).
 *
 * RUN (PM2, preferred):   pm2 start ecosystem.config.cjs --only master-plan-sync
 * RUN (one-off):          npx tsx .cycle_forge_ops/scripts/master-plan-sync-daemon.mjs
 *
 * Must run via `tsx` — it imports the shared TS core from src/lib/master-plan/
 * (createMasterPlanYDoc / MasterPlanAblyProvider / FileSyncEngine), so the
 * daemon, web client, and unit tests share ONE protocol implementation.
 *
 * ENV: ABLY_API_KEY (required, server key — never shipped to browsers),
 *      MASTER_PLAN_PATH (default <repo>/master-plan.mdx),
 *      MASTER_PLAN_ORG_ID || FORGE_ORG_ID (default USAV org #1 UUID).
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import Ably from 'ably';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
dotenv.config({ path: path.join(REPO_ROOT, '.env') });

const { createMasterPlanYDoc } = await import('../../src/lib/master-plan/doc.ts');
const { MasterPlanAblyProvider } = await import('../../src/lib/master-plan/ably-yjs-provider.ts');
const { FileSyncEngine } = await import('../../src/lib/master-plan/file-sync-core.ts');
const { getMasterPlanChannel } = await import('../../src/lib/realtime/channels.ts');

const DEFAULT_ORG = '00000000-0000-0000-0000-000000000001';
const ORG_ID = (process.env.MASTER_PLAN_ORG_ID || process.env.FORGE_ORG_ID || DEFAULT_ORG).trim();
const PLAN_PATH = process.env.MASTER_PLAN_PATH
  ? path.resolve(REPO_ROOT, process.env.MASTER_PLAN_PATH)
  : path.join(REPO_ROOT, 'master-plan.mdx');
const SYNC_WAIT_MS = Number(process.env.MASTER_PLAN_SYNC_WAIT_MS || 1500);
const WATCH_DEBOUNCE_MS = 150;

const log = (msg) => console.log(`[master-plan-sync ${new Date().toISOString()}] ${msg}`);

const ABLY_KEY = (process.env.ABLY_API_KEY || '').trim().replace(/^['"]|['"]$/g, '');
if (!ABLY_KEY) {
  console.error('[master-plan-sync] ABLY_API_KEY is not set — daemon cannot start.');
  process.exit(1);
}

async function readPlanFile() {
  try {
    return await fsp.readFile(PLAN_PATH, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

/** Atomic write: temp file in the same dir, then rename over the target. */
async function writePlanFileAtomic(text) {
  const tmp = path.join(path.dirname(PLAN_PATH), `.${path.basename(PLAN_PATH)}.tmp-${process.pid}`);
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, PLAN_PATH);
}

const client = new Ably.Realtime({
  key: ABLY_KEY,
  clientId: 'master-plan-daemon',
  echoMessages: false,
});

const channelName = getMasterPlanChannel(ORG_ID);
const channel = client.channels.get(channelName);

const doc = createMasterPlanYDoc();
const provider = new MasterPlanAblyProvider(doc, channel, {
  clientTag: `daemon-${process.pid}-${Date.now().toString(36)}`,
  onError: (err, where) => log(`provider error at ${where}: ${String(err)}`),
});
const engine = new FileSyncEngine(doc, {
  writeFile: writePlanFileAtomic,
  schedule: (cb, ms) => setTimeout(cb, ms),
  log,
});

let watcher = null;
let watchTimer = null;

function startWatcher() {
  // Watch the DIRECTORY, not the file: editors save via temp+rename, which
  // detaches an inode-bound file watcher on some platforms.
  const dir = path.dirname(PLAN_PATH);
  const base = path.basename(PLAN_PATH);
  watcher = fs.watch(dir, (_event, filename) => {
    if (filename && filename !== base) return;
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(async () => {
      try {
        const text = await readPlanFile();
        if (text == null) return; // mid-rename; the next event carries the content
        const result = engine.handleFileChanged(text);
        if (result === 'applied') log('upstream: local save merged into the shared doc');
      } catch (err) {
        log(`watcher read failed: ${String(err)}`);
      }
    }, WATCH_DEBOUNCE_MS);
  });
  log(`watching ${PLAN_PATH}`);
}

async function main() {
  log(`org=${ORG_ID} channel=${channelName}`);
  await new Promise((resolve, reject) => {
    client.connection.once('connected', resolve);
    client.connection.once('failed', (state) => reject(new Error(`Ably failed: ${state?.reason?.message}`)));
  });
  log('Ably connected');

  await provider.connect();
  // Give peers one sync window to answer before deciding the doc is empty.
  await new Promise((r) => setTimeout(r, SYNC_WAIT_MS));

  const fileText = await readPlanFile();
  const { seeded, docWonFile } = engine.startup(fileText);
  if (seeded) log('bootstrap: seeded shared doc from local file (idempotent seed)');
  if (docWonFile) {
    // Nothing is silently lost: keep the diverged local copy before the
    // network state (already merged from prior sessions) overwrites it.
    // Re-read RIGHT NOW so a save that landed during the sync window (the
    // watcher isn't attached yet) is captured, not the earlier snapshot.
    const latest = (await readPlanFile()) ?? fileText ?? '';
    const backup = `${PLAN_PATH}.local-backup-${Date.now()}`;
    await fsp.writeFile(backup, latest, 'utf8');
    log(`startup divergence: network doc wins; local copy backed up to ${backup}`);
  }

  startWatcher();

  // After any reconnect, re-ask peers for whatever we missed while offline.
  client.connection.on('connected', () => {
    provider.requestSync().catch((err) => log(`resync failed: ${String(err)}`));
  });

  log('running — Cursor saves fan out to /forge; web edits land back in the file');
}

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return; // npx→tsx→node forwards signals down the tree
  shuttingDown = true;
  log(`${signal} — flushing and closing`);
  try {
    if (watcher) watcher.close();
    engine.stop();
    provider.destroy();
    client.close();
  } finally {
    // Give the final atomic write a beat to land before exiting.
    setTimeout(() => process.exit(0), 250);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  console.error('[master-plan-sync] fatal:', err);
  process.exit(1);
});
