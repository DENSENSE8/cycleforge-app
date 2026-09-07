#!/usr/bin/env node
/**
 * backfill-po-gmail-vault.mjs — one-time migration of the PO Gmail OAuth tokens
 * from the legacy google_oauth_tokens plaintext columns into the integrations
 * vault (organization_integrations, provider='gmail'), storing exactly what
 * /api/admin/po-gmail/oauth-callback stores today: a GmailCredentials payload
 * in an AES-256-GCM envelope under INTEGRATION_KMS_KEY (the envelope format of
 * src/lib/integrations/crypto.ts, mirrored below — ESM script, no TS import).
 *
 * DRY-RUN by default (read-only). --apply executes:
 *   node scripts/backfill-po-gmail-vault.mjs           # report only
 *   node scripts/backfill-po-gmail-vault.mjs --apply   # migrate + verify readback
 *
 * Idempotent / safe to re-run:
 *   - a vault row whose refreshToken already matches the plaintext row is skipped;
 *   - a vault row with a DIFFERENT refreshToken is left untouched (the vault is
 *     the source of truth — a reconnect through the callback outranks stale
 *     legacy rows);
 *   - a vault row that cannot be decrypted with this process's keys is never
 *     overwritten (another environment may own its key) — reported as a failure.
 *
 * Rows for other providers (e.g. the dormant 'google_photos' token) are never
 * migrated — they have no runtime reader; the 2026-09-06 migration drops the
 * token columns and discards them.
 *
 * Run BEFORE applying src/lib/migrations/2026-09-06_po_gmail_drop_plaintext_tokens.sql.
 * Needs DATABASE_URL + INTEGRATION_KMS_KEY (and PO_GMAIL_CLIENT_ID /
 * PO_GMAIL_CLIENT_SECRET, copied into the payload like the callback does) from
 * .env / .env.local. Note: app processes cache credential lookups for 5 minutes
 * — a freshly backfilled row may take up to that long to appear as "connected".
 */

import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

loadEnv({ path: path.resolve('.env'), quiet: true });
loadEnv({ path: path.resolve('.env.local'), override: false, quiet: true });

const APPLY = process.argv.slice(2).includes('--apply');

const DOGFOOD_ORG_ID = '00000000-0000-0000-0000-000000000001'; // src/lib/tenancy/constants.ts
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const PO_GMAIL_SCOPE = [
  'https://www.googleapis.com/auth/gmail.modify',
  'openid',
  'email',
].join(' ');

// ─── KMS envelope (mirror of src/lib/integrations/crypto.ts) ────────────────

function decodeKey(raw, envName) {
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`${envName} must decode to ${KEY_BYTES} bytes; got ${key.length}`);
  }
  return key;
}

function currentKey() {
  const raw = process.env.INTEGRATION_KMS_KEY;
  if (!raw) {
    throw new Error(
      'INTEGRATION_KMS_KEY is not set. It must match the key the app encrypts with. ' +
        'Generate one with: node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  return decodeKey(raw, 'INTEGRATION_KMS_KEY');
}

function previousKeys() {
  const raw = process.env.INTEGRATION_KMS_KEY_PREVIOUS;
  if (!raw?.trim()) return [];
  const keys = [];
  for (const [i, part] of raw.split(',').entries()) {
    if (!part.trim()) continue;
    try {
      keys.push(decodeKey(part, `INTEGRATION_KMS_KEY_PREVIOUS[${i}]`));
    } catch (err) {
      console.warn(`[backfill] ignoring INTEGRATION_KMS_KEY_PREVIOUS[${i}]: ${err.message}`);
    }
  }
  return keys;
}

export function encryptPayload(plaintext) {
  const key = currentKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(plaintext), 'utf8');
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptPayload(envelope) {
  const buf = Buffer.from(envelope, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error('encrypted payload is too short');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const candidates = [currentKey(), ...previousKeys()];
  let lastErr;
  for (const key of candidates) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return JSON.parse(plain.toString('utf8'));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `vault payload could not be decrypted with INTEGRATION_KMS_KEY` +
      `${candidates.length > 1 ? ` or any of the ${candidates.length - 1} key(s) in INTEGRATION_KMS_KEY_PREVIOUS` : ''}` +
      ` — it was encrypted under a different key (${lastErr instanceof Error ? lastErr.message : String(lastErr)})`,
  );
}

/** Safe-to-print token identity (never log token material). */
const fingerprint = (token) => createHash('sha256').update(token).digest('hex').slice(0, 12);

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function columnExists(client, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return r.rowCount > 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set (load it in .env / .env.local)');
    process.exit(1);
  }
  // Fail closed on the key in BOTH modes: a dry-run that cannot prove the
  // envelope works is not a meaningful report.
  try {
    currentKey();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes('sslmode=') ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  try {
    // Self-test: prove this process can produce and open app-compatible
    // envelopes before touching anything.
    const probe = encryptPayload({ probe: 'po-gmail-backfill' });
    const opened = decryptPayload(probe);
    if (opened.probe !== 'po-gmail-backfill') throw new Error('KMS self-test mismatch');
    console.log(`KMS self-test: OK (AES-256-GCM round-trip, key sha256:${fingerprint(process.env.INTEGRATION_KMS_KEY)})`);
    console.log(APPLY ? 'Mode: APPLY (writes enabled)' : 'Mode: DRY RUN (read-only; pass --apply to execute)');

    if (!(await columnExists(client, 'google_oauth_tokens', 'refresh_token'))) {
      console.log('\ngoogle_oauth_tokens.refresh_token already dropped — nothing to backfill. Exiting.');
      return;
    }

    const org = await client.query('SELECT name FROM organizations WHERE id = $1', [DOGFOOD_ORG_ID]);
    if (org.rowCount === 0) {
      console.error(`Dogfood org ${DOGFOOD_ORG_ID} not found — refusing to write vault rows.`);
      process.exitCode = 1;
      return;
    }

    const { rows } = await client.query(
      `SELECT id, provider, account_email, scope, refresh_token, access_token,
              expires_at, connected_by_staff_id, needs_reconnect, needs_reconnect_reason
         FROM google_oauth_tokens
        ORDER BY id`,
    );

    const clientId = process.env.PO_GMAIL_CLIENT_ID;
    const clientSecret = process.env.PO_GMAIL_CLIENT_SECRET;
    let wouldMigrate = 0;
    let migrated = 0;
    let already = 0;
    let conflicts = 0;
    let failures = 0;
    let discarded = 0;

    for (const row of rows) {
      const label = `google_oauth_tokens id=${row.id} provider=${row.provider}` +
        (row.account_email ? ` (${row.account_email})` : '');

      if (row.provider !== 'po_gmail') {
        discarded += 1;
        console.log(`\n[${label}]`);
        console.log('  plaintext tokens present — NOT migrated: no runtime reader for this provider');
        console.log('  (photo backup moved to Google Drive); the migration drops these columns.');
        continue;
      }

      console.log(`\n[${label}]`);
      console.log(`  refresh_token: present (${row.refresh_token.length} chars, sha256:${fingerprint(row.refresh_token)})`);

      if (!clientId || !clientSecret) {
        failures += 1;
        console.log('  BLOCKED: PO_GMAIL_CLIENT_ID / PO_GMAIL_CLIENT_SECRET not set —');
        console.log('  the vault payload must be self-contained like the callback writes it.');
        continue;
      }

      // Existing vault row?
      const vault = await client.query(
        `SELECT payload_encrypted, status
           FROM organization_integrations
          WHERE organization_id = $1 AND provider = 'gmail' AND COALESCE(scope, '') = ''
          LIMIT 1`,
        [DOGFOOD_ORG_ID],
      );

      let plan = 'CREATE';
      if (vault.rowCount > 0) {
        let existing = null;
        try {
          existing = decryptPayload(vault.rows[0].payload_encrypted);
        } catch (err) {
          failures += 1;
          console.log(`  FAILURE: existing vault row cannot be decrypted — ${err.message}`);
          console.log('  refusing to overwrite it (another environment may own its key).');
          continue;
        }
        if (existing.refreshToken && existing.refreshToken === row.refresh_token) {
          already += 1;
          console.log(`  vault row already holds this refreshToken (status='${vault.rows[0].status}') — already migrated, skipping.`);
          continue;
        }
        if (existing.refreshToken) {
          conflicts += 1;
          console.log(`  vault row holds a DIFFERENT refreshToken (sha256:${fingerprint(existing.refreshToken)}) —`);
          console.log('  the vault is the source of truth (a reconnect outranks this legacy row); leaving it untouched.');
          continue;
        }
        plan = 'REPAIR (incomplete vault row: no refreshToken)';
      }

      // Same payload shape the oauth-callback writes.
      const payload = {
        clientId,
        clientSecret,
        refreshToken: row.refresh_token,
        accessToken: row.access_token ?? undefined,
        expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
        accountEmail: row.account_email ?? undefined,
        scope: row.scope || PO_GMAIL_SCOPE,
      };
      const envelope = encryptPayload(payload);

      console.log(`  vault row    : ${plan} → organization_integrations`);
      console.log(`                 org=${DOGFOOD_ORG_ID} provider='gmail' status='active'`);
      console.log(`                 display_label=${row.account_email ?? 'null'} payload=7-field GmailCredentials envelope (${envelope.length} chars)`);
      console.log(`  needs_reconnect: ${row.needs_reconnect}` +
        (row.needs_reconnect
          ? ` → status set to 'error' (last_error preserved from legacy reason)`
          : ` → status stays 'active'`));

      if (!APPLY) {
        wouldMigrate += 1;
        console.log('  readback verify: deferred (dry-run)');
        continue;
      }

      // Mirror of upsertIntegrationCredentials() for provider='gmail'.
      await client.query(
        `INSERT INTO organization_integrations
           (organization_id, provider, scope, payload_encrypted, display_label, status, created_by, expires_at)
         VALUES ($1, 'gmail', NULL, $2, $3, 'active', $4, NULL)
         ON CONFLICT (organization_id, provider, COALESCE(scope, ''))
         DO UPDATE SET
           payload_encrypted = EXCLUDED.payload_encrypted,
           display_label    = EXCLUDED.display_label,
           status           = 'active',
           last_error       = NULL,
           expires_at       = COALESCE(EXCLUDED.expires_at, organization_integrations.expires_at),
           updated_at       = now()`,
        [DOGFOOD_ORG_ID, envelope, row.account_email ?? null, row.connected_by_staff_id ?? null],
      );
      // Preserve a legacy "needs reconnect" flag so the UI stays truthful.
      if (row.needs_reconnect) {
        await client.query(
          `UPDATE organization_integrations
              SET status = 'error',
                  last_error = COALESCE($1, 'flagged needs_reconnect in legacy google_oauth_tokens'),
                  updated_at = now()
            WHERE organization_id = $2 AND provider = 'gmail' AND COALESCE(scope, '') = ''`,
          [(row.needs_reconnect_reason ?? '').slice(0, 1000) || null, DOGFOOD_ORG_ID],
        );
      }

      // Readback verification: decrypt what is now stored and compare.
      const back = await client.query(
        `SELECT payload_encrypted, display_label, status
           FROM organization_integrations
          WHERE organization_id = $1 AND provider = 'gmail' AND COALESCE(scope, '') = ''
          LIMIT 1`,
        [DOGFOOD_ORG_ID],
      );
      const stored = decryptPayload(back.rows[0].payload_encrypted);
      const ok = stored.refreshToken === payload.refreshToken
        && (stored.accountEmail ?? null) === (payload.accountEmail ?? null)
        && stored.clientId === payload.clientId
        && stored.scope === payload.scope;
      if (!ok) {
        failures += 1;
        console.log('  FAILURE: readback mismatch after write — investigate before dropping columns.');
        continue;
      }
      migrated += 1;
      console.log(`  readback verify: OK (refreshToken sha256:${fingerprint(stored.refreshToken)}, status='${back.rows[0].status}')`);
    }

    console.log('\n──────────────────────────────────────────────');
    console.log(`Summary: ${rows.length} legacy row(s) scanned`);
    console.log(`  ${APPLY ? migrated : wouldMigrate} migrated${APPLY ? '' : ' (would be, on --apply)'}, ${already} already migrated, ${conflicts} vault-newer conflict(s), ${discarded} other-provider row(s) discarded by migration, ${failures} failure(s)`);
    if (!APPLY) {
      console.log('Dry-run complete — no rows were written. Execute with: node scripts/backfill-po-gmail-vault.mjs --apply');
    } else if (failures > 0) {
      process.exitCode = 1;
      console.log('FAILURES present — do NOT apply the drop-columns migration until they are resolved.');
    } else {
      console.log('Note: app processes cache credential lookups for 5 min — the row may take that long to show as connected.');
    }
  } finally {
    await client.end();
  }
}
// Run only when executed directly (lets tests import the crypto mirrors above).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  });
}
