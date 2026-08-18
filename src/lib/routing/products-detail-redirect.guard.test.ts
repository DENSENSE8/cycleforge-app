/**
 * Guards the `/products/:sku` → `/products/sku/:sku` redirect by COMPILING it,
 * not by reading its source.
 *
 * `/products` will grow static view segments (`/products/qc`, `/products/kit`,
 * …). Static beats dynamic in Next.js, so those pages win the route match — but
 * the REDIRECT runs first, and a redirect whose negative lookahead has not
 * learned about a new segment bounces `/products/qc` to `/products/sku/qc`
 * before the page can ever render. The symptom is a view that 404s as a missing
 * SKU, which reads as a data problem rather than a routing one.
 *
 * Checking the lookahead LIST is not enough, and that is the whole reason this
 * file compiles the pattern: the first draft listed `sku$`, which looked correct
 * and passed a list check, while `/products/sku/CABLE-001` — the redirect's own
 * destination — still matched and rewrote to `/products/sku/sku/CABLE-001` on
 * every hop. Only running the regex over real paths shows that.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { PRODUCTS_VIEWS } from '@/components/products/products-view';

const CONFIG = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');

/**
 * The custom pattern inside `/products/:sku(…)`.
 *
 * `path-to-regexp` is only a transitive Next dependency (not hoisted under
 * pnpm), so rather than take a direct dep for one guard we compile the custom
 * group ourselves. That group is the entire mechanism — path-to-regexp does
 * nothing here but anchor it after the literal `/products/`.
 */
function redirectSkuPattern(): string {
  const match = /source:\s*'\/products\/:sku\((.*)\)',/.exec(CONFIG);
  assert.ok(
    match,
    'The /products/:sku redirect is gone from next.config.ts. If the bare ' +
      'dynamic path was retired on purpose, delete this guard in the same change.',
  );
  return match[1]!;
}

/** True when Next would rewrite `pathname` to the namespaced detail route. */
function redirects(pathname: string): boolean {
  return new RegExp(`^/products/(?:${redirectSkuPattern()})$`).test(pathname);
}

test('a real SKU still reaches the detail page', () => {
  assert.equal(redirects('/products/CABLE-001'), true);
  // A slash inside the SKU arrives percent-encoded and must still match.
  assert.equal(redirects('/products/WEIRD%2FSKU'), true);
});

test('the redirect never matches its own destination', () => {
  // The loop the `sku$` draft shipped: every hop prepended another `sku/`.
  assert.equal(
    redirects('/products/sku/CABLE-001'),
    false,
    'The detail route redirects to itself — this is an infinite redirect, and ' +
      'the product page is unreachable. Terminate the `sku` alternative with ' +
      '`(?:$|/)`, not `$`.',
  );
  assert.equal(redirects('/products/sku/WEIRD%2FSKU'), false);
  assert.equal(redirects('/products/sku'), false);
});

test('every static view segment is exempt, now and when one grows a child', () => {
  const swallowed = PRODUCTS_VIEWS.filter((view) => redirects(`/products/${view}`));
  assert.deepEqual(
    swallowed,
    [],
    `These /products views would bounce to /products/sku/<view> instead of ` +
      `rendering: ${swallowed.join(', ')}. Add them to the negative lookahead ` +
      'in next.config.ts.',
  );

  const nestedSwallowed = PRODUCTS_VIEWS.filter((view) => redirects(`/products/${view}/anything`));
  assert.deepEqual(
    nestedSwallowed,
    [],
    'A nested view child is being redirected. The lookahead alternatives must ' +
      'end with `(?:$|/)` so they exempt the whole sub-tree.',
  );
});

test('the products index itself is untouched', () => {
  assert.equal(redirects('/products'), false);
});

test('the redirect stays a 307 until the D3 sunset', () => {
  const rule =
    /source:\s*'\/products\/:sku\([^']*',\s*\n?\s*destination:\s*'\/products\/sku\/:sku',\s*\n?\s*permanent:\s*(true|false)/.exec(
      CONFIG,
    );
  assert.ok(rule, 'Could not read the permanence of the /products detail redirect.');
  assert.equal(
    rule[1],
    'false',
    'A 308 is cached by browsers permanently and cannot be withdrawn. Flip this ' +
      'only at the D3 sunset, together with the other redirects — not on its own.',
  );
});
