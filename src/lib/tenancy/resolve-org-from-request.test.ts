/**
 * resolveOrgIdFromRequest — fail-closed apex resolution.
 * The DB-free case (apex host, no DEFAULT_TENANT_SLUG) is the security-critical
 */

import 'dotenv/config';
import { test } from 'node:test';
import { strictEqual } from 'node:assert';
import type { NextRequest } from 'next/server';
import { resolveOrgIdFromRequest, NIL_ORG_ID } from '@/lib/tenancy/resolve-org-from-request';

const HAS_DB = !!process.env.DATABASE_URL;
const DOGFOOD_ORG_ID = '00000000-0000-0000-0000-000000000001';

function reqWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

test('apex host (no x-tenant-slug, no DEFAULT_TENANT_SLUG) → NIL_ORG_ID, never USAV', async () => {
  const prev = process.env.DEFAULT_TENANT_SLUG;
  delete process.env.DEFAULT_TENANT_SLUG;
  try {
    const orgId = await resolveOrgIdFromRequest(reqWith({}));
    strictEqual(orgId, NIL_ORG_ID, 'apex must fail closed to the nil org');
    strictEqual(orgId === DOGFOOD_ORG_ID, false, 'apex must NOT resolve to the USAV dogfood org');
  } finally {
    if (prev !== undefined) process.env.DEFAULT_TENANT_SLUG = prev;
  }
});

test('unknown slug → NIL_ORG_ID (fail closed, never another tenant)', { skip: !HAS_DB }, async () => {
  const orgId = await resolveOrgIdFromRequest(reqWith({ 'x-tenant-slug': 'no-such-slug-zzz' }));
  strictEqual(orgId, NIL_ORG_ID, 'unknown slug must fail closed');
});

test('known slug → that org id (DEFAULT_TENANT_SLUG bridge also resolves)', { skip: !HAS_DB }, async () => {
  const { default: pool } = await import('@/lib/db');
  await pool.query(
    `INSERT INTO organizations (id, slug, name, plan)
       VALUES ($1, 'resolve-org-test', 'Resolve Org Test', 'trial')
     ON CONFLICT (id) DO NOTHING`,
    ['00000000-0000-0000-0000-0000000000cc'],
  );
  try {
    const viaHeader = await resolveOrgIdFromRequest(reqWith({ 'x-tenant-slug': 'resolve-org-test' }));
    strictEqual(viaHeader, '00000000-0000-0000-0000-0000000000cc', 'known slug resolves to its org id');

    const prev = process.env.DEFAULT_TENANT_SLUG;
    process.env.DEFAULT_TENANT_SLUG = 'resolve-org-test';
    try {
      const viaDefault = await resolveOrgIdFromRequest(reqWith({}));
      strictEqual(viaDefault, '00000000-0000-0000-0000-0000000000cc', 'DEFAULT_TENANT_SLUG bridges the apex host');
    } finally {
      if (prev !== undefined) process.env.DEFAULT_TENANT_SLUG = prev;
      else delete process.env.DEFAULT_TENANT_SLUG;
    }
  } finally {
    await pool.query(`DELETE FROM organizations WHERE slug = 'resolve-org-test'`);
  }
});
