#!/usr/bin/env node
/**
 * Zendesk bundle cache + perf smoke (HTTP only — no Next dev server required).
 * Loads Upstash creds from cycleforge-app/.env, signs in, compares cold vs warm bundle.
 *
 *   node scripts/verify-zendesk-bundle-cache.mjs
 *   PW_BASE_URL=https://app.cycleforge.ai PW_TENANT_SLUG=usav node scripts/verify-zendesk-bundle-cache.mjs
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

function resolveRedisRestCreds(env = process.env) {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').replace(/\/+$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '';
  return { url, token };
}

const BASE = (process.env.PW_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const TENANT = process.env.PW_TENANT_SLUG || 'usav';
const STAFF = process.env.PW_STAFF_NAME || 'Michael';
const PIN = process.env.PW_STAFF_PIN?.trim() || '';
const TICKET_ID = Number(process.env.PW_ZENDESK_TICKET_ID || '9410');

const { url: redisUrl, token: redisToken } = resolveRedisRestCreds(process.env);

async function main() {
  console.log(`[verify] base=${BASE} tenant=${TENANT} ticket=${TICKET_ID}`);
  console.log(
    `[verify] redisConfigured=${Boolean(redisUrl && redisToken)} host=${redisUrl ? new URL(redisUrl).host : '(none)'}`,
  );

  if (!redisUrl || !redisToken) {
    console.error('[verify] FAIL — KV_REST_API_URL/TOKEN missing from .env');
    process.exit(1);
  }

  const ping = await fetch(`${redisUrl}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([['PING']]),
  });
  if (!ping.ok) {
    console.error(`[verify] FAIL — Upstash ping HTTP ${ping.status}`);
    process.exit(1);
  }
  const pingBody = await ping.json();
  console.log(`[verify] upstashPing=${JSON.stringify(pingBody?.[0]?.result ?? pingBody)}`);

  const jar = new Map();
  const store = (res) => {
    const raw = res.headers.get('set-cookie');
    if (!raw) return;
    for (const part of raw.split(/,(?=\s*[^;]+=)/)) {
      const [kv] = part.split(';');
      const eq = kv.indexOf('=');
      if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
    }
  };
  const headers = () => {
    const h = { 'x-tenant-slug': TENANT };
    if (jar.size) h.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    return h;
  };

  const picker = await fetch(`${BASE}/api/auth/staff-picker`, { headers: headers() });
  store(picker);
  if (!picker.ok) throw new Error(`staff-picker ${picker.status}: ${await picker.text()}`);
  const staffList = (await picker.json()).staff ?? [];
  const staff = staffList.find((s) => s.name.toLowerCase().includes(STAFF.toLowerCase()));
  if (!staff) throw new Error(`staff "${STAFF}" not found (${staffList.length} rows)`);

  const signinBody = { staffId: staff.id, deviceKind: 'personal' };
  if (PIN) signinBody.pin = PIN;
  const signin = await fetch(`${BASE}/api/auth/signin`, {
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/json' },
    body: JSON.stringify(signinBody),
  });
  store(signin);
  const signinJson = await signin.json().catch(() => null);
  if (!signin.ok || !signinJson?.ok) {
    throw new Error(
      `signin ${signin.status}: ${JSON.stringify(signinJson)} — set PW_STAFF_PIN if prod requires PIN`,
    );
  }
  console.log(`[verify] signedIn=${signinJson.name} staffId=${staff.id}`);

  async function timed(pathname) {
    const t0 = Date.now();
    const res = await fetch(`${BASE}${pathname}`, { headers: headers() });
    const ms = Date.now() - t0;
    const json = await res.json().catch(() => null);
    return { res, ms, json };
  }

  // Legacy fan-out baseline (cold paths, no bundle).
  const legacy = await Promise.all([
    timed(`/api/zendesk/tickets/${TICKET_ID}?refresh=1`).catch(() => null),
    timed(`/api/zendesk/tickets/${TICKET_ID}/comments?refresh=1`),
    timed(`/api/zendesk/agents`),
    timed(`/api/zendesk/tickets/${TICKET_ID}/photos`),
    timed(`/api/zendesk/tickets/${TICKET_ID}/assign`),
  ]);
  const legacyMs = legacy.reduce((sum, r) => sum + (r?.ms ?? 0), 0);

  const cold = await timed(`/api/zendesk/tickets/${TICKET_ID}/bundle?refresh=1`);
  const warm1 = await timed(`/api/zendesk/tickets/${TICKET_ID}/bundle`);
  const warm2 = await timed(`/api/zendesk/tickets/${TICKET_ID}/bundle`);

  console.log(
    `[verify] legacyFanOut~${legacyMs}ms coldBundle=${cold.ms}ms warm1=${warm1.ms}ms warm2=${warm2.ms}ms`,
  );

  if (!cold.res.ok || !warm1.res.ok) {
    console.error('[verify] FAIL — bundle API', { cold: cold.json, warm: warm1.json });
    process.exit(1);
  }
  if (warm1.ms >= cold.ms) {
    console.error('[verify] FAIL — warm bundle not faster than cold (Redis may be off on server)');
    process.exit(1);
  }
  if (warm1.ms >= legacyMs) {
    console.warn('[verify] WARN — single warm bundle not faster than legacy fan-out sum (Zendesk variance)');
  } else {
    console.log(
      `[verify] OK — warm bundle ${warm1.ms}ms vs legacy ~${legacyMs}ms (${Math.round((1 - warm1.ms / legacyMs) * 100)}% faster than old fan-out)`,
    );
  }
  console.log(`[verify] OK — warm ${warm1.ms}ms vs cold ${cold.ms}ms (${Math.round((1 - warm1.ms / cold.ms) * 100)}% faster)`);
}

main().catch((err) => {
  console.error('[verify] FAIL', err.message || err);
  process.exit(1);
});
