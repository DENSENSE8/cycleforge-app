/** DB-free tests for the one-branch assertion. */

import assert from 'node:assert/strict';
import test from 'node:test';
import { describeBranchSplit, neonBranchHost } from './db-single-branch';

const POOLED = 'postgresql://owner:pw@ep-shiny-hall-adz0n0nu-pooler.c-2.aws.neon.tech/neondb?sslmode=require';
const DIRECT = 'postgresql://owner:pw@ep-shiny-hall-adz0n0nu.c-2.aws.neon.tech/neondb?sslmode=require';
const OTHER = 'postgres://owner:pw@ep-silent-king-adurqxds-pooler.c-2.aws.neon.tech/neondb';

test('pooled and direct endpoints of ONE branch are not a split', () => {
  // The `-pooler` suffix is a connection mode, not a branch. Treating it as one
  // would make the correct configuration fail to boot.
  assert.equal(neonBranchHost(POOLED), neonBranchHost(DIRECT));
  assert.equal(
    describeBranchSplit({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT }),
    null,
  );
});

test('a bare PGHOST hostname is compared, not ignored', () => {
  // PGHOST is what psql and drizzle-kit read. It carried the stale branch for
  // hours after the app had been repointed, so migrations would have hit the
  // wrong database with no warning.
  assert.equal(neonBranchHost('ep-shiny-hall-adz0n0nu-pooler.c-2.aws.neon.tech'), 'ep-shiny-hall-adz0n0nu.c-2.aws.neon.tech');
  const msg = describeBranchSplit({
    DATABASE_URL: POOLED,
    PGHOST: 'ep-silent-king-adurqxds-pooler.c-2.aws.neon.tech',
  });
  assert.ok(msg, 'a tooling host on another branch must be reported');
  assert.match(msg, /2 different Neon branches/);
  assert.match(msg, /PGHOST/);
});

test('the message names WHICH var dragged the branches apart', () => {
  // Without the var names the operator learns only that something is wrong,
  // which is the state that took a day to resolve.
  const msg = describeBranchSplit({ DATABASE_URL: POOLED, TENANT_APP_DATABASE_URL: OTHER });
  assert.ok(msg);
  assert.match(msg, /ep-shiny-hall-adz0n0nu.*DATABASE_URL/s);
  assert.match(msg, /ep-silent-king-adurqxds.*TENANT_APP_DATABASE_URL/s);
});

test('the real outage shape is caught', () => {
  // Exactly what was live on 2026-09-14: app on the lane branch, tooling and
  // the tenant pool on main.
  const msg = describeBranchSplit({
    DATABASE_URL: OTHER,
    DATABASE_URL_UNPOOLED: 'postgres://owner:pw@ep-silent-king-adurqxds.c-2.aws.neon.tech/neondb',
    POSTGRES_URL: POOLED,
    TENANT_APP_DATABASE_URL: POOLED,
    PGHOST: 'ep-silent-king-adurqxds-pooler.c-2.aws.neon.tech',
  });
  assert.ok(msg);
  assert.match(msg, /2 different Neon branches/);
});

test('unset and localhost values are not branches', () => {
  // The wsproxy dev path is a legitimate localhost DSN; an empty var is simply
  // absent. Neither may trip the guard, or local dev cannot boot.
  assert.equal(neonBranchHost(undefined), null);
  assert.equal(neonBranchHost(''), null);
  assert.equal(neonBranchHost('  '), null);
  assert.equal(neonBranchHost('postgres://u:p@localhost:5432/postgres'), null);
  assert.equal(neonBranchHost('127.0.0.1:5432'), null);
  assert.equal(
    describeBranchSplit({
      DATABASE_URL: 'postgres://u:p@localhost:5432/postgres',
      POSTGRES_URL: POOLED,
      ADMIN_DATABASE_URL: undefined,
    }),
    null,
  );
});

test('an entirely unconfigured environment is silent, not a false alarm', () => {
  assert.equal(describeBranchSplit({}), null);
});
