#!/usr/bin/env node
/**
 * One-off: upsert Zendesk vault credentials for org 01 (dogfood).
 * Uses parent ../.env for DATABASE_URL. Stores plaintext JSON when
 * INTEGRATION_KMS_KEY is unset (dev); encrypts when the key is present.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCipheriv, randomBytes } from 'node:crypto';
import pg from 'pg';

const ORG_ID = process.env.ORG_ID || '00000000-0000-0000-0000-000000000001';
const PAYLOAD = {
  subdomain: process.env.ZENDESK_SUBDOMAIN || 'usav',
  email: process.env.ZENDESK_EMAIL || 'usavsolutions@gmail.com',
  apiToken: process.env.ZENDESK_API_TOKEN || '',
};

function loadParentEnv() {
  const envPath = join(process.cwd(), '..', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function serializePayload(plaintext) {
  const raw = process.env.INTEGRATION_KMS_KEY;
  if (!raw) return JSON.stringify(plaintext);
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('INTEGRATION_KMS_KEY must decode to 32 bytes');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const json = Buffer.from(JSON.stringify(plaintext), 'utf8');
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

async function main() {
  loadParentEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  if (!PAYLOAD.apiToken) throw new Error('ZENDESK_API_TOKEN not set');

  const enc = serializePayload(PAYLOAD);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  const before = await pool.query(
    `SELECT provider, status, left(payload_encrypted, 60) AS prefix
       FROM organization_integrations
      WHERE organization_id = $1 AND provider = 'zendesk'`,
    [ORG_ID],
  );
  console.log('org:', ORG_ID);
  console.log('before:', before.rows[0] ?? null);

  await pool.query(
    `INSERT INTO organization_integrations
       (organization_id, provider, scope, payload_encrypted, display_label, status)
     VALUES ($1, 'zendesk', NULL, $2, 'Zendesk', 'active')
     ON CONFLICT (organization_id, provider, COALESCE(scope, ''))
     DO UPDATE SET
       payload_encrypted = EXCLUDED.payload_encrypted,
       display_label    = EXCLUDED.display_label,
       status           = 'active',
       last_error       = NULL,
       updated_at       = now()`,
    [ORG_ID, enc],
  );

  const after = await pool.query(
    `SELECT provider, status, left(payload_encrypted, 60) AS prefix
       FROM organization_integrations
      WHERE organization_id = $1 AND provider = 'zendesk'`,
    [ORG_ID],
  );
  console.log('after:', after.rows[0] ?? null);
  console.log('ok — zendesk credentials saved for org 01');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
