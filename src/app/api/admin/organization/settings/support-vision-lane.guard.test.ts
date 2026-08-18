/**
 * Guard: the org-settings route is the ONE place a tenant writes
 * `settings.support.visionLane`, and it must not invent a second resolver.
 *
 * Two failure modes this pins:
 *
 *   • **A second precedence answer.** `resolveSupportVisionLane` already decides
 *     org → env → local-only and the cloudAvailable downgrade. If this route
 *     returned a "resolved" lane, or the card re-implemented that ladder, the
 *     operator would see a different truth than Assist reports.
 *
 *   • **Clobbering sibling keys.** jsonb `||` replaces the whole `support`
 *     object — a visionLane-only PATCH that does not merge over the current
 *     block would wipe `vertical` (reply-persona framing).
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/app/api/admin/organization/settings/support-vision-lane.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = readFileSync(
  join(process.cwd(), 'src/app/api/admin/organization/settings/route.ts'),
  'utf8',
);
const CARD = readFileSync(
  join(process.cwd(), 'src/components/settings/sections/SupportVisionLaneCard.tsx'),
  'utf8',
);

test('PATCH merges support over the current block (does not clobber vertical)', () => {
  assert.match(ROUTE, /getSupportSettings\(/);
  assert.match(
    ROUTE,
    /replaces the whole `support` key/,
    'the merge comment must stay — it is the reason the merge exists',
  );
  assert.match(ROUTE, /const next: Record<string, unknown> = \{ \.\.\.current \}/);
});

test('visionLane is normalized through the SoT, never a local string compare', () => {
  assert.match(ROUTE, /from '@\/lib\/support\/vision-lane'/);
  assert.match(ROUTE, /normalizeVisionLane\(/);
  assert.doesNotMatch(
    ROUTE,
    /resolveSupportVisionLane\s*\(|resolveSupportVisionLaneForOrg\s*\(/,
    'the route stores the request; it must not resolve the lane',
  );
});

test('GET exposes the raw org request, never a resolved lane', () => {
  assert.match(ROUTE, /visionLane: support\.visionLane \?\? null/);
  // Executable calls only — comments may name the resolver as the SoT.
  assert.doesNotMatch(
    ROUTE,
    /resolveSupportVisionLane\s*\(|resolveSupportVisionLaneForOrg\s*\(/,
    'GET must not compute the effective lane',
  );
});

test('the settings card does not re-implement org→env precedence', () => {
  assert.doesNotMatch(
    CARD,
    /resolveSupportVisionLane\s*\(|process\.env\.SUPPORT_VISION_LANE/,
    'the card stores a request; the resolver alone decides what ran',
  );
  assert.match(CARD, /visionLane: draft === 'inherit' \? null : draft/);
});
