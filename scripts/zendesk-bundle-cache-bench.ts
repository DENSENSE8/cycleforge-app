/**
 * Benchmark Zendesk ticket bundle cold vs Redis-warm using .env Upstash creds.
 *   npx tsx scripts/zendesk-bundle-cache-bench.ts
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { DOGFOOD_ORG_ID } from '@/lib/tenancy/constants';
import { isRedisConfigured } from '@/lib/redis/client';
import { getHelpdeskProvider } from '@/lib/integrations/helpdesk';
import { loadZendeskTicketBundle } from '@/lib/integrations/helpdesk/load-ticket-bundle';
import {
  invalidateZendeskTicketCache,
  zendeskBundleCacheKey,
} from '@/lib/integrations/helpdesk/zendesk-ticket-cache';
import { getCachedJson } from '@/lib/cache/upstash-cache';
import { ZENDESK_CACHE_NS } from '@/lib/integrations/helpdesk/zendesk-ticket-cache';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const TICKET_ID = Number(process.env.PW_ZENDESK_TICKET_ID || '9410');

async function timed<T>(label: string, fn: () => Promise<T>): Promise<{ ms: number; value: T }> {
  const t0 = Date.now();
  const value = await fn();
  const ms = Date.now() - t0;
  console.log(`[bench] ${label}: ${ms}ms`);
  return { ms, value };
}

async function main() {
  console.log(`[bench] ticket=${TICKET_ID} org=${DOGFOOD_ORG_ID}`);
  console.log(`[bench] redisConfigured=${isRedisConfigured()}`);

  if (!isRedisConfigured()) {
    console.error('[bench] FAIL — set KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*) in .env');
    process.exit(1);
  }

  const helpdesk = await getHelpdeskProvider(DOGFOOD_ORG_ID);
  if (!helpdesk || !(await helpdesk.isConfigured())) {
    console.error('[bench] FAIL — helpdesk not configured for dogfood org');
    process.exit(1);
  }

  await invalidateZendeskTicketCache(DOGFOOD_ORG_ID, TICKET_ID);

  const cold = await timed('cold (bypassCache)', () =>
    loadZendeskTicketBundle(DOGFOOD_ORG_ID, TICKET_ID, helpdesk, { bypassCache: true }),
  );
  const warm1 = await timed('warm1 (redis)', () =>
    loadZendeskTicketBundle(DOGFOOD_ORG_ID, TICKET_ID, helpdesk),
  );
  const warm2 = await timed('warm2 (redis)', () =>
    loadZendeskTicketBundle(DOGFOOD_ORG_ID, TICKET_ID, helpdesk),
  );

  const cached = await getCachedJson(
    ZENDESK_CACHE_NS,
    DOGFOOD_ORG_ID,
    zendeskBundleCacheKey(TICKET_ID),
  );

  console.log(
    `[bench] subject="${cold.value.ticket.subject?.slice(0, 60) ?? ''}" comments=${cold.value.comments.length}`,
  );
  console.log(`[bench] redisKeyPopulated=${Boolean(cached)}`);
  console.log(
    `[bench] summary cold=${cold.ms}ms warm1=${warm1.ms}ms warm2=${warm2.ms}ms speedup=${Math.round((1 - warm1.ms / cold.ms) * 100)}%`,
  );

  if (!cached) {
    console.error('[bench] FAIL — bundle was not written to Redis after warm1');
    process.exit(1);
  }
  if (warm1.ms >= cold.ms) {
    console.error('[bench] FAIL — warm read was not faster than cold rebuild');
    process.exit(1);
  }
  if (warm2.ms > warm1.ms * 1.5) {
    console.warn('[bench] WARN — warm2 slower than warm1 (acceptable variance)');
  }

  console.log('[bench] OK');
}

main().catch((err) => {
  console.error('[bench] FAIL', err);
  process.exit(1);
});
