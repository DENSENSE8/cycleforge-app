/**
 * AES-256-GCM payload encryption for organization_integrations.
 *
 * The key is read once at module load from INTEGRATION_KMS_KEY — a
 * base64-encoded 32-byte (256-bit) buffer. In production this should come
 * from a real KMS (AWS KMS, Google Cloud KMS, HashiCorp Vault) via your
 * deploy secret manager; we keep the storage shape KMS-compatible (one
 * symmetric key per environment) so swapping it later is a config change,
 * not a code change.
 *
 * Ciphertext format (base64):  <iv (12 bytes)><auth tag (16 bytes)><cipher>
 * Same envelope on both encrypt and decrypt — easy to grep through audit
 * logs and trivially identifiable in a hex dump.
 *
 * ROTATION — why decrypt takes a key LIST and encrypt does not
 * ------------------------------------------------------------
 * Encryption always uses INTEGRATION_KMS_KEY. Decryption tries that key first
 * and then every key in INTEGRATION_KMS_KEY_PREVIOUS (comma-separated), so a
 * row written under an older key still opens.
 *
 * This is not hypothetical tidiness. On 2026-08-21 local dev and Vercel
 * production were pointed at the SAME Neon database while holding DIFFERENT
 * INTEGRATION_KMS_KEY values. `organization_integrations` carries one row per
 * (org, provider), so whichever environment refreshed an OAuth token
 * re-encrypted that row with its own key and locked the other one out. The
 * Zoho row flipped on a ~10-minute cron; every `purchaseorders.*` call in the
 * other environment came back `denied — no active credential` while the
 * Integrations page still read "Connected", because an undecryptable payload
 * and an absent one both surface as `null`.
 *
 * With a previous-key list the fix is a config change with no downtime and no
 * operator reconnects: put the incoming key in INTEGRATION_KMS_KEY and the
 * outgoing one in INTEGRATION_KMS_KEY_PREVIOUS. Rows re-encrypt under the new
 * key as they are rewritten; `scripts/reencrypt-integration-payloads.ts`
 * finishes the stragglers so the previous key can be dropped.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;
let cachedPreviousKeys: Buffer[] | null = null;

function decodeKey(raw: string, envName: string): Buffer {
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`${envName} must decode to ${KEY_BYTES} bytes; got ${key.length}`);
  }
  return key;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.INTEGRATION_KMS_KEY;
  if (!raw) {
    throw new Error(
      'INTEGRATION_KMS_KEY is not set. Generate one with:  ' +
        'node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  cachedKey = decodeKey(raw, 'INTEGRATION_KMS_KEY');
  return cachedKey;
}

/**
 * Retired keys still accepted for DECRYPTION only, newest first.
 * `INTEGRATION_KMS_KEY_PREVIOUS` is comma-separated so more than one rotation
 * can be in flight. A malformed entry is skipped with a warning rather than
 * throwing — one bad character must not take every integration offline.
 */
function getPreviousKeys(): Buffer[] {
  if (cachedPreviousKeys) return cachedPreviousKeys;
  const raw = process.env.INTEGRATION_KMS_KEY_PREVIOUS;
  if (!raw?.trim()) {
    cachedPreviousKeys = [];
    return cachedPreviousKeys;
  }
  const keys: Buffer[] = [];
  for (const [i, part] of raw.split(',').entries()) {
    if (!part.trim()) continue;
    try {
      keys.push(decodeKey(part, `INTEGRATION_KMS_KEY_PREVIOUS[${i}]`));
    } catch (err) {
      console.warn(
        `[integrations] ignoring INTEGRATION_KMS_KEY_PREVIOUS[${i}]:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  cachedPreviousKeys = keys;
  return cachedPreviousKeys;
}

/**
 * Test seam: the key caches are read once per process, so a test that swaps
 * INTEGRATION_KMS_KEY mid-run needs a way to invalidate them.
 */
export function resetIntegrationKeyCacheForTests(): void {
  cachedKey = null;
  cachedPreviousKeys = null;
}

/**
 * True when INTEGRATION_KMS_KEY is present and decodes to a valid 32-byte key,
 * i.e. encrypt/decrypt will work. Lets callers choose encrypted-at-rest when a
 * key is configured and fall back to plaintext when it isn't — without throwing.
 */
export function isIntegrationKmsConfigured(): boolean {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Enforce encryption-at-rest in production. Call this on any code path that
 * would otherwise fall back to storing a secret as plaintext when no key is
 * configured (e.g. writeEbayToken). In production (Vercel `production`, or
 * NODE_ENV=production) a missing/invalid INTEGRATION_KMS_KEY throws; in
 * dev/preview it only warns so local work keeps going without the key.
 */
export function assertIntegrationKmsConfigured(context = 'integration credentials'): void {
  if (isIntegrationKmsConfigured()) return;
  const isProduction =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (isProduction) {
    throw new Error(
      `INTEGRATION_KMS_KEY must be configured in production to store ${context} ` +
        '(encryption-at-rest is required). Generate one with:  ' +
        'node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  console.warn(
    `[integrations] INTEGRATION_KMS_KEY not set — ${context} will be stored as plaintext (dev only).`,
  );
}

export function encryptIntegrationPayload(plaintext: unknown): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(plaintext), 'utf8');
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptIntegrationPayload<T = unknown>(envelope: string): T {
  const buf = Buffer.from(envelope, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('encrypted payload is too short');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);

  // Current key first, then each retired key. A GCM tag mismatch is the only
  // signal that a key is wrong, so "try the next one" is the whole mechanism.
  const candidates = [getKey(), ...getPreviousKeys()];
  let lastErr: unknown;
  for (const key of candidates) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plain.toString('utf8')) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  // Name the actual condition. This used to surface as the bare node message
  // "Unsupported state or unable to authenticate data", which reads like data
  // corruption and sent the 2026-08-21 investigation looking at the wrong layer.
  throw new Error(
    `integration payload could not be decrypted with INTEGRATION_KMS_KEY` +
      `${candidates.length > 1 ? ` or any of the ${candidates.length - 1} key(s) in INTEGRATION_KMS_KEY_PREVIOUS` : ''}` +
      ` — it was encrypted under a different key. If two environments share this database,` +
      ` they must share this key. (${lastErr instanceof Error ? lastErr.message : String(lastErr)})`,
  );
}

/** True when vault lookup failed because this process cannot open the ciphertext. */
export function isIntegrationPayloadDecryptError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes('could not be decrypted with integration_kms_key');
}

/**
 * Store an integration payload. Encrypts when INTEGRATION_KMS_KEY is configured;
 * otherwise JSON-stringifies for local dev (mirrors writeEbayToken).
 */
export function serializeIntegrationPayload(plaintext: unknown): string {
  if (isIntegrationKmsConfigured()) return encryptIntegrationPayload(plaintext);
  assertIntegrationKmsConfigured('integration credentials');
  return JSON.stringify(plaintext);
}

/**
 * Read a stored integration payload — encrypted envelope or dev plaintext JSON.
 */
export function parseIntegrationPayload<T = unknown>(stored: string): T {
  const raw = stored.trim();
  if (!raw) throw new Error('integration payload is empty');
  if (raw.startsWith('{') || raw.startsWith('[')) {
    return JSON.parse(raw) as T;
  }
  return decryptIntegrationPayload<T>(raw);
}
