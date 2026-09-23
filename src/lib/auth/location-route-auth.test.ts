import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function routeSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('location collection reads and creates through explicit permission wrappers', () => {
  const source = routeSource('src/app/api/locations/route.ts');
  assert.match(source, /export const GET = withAuth/);
  assert.match(source, /permission: 'sku_stock\.view'/);
  assert.match(source, /export const POST = withAuth/);
  assert.match(source, /permission: 'sku_stock\.manage'/);
  assert.doesNotMatch(source, /AnonymousAuthContext|resolveCtx|orgId stays undefined/);
});

test('dynamic location handlers require a session-derived tenant', () => {
  const source = routeSource('src/app/api/locations/[barcode]/route.ts');
  assert.match(source, /requireRoutePerm\(req, 'sku_stock\.view'\)/);
  assert.match(source, /requireRoutePerm\(request, 'sku_stock\.view'\)/);
  assert.match(source, /assertPermission\(ctx\.staffId, requiredPerm\)/);
  assert.doesNotMatch(source, /DOGFOOD_ORG_ID|ctx\.organizationId \?\?/);
});

test('bin swap uses the signed-in actor, never a body-supplied staff id', () => {
  const source = routeSource('src/app/api/locations/[barcode]/swap/route.ts');
  assert.match(source, /requireRoutePerm\(request, 'bin\.swap'\)/);
  assert.match(source, /const staffId = ctx\.staffId/);
  assert.doesNotMatch(source, /body\?\.staffId|DOGFOOD_ORG_ID|resolveCtx/);
});

test('dynamic route permissions enforce destructive step-up grants', () => {
  const source = routeSource('src/lib/auth/dynamic-route-guard.ts');
  assert.match(source, /requiresStepUp\(perm\)/);
  assert.match(source, /hasStepUp\(user\.session\.sid, perm\)/);
  assert.match(source, /STEPUP_REQUIRED/);
});
