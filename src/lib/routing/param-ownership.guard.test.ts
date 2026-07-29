/**
 * Guards rule 3 of the isolation contract — **a param is owned by exactly one
 * route** — and ratchets down the raw `searchParams.get()` reads that bypass a
 * spec entirely.
 *
 * This is the enforcement that the old denylists never had. `MODE_SCOPED_PARAMS`
 * was a list someone had to remember to extend; every param added to a receiving
 * surface between the last edit and the next bug was a silent leak. Here, a new
 * param that no spec declares fails the build.
 *
 * Both allowlists below **only shrink** — same ratchet discipline as the DS
 * guards in `npm run verify`. Never add an entry to land a change.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

import {
  AMBIENT_PARAMS,
  SHARED_OWNED_KEYS,
  declaredKeys,
} from './route-params';
import { RECEIVING_ROUTE_PARAMS } from './receiving-routes';
import { OUTBOUND_ROUTE_PARAMS } from './outbound-routes';

const SRC_ROOT = join(process.cwd(), 'src');

/** Every migrated family the guard governs. */
const ALL_SPECS = [...RECEIVING_ROUTE_PARAMS, ...OUTBOUND_ROUTE_PARAMS];

/** The receiving surface tree — where a receiving param may legitimately be read. */
const OWNED_TREES = [
  'components/receiving',
  'components/sidebar/receiving',
  'app/unbox',
  'app/triage',
  'app/incoming',
  'app/pickup',
  'app/repair',
  'app/receiving',
  'components/outbound',
  'components/fba',
  'app/shipping',
];

/**
 * Params read in the receiving tree that no spec declares. **Shrink only.**
 *
 * `mode` — the legacy `?mode=` shell on bare `/receiving`. Every read here is a
 * `?? 'receive'` fallback, and a graduated route drops the param at the boundary
 * so those reads already see `null`. Dies with the `/receiving` sunset (Slice 4).
 */
const UNDECLARED_READS: Readonly<Record<string, string>> = {
  mode: 'Legacy /receiving ?mode= shell — reads are all `?? receive` fallbacks; dies at the /receiving sunset (Slice 4).',
};

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

/** Every `.get('key')` read in a file, whatever the receiver is named. */
const GET_CALL = /\.get\('([a-zA-Z_][a-zA-Z0-9_]*)'\)/g;

test('rule 3 — a param is owned by exactly one route', () => {
  const owners = new Map<string, string[]>();
  for (const spec of ALL_SPECS) {
    for (const key of Object.keys(spec.owns)) {
      owners.set(key, [...(owners.get(key) ?? []), spec.route]);
    }
  }

  const undeclaredCollisions = [...owners.entries()]
    .filter(([key, routes]) => routes.length > 1 && !(key in SHARED_OWNED_KEYS))
    .map(([key, routes]) => `?${key}= is owned by ${routes.join(' and ')}`);

  assert.deepEqual(
    undeclaredCollisions,
    [],
    'Two routes own the same param. Either give one of them its own key, or ' +
      'declare the sharing in SHARED_OWNED_KEYS with the reason it is one question.',
  );
});

test('SHARED_OWNED_KEYS only lists keys that are actually shared (it shrinks)', () => {
  const shareCount = new Map<string, number>();
  for (const spec of ALL_SPECS) {
    for (const key of Object.keys(spec.owns)) {
      shareCount.set(key, (shareCount.get(key) ?? 0) + 1);
    }
  }
  const stale = Object.keys(SHARED_OWNED_KEYS).filter((key) => (shareCount.get(key) ?? 0) < 2);
  assert.deepEqual(
    stale,
    [],
    'These keys no longer have two owners — drop them from SHARED_OWNED_KEYS.',
  );
});

test('an owned param never shadows an ambient one', () => {
  const shadowed: string[] = [];
  for (const spec of ALL_SPECS) {
    for (const key of Object.keys(spec.owns)) {
      if (key in AMBIENT_PARAMS) shadowed.push(`${spec.route} owns ambient ?${key}=`);
    }
  }
  assert.deepEqual(
    shadowed,
    [],
    'Ambient params are owned by AMBIENT_PARAMS. Carry them, do not re-own them.',
  );
});

test('every receiving route declares at least one param and a unique route', () => {
  const routes = ALL_SPECS.map((spec) => spec.route);
  assert.equal(new Set(routes).size, routes.length, 'Two specs claim the same route.');
  for (const spec of ALL_SPECS) {
    assert.ok(
      declaredKeys(spec).length > 0,
      `${spec.route} declares no params — delete the spec or declare what it owns.`,
    );
  }
});

test('no raw param read in the receiving tree bypasses a spec', () => {
  const declared = new Set<string>([
    ...ALL_SPECS.flatMap((spec) => Object.keys(spec.owns)),
    ...Object.keys(AMBIENT_PARAMS),
  ]);

  const offenders: string[] = [];
  const seenUndeclared = new Set<string>();

  for (const dir of OWNED_TREES) {
    for (const file of walk(join(SRC_ROOT, dir))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(GET_CALL)) {
        const key = match[1]!;
        if (declared.has(key)) continue;
        if (key in UNDECLARED_READS) {
          seenUndeclared.add(key);
          continue;
        }
        offenders.push(`${relative(SRC_ROOT, file)} reads ?${key}=`);
      }
    }
  }

  assert.deepEqual(
    [...new Set(offenders)].sort(),
    [],
    'A receiving surface reads a URL param no route spec declares. Declare it in ' +
      'src/lib/routing/receiving-routes.ts so it survives the boundary parse — ' +
      'an undeclared param is dropped on arrival and will read as null.',
  );

  const stale = Object.keys(UNDECLARED_READS).filter((key) => !seenUndeclared.has(key));
  assert.deepEqual(stale, [], 'These UNDECLARED_READS entries are gone — delete them.');
});
