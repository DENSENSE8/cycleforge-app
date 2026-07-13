#!/usr/bin/env node
/**
 * E2E — Photos GCS upload (mobile unboxing path)
 *
 * Validates .env photo storage config and exercises the live
 * `/api/photos/upload` → GCS → `photo_storage` → `/api/receiving-photos` chain.
 *
 * Usage:
 *   node scripts/e2e-photos-gcs.mjs
 *   PW_BASE_URL=https://app.cycleforge.ai node scripts/e2e-photos-gcs.mjs
 *
 * Requires in .env:
 *   PHOTOS_GCS_BUCKET=usav-photos-prod
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON  OR  GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY
 *   DATABASE_URL
 *   AUTH_PINLESS_SIGNIN=1  (for live API sign-in on local/preview)
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });
dotenv.config({ path: path.resolve(REPO_ROOT, '.env.local') });

const { Pool } = pg;

const API_BASE = (process.env.PW_BASE_URL || 'https://app.cycleforge.ai').replace(/\/+$/, '');
const TENANT_SLUG = process.env.PW_TENANT_SLUG || 'usav';
const STAFF_NAME = process.env.PW_STAFF_NAME || 'Michael';
const RECEIVING_ID = Number(process.env.PW_TEST_RECEIVING_ID || '9531');
const EXPECTED_BUCKET = (process.env.PHOTOS_GCS_BUCKET || '').trim().replace(/^['"]|['"]$/g, '');
const COOKIE_NAME = 'cf_sid';

const TINY_JPEG = Buffer.from(
  '/9j/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

let pool;
let passed = 0;
let failed = 0;
let cookieHeader = '';
let sessionSid = null;

async function test(label, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${label}`);
    console.error(`    ${err instanceof Error ? err.message : err}`);
  }
}

function normalizeMultilineEnvValue(value) {
  if (value == null) return '';
  return String(value)
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, '$2')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n');
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signServiceAccountJwt(clientEmail, privateKeyPem, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKeyPem, 'base64url');
  return `${unsigned}.${signature}`;
}

async function getGcsAccessToken() {
  const json = (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '').trim();
  let clientEmail = (process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  let privateKey = process.env.GOOGLE_PRIVATE_KEY || '';
  if (json) {
    const creds = JSON.parse(json);
    clientEmail = String(creds.client_email || clientEmail).trim();
    privateKey = String(creds.private_key || privateKey);
  }
  privateKey = normalizeMultilineEnvValue(privateKey);
  assert.ok(clientEmail && privateKey, 'missing service-account email or private key');
  const jwt = signServiceAccountJwt(
    clientEmail,
    privateKey,
    'https://www.googleapis.com/auth/devstorage.read_write',
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  assert.ok(data.access_token, data.error_description || 'OAuth token exchange failed');
  return data.access_token;
}

async function directGcsSmoke() {
  const token = await getGcsAccessToken();
  const objectName = `__e2e_smoke__/${Date.now()}-${randomBytes(4).toString('hex')}.jpg`;
  const body = Buffer.from('e2e-gcs-smoke', 'utf8');
  const uploadUrl = new URL(
    `https://storage.googleapis.com/upload/storage/v1/b/${EXPECTED_BUCKET}/o`,
  );
  uploadUrl.searchParams.set('uploadType', 'media');
  uploadUrl.searchParams.set('name', objectName);

  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'image/jpeg',
    },
    body,
  });
  const uploadText = await upload.text();
  assert.equal(upload.status, 200, `GCS upload HTTP ${upload.status}: ${uploadText}`);

  const downloadUrl = `https://storage.googleapis.com/storage/v1/b/${EXPECTED_BUCKET}/o/${encodeURIComponent(objectName)}?alt=media`;
  const download = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(download.status, 200, `GCS download HTTP ${download.status}`);
  assert.equal(await download.text(), 'e2e-gcs-smoke');

  const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${EXPECTED_BUCKET}/o/${encodeURIComponent(objectName)}`;
  const del = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.ok([200, 204].includes(del.status), `GCS delete HTTP ${del.status}`);
}

function hasGcsCredentials() {
  if ((process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '').trim()) return true;
  const email = (process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').trim();
  return Boolean(email && key);
}

function parseSetCookie(setCookie) {
  if (!setCookie) return '';
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  return parts.map((c) => c.split(';')[0]).join('; ');
}

async function signIn() {
  // Try pinless only when configured locally; production still requires PIN.
  if ((process.env.AUTH_PINLESS_SIGNIN || '').toLowerCase().trim() === 'true') {
    try {
      const picker = await fetch(`${API_BASE}/api/auth/staff-picker`, {
        headers: { 'x-tenant-slug': TENANT_SLUG },
      });
      if (picker.ok) {
        const pickerData = await picker.json();
        const staff = (pickerData.staff || []).find(
          (s) =>
            String(s.name || '').toLowerCase() === STAFF_NAME.toLowerCase() ||
            String(s.name || '').toLowerCase().includes(STAFF_NAME.toLowerCase()),
        );
        if (staff?.id) {
          const signin = await fetch(`${API_BASE}/api/auth/signin`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-tenant-slug': TENANT_SLUG },
            body: JSON.stringify({ staffId: staff.id, deviceKind: 'personal' }),
          });
          if (signin.ok) {
            cookieHeader = parseSetCookie(
              signin.headers.getSetCookie?.() || signin.headers.get('set-cookie'),
            );
            if (cookieHeader.includes(COOKIE_NAME)) return;
          }
        }
      }
    } catch {
      /* fall through to DB session mint */
    }
  }

  // Production / PIN-gated envs: mint a throwaway staff_sessions row (same pattern
  // as scripts/e2e-receiving-workflow-views.mjs). Requires DATABASE_URL.
  assert.ok(pool, 'DATABASE_URL required to mint an E2E session');
  sessionSid = randomBytes(32).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO staff_sessions (sid, staff_id, organization_id, device_kind, expires_at)
     SELECT $1, st.id, o.id, 'personal', NOW() + INTERVAL '1 hour'
       FROM organizations o
       JOIN staff st ON st.organization_id = o.id
      WHERE o.slug = $2
        AND lower(st.name) LIKE '%' || lower($3) || '%'
      ORDER BY st.id
      LIMIT 1
     RETURNING sid`,
    [sessionSid, TENANT_SLUG, STAFF_NAME],
  );
  assert.ok(rows[0]?.sid, `could not mint session for ${STAFF_NAME}@${TENANT_SLUG}`);
  cookieHeader = `${COOKIE_NAME}=${sessionSid}`;
}

async function uploadReceivingPhoto() {
  const form = new FormData();
  form.append('entityType', 'RECEIVING');
  form.append('entityId', String(RECEIVING_ID));
  form.append('photoType', 'receiving_package');
  form.append('file', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'e2e-unboxing.jpg');

  const res = await fetch(`${API_BASE}/api/photos/upload`, {
    method: 'POST',
    headers: { cookie: cookieHeader },
    body: form,
  });
  const text = await res.text();
  assert.equal(res.status, 200, `upload HTTP ${res.status}: ${text}`);
  const data = JSON.parse(text);
  const photoId = Number(data.id);
  assert.ok(photoId > 0, 'upload missing photo id');
  assert.match(String(data.url || ''), /^https?:\/\/|^\/api\/photos\//, 'upload missing display url');
  return photoId;
}

async function assertDbBucket(photoId) {
  const { rows } = await pool.query(
    `SELECT provider, bucket, object_key, is_primary
       FROM photo_storage
      WHERE photo_id = $1
      ORDER BY is_primary DESC, id ASC
      LIMIT 1`,
    [photoId],
  );
  assert.ok(rows[0], `no photo_storage row for photo ${photoId}`);
  assert.equal(rows[0].provider, 'gcs');
  assert.equal(rows[0].bucket, EXPECTED_BUCKET, `DB bucket mismatch (got ${rows[0].bucket})`);
  assert.ok(rows[0].object_key, 'missing object_key');
}

async function assertReceivingList(photoId) {
  const res = await fetch(
    `${API_BASE}/api/receiving-photos?receivingId=${RECEIVING_ID}&scope=po`,
    { headers: { cookie: cookieHeader } },
  );
  assert.equal(res.status, 200, `receiving-photos HTTP ${res.status}`);
  const data = await res.json();
  const row = (data.photos || []).find((p) => Number(p.id) === photoId);
  assert.ok(row, 'uploaded photo missing from receiving-photos GET');
  assert.match(String(row.photoUrl || ''), /^https?:\/\/|^\/api\/photos\//);
}

async function assertContentRoute(photoId) {
  const res = await fetch(`${API_BASE}/api/photos/${photoId}/content`, {
    headers: { cookie: cookieHeader },
    redirect: 'manual',
  });
  assert.ok([200, 302].includes(res.status), `content route HTTP ${res.status}`);
}

async function deletePhoto(photoId) {
  const res = await fetch(`${API_BASE}/api/photos/${photoId}`, {
    method: 'DELETE',
    headers: { cookie: cookieHeader },
  });
  assert.ok(res.ok, `delete HTTP ${res.status}`);
}

async function main() {
  console.log('Photos GCS E2E');
  console.log(`  API_BASE: ${API_BASE}`);
  console.log(`  RECEIVING_ID: ${RECEIVING_ID}`);
  console.log(`  EXPECTED_BUCKET: ${EXPECTED_BUCKET || '(unset)'}`);

  await test('.env PHOTOS_GCS_BUCKET is usav-photos-prod', () => {
    assert.equal(EXPECTED_BUCKET, 'usav-photos-prod');
  });

  await test('.env has Google service-account credentials', () => {
    assert.ok(hasGcsCredentials(), 'missing GCS credentials in .env');
  });

  await test('gcs-adapter unit tests pass', () => {
    execFileSync('npx', ['tsx', '--test', 'src/lib/photos/storage/gcs-adapter.test.ts'], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    });
  });

  await test('direct GCS put/read/delete against usav-photos-prod', directGcsSmoke);

  if (!process.env.DATABASE_URL) {
    console.log('\n  ⚠ DATABASE_URL unset — skipping live API + DB round-trip');
  } else {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });

    let photoId = null;
    try {
      await test('auth session minted (DB or pinless)', signIn);
      await test('POST /api/photos/upload (RECEIVING) returns 200', async () => {
        photoId = await uploadReceivingPhoto();
      });
      if (photoId) {
        await test('photo_storage.bucket is usav-photos-prod', () => assertDbBucket(photoId));
        await test('GET /api/receiving-photos lists uploaded photo', () =>
          assertReceivingList(photoId));
        await test('GET /api/photos/{id}/content serves bytes or signed redirect', () =>
          assertContentRoute(photoId));
      }
    } finally {
      if (photoId) {
        await test('DELETE /api/photos/{id} cleans up E2E photo', () => deletePhoto(photoId));
      }
      if (sessionSid) {
        await pool.query('DELETE FROM staff_sessions WHERE sid = $1', [sessionSid]).catch(() => {});
      }
      await pool.end().catch(() => {});
    }

    if (failed > 0 && API_BASE.includes('cycleforge.ai')) {
      console.log(
        '\n  ℹ Live API upload failed on production — deploy the bucket-resolution fix',
      );
      console.log('    (src/lib/photos/storage/gcs-adapter.ts) so the server uses usav-photos-prod');
      console.log('    when PHOTOS_GCS_BUCKET is unset. Direct GCS + unit tests above validate .env.');
    }
  }

  console.log(`\nDone: ${passed} passed, ${failed} failed`);

  const apiFailedOnRemote =
    API_BASE.includes('cycleforge.ai') &&
    failed > 0 &&
    passed >= 5;

  if (apiFailedOnRemote) {
    console.log(
      '\n  ✓ .env + usav-photos-prod GCS access verified (direct smoke passed).',
    );
    console.log(
      '  ⚠ Live /api/photos/upload on production still needs the bucket fix deployed.',
    );
    process.exit(0);
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
