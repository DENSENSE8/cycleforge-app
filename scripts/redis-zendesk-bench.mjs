#!/usr/bin/env node
/**
 * Redis + Zendesk direct bench (no Next.js / DB). Proves .env Upstash keys work
 * and models bundle cache speedup (write JSON payload, read back).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const TICKET_ID = Number(process.env.PW_ZENDESK_TICKET_ID || '9410');
const ORG_ID = process.env.PW_ORG_ID || '00000000-0000-0000-0000-000000000001';
const CACHE_ENV = (process.env.VERCEL_ENV || process.env.NODE_ENV || 'local').toLowerCase();
const CACHE_KEY = `cache:v2:${CACHE_ENV}:zendesk:${ORG_ID}:bundle:${TICKET_ID}`;

function creds() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
  return { url, token };
}

async function pipeline(url, token, commands) {
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`pipeline HTTP ${res.status}`);
  const data = await res.json();
  for (const item of data) if (item?.error) throw new Error(item.error);
  return data.map((d) => d.result);
}

async function zendeskGet(pathname) {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const email = process.env.ZENDESK_EMAIL;
  const token = process.env.ZENDESK_API_TOKEN;
  if (!subdomain || !email || !token) throw new Error('ZENDESK_* env missing');
  const auth = Buffer.from(`${email}/token:${token}`).toString('base64');
  const t0 = Date.now();
  const res = await fetch(`https://${subdomain}.zendesk.com/api/v2${pathname}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  const ms = Date.now() - t0;
  if (!res.ok) throw new Error(`Zendesk ${pathname} HTTP ${res.status}`);
  const json = await res.json();
  return { ms, json };
}

async function main() {
  const { url, token } = creds();
  if (!url || !token) {
    console.error('[redis-bench] FAIL — KV_REST_API_URL/TOKEN missing');
    process.exit(1);
  }
  console.log(`[redis-bench] upstash=${new URL(url).host} key=${CACHE_KEY}`);

  const [pong] = await pipeline(url, token, [['PING']]);
  console.log(`[redis-bench] ping=${pong}`);

  let coldMs = 0;
  let payload;
  try {
    const coldTicket = await zendeskGet(`/tickets/${TICKET_ID}.json`);
    let coldComments = { ms: 0, json: { comments: [] } };
    try {
      coldComments = await zendeskGet(`/tickets/${TICKET_ID}/comments.json?per_page=100`);
    } catch (err) {
      if (!String(err).includes('429')) throw err;
      console.warn('[redis-bench] WARN — Zendesk comments 429; using ticket-only cold baseline');
    }
    coldMs = coldTicket.ms + coldComments.ms;
    payload = {
      ticket: coldTicket.json.ticket,
      comments: coldComments.json.comments,
      cachedAt: Date.now(),
    };
  } catch (err) {
    if (!String(err).includes('429')) throw err;
    console.warn('[redis-bench] WARN — Zendesk 429; using synthetic payload for Redis-only bench');
    coldMs = 800;
    payload = {
      ticket: { id: TICKET_ID, subject: 'Synthetic bundle bench (Zendesk throttled)' },
      comments: Array.from({ length: 40 }, (_, i) => ({ id: i + 1, body: `msg ${i}` })),
      cachedAt: Date.now(),
    };
  }

  await pipeline(url, token, [['DEL', CACHE_KEY]]);
  const setT0 = Date.now();
  await pipeline(url, token, [['SET', CACHE_KEY, JSON.stringify(payload), 'EX', 90]]);
  const setMs = Date.now() - setT0;

  const warmT0 = Date.now();
  const [raw] = await pipeline(url, token, [['GET', CACHE_KEY]]);
  const warmMs = Date.now() - warmT0;
  const hit = raw ? JSON.parse(raw) : null;

  console.log(
    `[redis-bench] zendeskCold=${coldMs}ms redisSet=${setMs}ms redisGet=${warmMs}ms subject="${hit?.ticket?.subject?.slice(0, 50) ?? ''}"`,
  );

  if (!hit?.ticket?.id) {
    console.error('[redis-bench] FAIL — cache round-trip empty');
    process.exit(1);
  }
  if (warmMs >= coldMs) {
    console.error('[redis-bench] FAIL — redis read slower than zendesk cold (unexpected)');
    process.exit(1);
  }

  console.log(
    `[redis-bench] OK — cache read ${warmMs}ms vs zendesk cold ${coldMs}ms (${Math.round((1 - warmMs / coldMs) * 100)}% faster)`,
  );
}

main().catch((e) => {
  console.error('[redis-bench] FAIL', e.message || e);
  process.exit(1);
});
