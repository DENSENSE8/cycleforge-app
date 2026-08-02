/**
 * Guard: the org-settings route is the ONE place a tenant's GS1 identity and
 * compliance answers are written, and it must refuse what the rest of the app
 * refuses.
 *
 * Two failure modes this pins, both of which produce a *silently wrong* system
 * rather than an error:
 *
 *   • **A second validator.** `gs1-keys.ts` already decides what a licensed key
 *     is — placeholder prefixes, GLN length, GS1 check digit. If this route
 *     hand-rolled its own regex it would accept values `resolveGs1Identity`
 *     later drops, so the admin would see a saved prefix the product never
 *     uses and no error anywhere. The route must compose the SoT predicates.
 *
 *   • **A client-stamped `answeredAt`.** That field is what the onboarding step
 *     derives completion from. Reading it from the request body lets a client
 *     mark itself onboarded without answering anything.
 *
 * Plan: docs/todo/gs1-compliance-onboarding-PLAN.md
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/app/api/admin/organization/settings/gs1-compliance.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isLicensedGln, isPlaceholderGs1Prefix } from '@/lib/interop/gs1-keys';

const ROUTE = readFileSync(
  join(process.cwd(), 'src/app/api/admin/organization/settings/route.ts'),
  'utf8',
);

test('the route validates GS1 values through the gs1-keys SoT, not a local regex', () => {
  assert.match(
    ROUTE,
    /from '@\/lib\/interop\/gs1-keys'/,
    'must import the GS1 refusal SoT',
  );
  assert.match(ROUTE, /isPlaceholderGs1Prefix\(/, 'companyPrefix must be checked for example prefixes');
  assert.match(ROUTE, /isLicensedGln\(/, 'gln must go through the licensed-GLN predicate');
});

test('GET exposes the raw values AND the resolved verdict', () => {
  // Raw so the admin sees what they typed; resolved so the UI can say "we are
  // not using this" instead of the form blanking the field on its own.
  assert.match(ROUTE, /getGs1SettingsRaw\(/);
  assert.match(ROUTE, /getComplianceAnswers\(/);
  assert.match(ROUTE, /gs1Requirement:\s*resolveGs1Requirement\(/);
});

test('answeredAt is stamped server-side and never read from the body', () => {
  assert.match(
    ROUTE,
    /next\.answeredAt\s*=\s*answered\s*\?\s*next\.answeredAt\s*\|\|\s*new Date\(\)\.toISOString\(\)/,
    'answeredAt must be derived from the answers + stamped here',
  );
  assert.doesNotMatch(
    ROUTE,
    /r\.answeredAt|body[^\n]*answeredAt/,
    'answeredAt must never be taken from the request body',
  );
});

test('compliance booleans accept null — unanswered must stay distinguishable', () => {
  // A `Boolean(r[key])` coercion here would turn "not answered" into "answered
  // no" and silently complete the onboarding step for a tenant who never saw it.
  assert.match(
    ROUTE,
    /must be a boolean or null/,
    'the validator must admit null explicitly',
  );
  assert.doesNotMatch(
    ROUTE,
    /hasNewInventory:\s*Boolean\(|sellsOnAmazon:\s*Boolean\(/,
    'never coerce the answers to a boolean',
  );
});

// ─── The predicates the route leans on actually behave as claimed ───────────

test('the SoT refuses exactly what the route messages promise', () => {
  // GS1's documentation prefix — the value this whole lane exists because of.
  assert.equal(isPlaceholderGs1Prefix('0614141'), true);
  assert.equal(isPlaceholderGs1Prefix('0812345'), false, 'a licensed-shaped prefix passes');

  assert.equal(isLicensedGln('0812345000009'), true);
  assert.equal(isLicensedGln('0614141000005'), false, 'placeholder GLN refused');
  assert.equal(isLicensedGln('081234500000'), false, '12 digits is not a GLN');
  assert.equal(isLicensedGln('0812345000008'), false, 'bad check digit refused');
});
