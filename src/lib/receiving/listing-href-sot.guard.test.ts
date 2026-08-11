/**
 * There is exactly ONE listing-href normalizer, and it is
 * `normalizeListingHref` (`@/lib/receiving/listing-href`).
 *
 * Four copies existed on 2026-08-10 — `listingUrlForOpen`
 * (receiving-sidebar-shared), `listingHref` (resolve-receiving-order-open-url),
 * `normalizeHref` (zoho-po-prefill), and the canonical one. Three predated the
 * canonical's non-http-scheme fix, so they REPAIRED a bad scheme instead of
 * rejecting it: `ftp://example.com/itm/123456` became
 * `https://ftp//example.com/itm/123456` — a URL that parses, passes a protocol
 * check, and renders an "Open listing" that leads nowhere. The fourth copy was
 * the worst placed: it normalized the `sync_notes` tier that
 * `collectCartonListingLinks` itself consumes, so the resolver disagreed with
 * its own other three inputs.
 *
 * knip cannot see this class of fork — every copy was imported, so every copy
 * was "used". Only a guard answers "is this the only one".
 *
 * Run: `npx tsx --test src/lib/receiving/listing-href-sot.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { normalizeListingHref } from '@/lib/receiving/listing-href';

const SRC = path.join(process.cwd(), 'src');

/** The canonical implementation, plus normalizers for a DIFFERENT domain. */
const ALLOWED = new Set([
  // The one implementation.
  'src/lib/receiving/listing-href.ts',
  // Markdown link hrefs in support message bodies — a different grammar on a
  // different surface (it does not parse with `new URL` at all). If it ever
  // needs hardening that is its own ruling, not this one.
  'src/lib/support/markdown.ts',
  // A URL BUILDER (`https://${subdomain}.zendesk.com/...`) that separately
  // passes an already-absolute ticket URL straight through. It normalizes
  // nothing; the two shapes just co-occur in one file.
  'src/lib/zendesk-ticket-url.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test('no second listing-href normalizer exists', () => {
  const offenders: string[] = [];

  for (const file of walk(SRC)) {
    const rel = path.relative(process.cwd(), file);
    if (ALLOWED.has(rel)) continue;
    const source = readFileSync(file, 'utf8');

    // The twin shape: test for an http(s) scheme, then prepend `https://` to
    // whatever failed the test. A plain URL BUILDER (`https://${host}/path`)
    // has no scheme test and is not matched.
    const prepends = source.includes('https://${');
    const testsScheme = /\/\^https\?:\\\/\\\/\/i\.test\(/.test(source);
    if (prepends && testsScheme) offenders.push(rel);
  }

  assert.deepEqual(
    offenders,
    [],
    `These files re-implement listing-href normalization. Import ` +
      `normalizeListingHref from '@/lib/receiving/listing-href' instead ` +
      `(re-exported from listing-links). If the file genuinely normalizes a ` +
      `different KIND of URL, add it to ALLOWED with a reason:\n  ` +
      offenders.join('\n  '),
  );
});

test('a non-http scheme is rejected, never repaired', () => {
  // The exact inputs the three deleted twins got wrong.
  assert.equal(normalizeListingHref('ftp://example.com/itm/123456'), null);
  assert.equal(normalizeListingHref('mailto:a@b.com'), null);
  assert.equal(normalizeListingHref('javascript:alert(1)'), null);
});

test('a bare host still gains https, and a port is not a scheme', () => {
  assert.equal(normalizeListingHref('www.ebay.com/itm/1'), 'https://www.ebay.com/itm/1');
  assert.equal(normalizeListingHref('example.com:8080/itm/1'), 'https://example.com:8080/itm/1');
  assert.equal(normalizeListingHref('  '), null);
  assert.equal(normalizeListingHref(null), null);
});
