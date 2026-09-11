import assert from 'node:assert/strict';
import test from 'node:test';
import { postgresDsnComputeKey, resolveTenantAppDatabaseUrl } from './env-utils';

test('postgresDsnComputeKey strips pooler and ignores credentials', () => {
  assert.equal(
    postgresDsnComputeKey(
      'postgres://neondb_owner:x@ep-silent-king-adurqxds-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require',
    ),
    postgresDsnComputeKey(
      'postgres://neondb_owner:x@ep-silent-king-adurqxds.c-2.us-east-1.aws.neon.tech/neondb',
    ),
  );
});

test('resolveTenantAppDatabaseUrl aliases when the tenant DSN is another Neon compute', () => {
  const owner =
    'postgres://neondb_owner:x@ep-silent-king-adurqxds-pooler.c-2.us-east-1.aws.neon.tech/neondb';
  const leftoverProd =
    'postgresql://app_tenant:y@ep-shiny-hall-adz0n0nu-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';
  assert.equal(resolveTenantAppDatabaseUrl(owner, leftoverProd), '');
  const aligned = leftoverProd.replace('ep-shiny-hall-adz0n0nu', 'ep-silent-king-adurqxds');
  assert.equal(resolveTenantAppDatabaseUrl(owner, aligned), aligned);
  assert.equal(resolveTenantAppDatabaseUrl(owner, ''), '');
});
