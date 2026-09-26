/** Workflow engine — per-unit advance lock (Phase 1.0). */

import type { AdvanceLock } from './contract';
import { isRedisConfigured, redisCmd } from '@/lib/redis/client';

function isConfigured(): boolean {
  return isRedisConfigured();
}

/** Lock lifetime. Long enough for one human-paced advance, short enough that a
 * crashed holder auto-expires without manual cleanup. */
const LOCK_TTL_MS = 15_000;

/** Compare-and-delete: only release the key if we still hold our exact token. */
const RELEASE_LUA =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

/** Tokens for keys this process currently holds. */
const heldTokens = new Map<string, string>();

let tokenSeq = 0;
function mintToken(): string {
  tokenSeq = (tokenSeq + 1) % Number.MAX_SAFE_INTEGER;
  return `${process.pid.toString(36)}-${Date.now().toString(36)}-${tokenSeq.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

export const redisAdvanceLock: AdvanceLock = {
  async acquire(key) {
    if (!isConfigured()) return true; // dev/CI/preview: behave like NULL_LOCK
    const token = mintToken();
    try {
      const result = await redisCmd(['SET', key, token, 'NX', 'PX', String(LOCK_TTL_MS)]);
      if (result === 'OK') {
        heldTokens.set(key, token);
        return true;
      }
      // SET NX returned null → another advance holds this unit's lock right now.
      return false;
    } catch (err) {
      // Infra hiccup → fail OPEN: proceed without the lock. The engine's
      // event-gated idempotency makes a rare concurrent advance a re-park, not
      // a corruption; stalling a fire-and-forget tap would be the worse outcome.
      console.warn(
        `[wf-lock] acquire ${key} failed (proceeding without lock):`,
        err instanceof Error ? err.message : err,
      );
      return true;
    }
  },

  async release(key) {
    if (!isConfigured()) return;
    const token = heldTokens.get(key);
    heldTokens.delete(key);
    if (!token) return; // never acquired a real lock (fail-open path) — nothing to free
    try {
      await redisCmd(['EVAL', RELEASE_LUA, '1', key, token]);
    } catch (err) {
      console.warn(
        `[wf-lock] release ${key} failed (TTL ${LOCK_TTL_MS}ms will expire it):`,
        err instanceof Error ? err.message : err,
      );
    }
  },
};
