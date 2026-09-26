/** AES-256-GCM payload encryption for organization_integrations. */

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

/** Retired keys still accepted for DECRYPTION only, newest first. */
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

/** Enforce encryption-at-rest in production. */
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
