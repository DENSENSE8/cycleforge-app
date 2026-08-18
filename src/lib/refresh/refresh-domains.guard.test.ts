/**
 * Guards the refresh bus.
 *
 * The failure this prevents is the one `app-refresh-data` embodied: a signal
 * nobody listens to (a write that silently leaves a pane stale) or a listener
 * nobody signals (a pane that never updates). Both are invisible at runtime —
 * the UI just looks a little wrong, later, on someone else's screen.
 *
 * Also pins the retirement: the two legacy broadcast names must not come back.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import { REFRESH_BUNDLES, REFRESH_DOMAINS, type RefreshDomain } from './domains';

const SRC_ROOT = join(process.cwd(), 'src');

/** The broadcasts this bus replaced. Neither may reappear. */
const RETIRED_EVENTS = ['app-refresh-data', 'dashboard-refresh'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = walk(SRC_ROOT).map((file) => ({
  path: relative(SRC_ROOT, file),
  text: readFileSync(file, 'utf8'),
}));

/** Domain literals passed to `fn(...)`, across every source file. */
function domainsPassedTo(fn: 'refreshDomain' | 'refreshDomains' | 'useRefreshSignal'): Set<string> {
  const found = new Set<string>();
  // Matches the call and its first argument up to the closing paren/bracket —
  // enough to pull the quoted domain literals out of either form.
  const call = new RegExp(`\\b${fn}\\(([^;]*?)\\)`, 'gs');
  for (const { path, text } of SOURCES) {
    if (path.startsWith('lib/refresh/')) continue; // the bus itself
    for (const match of text.matchAll(call)) {
      // Match the KNOWN domains rather than a shape regex — a shape regex that
      // forgot camelCase silently dropped `receiving.poLines` and reported it
      // as an orphan.
      for (const domain of REFRESH_DOMAINS) {
        if (match[1]!.includes(`'${domain}'`)) found.add(domain);
      }
    }
  }
  return found;
}

/** Domains reached indirectly through a `REFRESH_BUNDLES.*` reference. */
function domainsViaBundles(fn: string): Set<string> {
  const found = new Set<string>();
  const call = new RegExp(`\\b${fn}\\(REFRESH_BUNDLES\\.(\\w+)`, 'g');
  for (const { path, text } of SOURCES) {
    if (path.startsWith('lib/refresh/')) continue;
    for (const match of text.matchAll(call)) {
      const bundle = REFRESH_BUNDLES[match[1] as keyof typeof REFRESH_BUNDLES];
      for (const domain of bundle ?? []) found.add(domain);
    }
  }
  return found;
}

test('every domain has at least one emitter', () => {
  const emitted = new Set<string>([
    ...domainsPassedTo('refreshDomain'),
    ...domainsPassedTo('refreshDomains'),
    ...domainsViaBundles('refreshDomain'),
    ...domainsViaBundles('refreshDomains'),
  ]);
  const orphans = REFRESH_DOMAINS.filter((domain) => !emitted.has(domain));
  assert.deepEqual(
    orphans,
    [],
    'These domains are listened to but nothing signals them — either wire the ' +
      'write that should, or delete the domain.',
  );
});

test('every domain has at least one listener', () => {
  const heard = domainsPassedTo('useRefreshSignal');
  const orphans = REFRESH_DOMAINS.filter((domain) => !heard.has(domain));
  assert.deepEqual(
    orphans,
    [],
    'These domains are signalled but nobody listens — the emit is dead code. ' +
      'Either subscribe the pane that should refresh, or drop the domain.',
  );
});

test('no call passes a string that is not a real domain', () => {
  const known = new Set<string>(REFRESH_DOMAINS);
  const offenders: string[] = [];
  const call = /\b(?:refreshDomain|refreshDomains|useRefreshSignal)\(([^)]*)/gs;
  for (const { path, text } of SOURCES) {
    if (path.startsWith('lib/refresh/')) continue;
    for (const match of text.matchAll(call)) {
      for (const literal of match[1]!.matchAll(/'([^']+)'/g)) {
        if (!known.has(literal[1]!)) offenders.push(`${path} passes '${literal[1]}'`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'Unknown refresh domain(s) referenced.');
});

test('the retired broadcasts do not come back', () => {
  const offenders: string[] = [];
  for (const { path, text } of SOURCES) {
    if (path.startsWith('lib/refresh/')) continue;
    for (const name of RETIRED_EVENTS) {
      if (text.includes(`'${name}'`)) offenders.push(`${path} references '${name}'`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'app-refresh-data / dashboard-refresh are retired. Signal the domains the ' +
      'write actually touched via refreshDomains() instead.',
  );
});

test('every bundle names only real domains and is not the whole set', () => {
  const known = new Set<RefreshDomain>(REFRESH_DOMAINS);
  for (const [name, domains] of Object.entries(REFRESH_BUNDLES)) {
    assert.ok(domains.length > 0, `bundle ${name} is empty`);
    for (const domain of domains) {
      assert.ok(known.has(domain), `bundle ${name} names unknown domain ${domain}`);
    }
    assert.notEqual(
      domains.length,
      REFRESH_DOMAINS.length,
      `bundle ${name} covers every domain — that is the broadcast this replaced.`,
    );
    assert.equal(new Set(domains).size, domains.length, `bundle ${name} repeats a domain`);
  }
});
