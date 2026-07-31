/**
 * Hard law: an Unbox scan that lands on ALREADY-UNBOXED work must never claim
 * that work — not on any rung, not on any branch.
 *
 * The pure classifier (`unbox-scan-kind.test.ts`) and the server helper
 * (`unbox-lookup-scan.test.ts`) are unit-covered. What neither can see is the
 * WIRING: whether every route branch actually asks the question before it
 * stamps. That gap is not theoretical — `stampUnboxOpened` shipped with
 * `scanKind` defaulting to `'work'` while only 2 of its 6 call sites passed
 * one, so the 4 sites that can resolve a PRE-EXISTING carton
 * (`upsertMatchedReceiving`, `createOrGetTestReceiving`, the promoted-in-place
 * matched branch, and the preassigned unfound re-scan) silently re-attributed
 * an inspection as work. A defaulted parameter is what hid it.
 *
 * Source guard — cheaper than standing up both routes with a live pool, and it
 * pins the exact shape a future edit would regress.
 *
 * Run: `node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        src/app/api/receiving/lookup-scan-wiring.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Strip comments so prose about a call can never satisfy a guard. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const LOOKUP_PO = code(sourceOf('./lookup-po/route.ts'));
const TOUCH_SCAN = code(sourceOf('./touch-scan/route.ts'));

/**
 * Top-level arguments of every CALL to `name(` (the `const name = ...`
 * declaration is skipped). Depth- and quote-aware, so nested calls and their
 * commas do not split an argument.
 */
function callArguments(src: string, name: string): string[][] {
  const calls: string[][] = [];
  const needle = `${name}(`;
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at === -1) break;
    from = at + needle.length;

    const before = src.slice(Math.max(0, at - 40), at);
    if (/(?:const|let|var|function)\s+$/.test(before)) continue; // the declaration

    let depth = 1;
    let quote: string | null = null;
    let current = '';
    const args: string[] = [];
    for (let i = from; i < src.length && depth > 0; i += 1) {
      const ch = src[i];
      if (quote) {
        if (ch === quote && src[i - 1] !== '\\') quote = null;
        current += ch;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{') depth += 1;
      else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;

      if (depth === 0) break;
      if (ch === ',' && depth === 1) {
        args.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    if (current.trim()) args.push(current.trim());
    calls.push(args);
  }
  return calls;
}

test('lookup-po: stampUnboxOpened takes a REQUIRED scanKind (no silent work default)', () => {
  assert.match(
    LOOKUP_PO,
    /const stampUnboxOpened = async \(([\s\S]*?)\) =>/,
    'stampUnboxOpened declaration not found — did it move or get renamed?',
  );
  const decl = /const stampUnboxOpened = async \(([\s\S]*?)\) =>/.exec(LOOKUP_PO)![1];

  assert.ok(/scanKind\s*:\s*UnboxScanKind/.test(decl), 'scanKind param is gone');
  assert.equal(
    /scanKind\s*:\s*UnboxScanKind\s*=/.test(decl),
    false,
    'scanKind must NOT have a default — a default silently re-attributes an inspection as work at any call site that forgets it',
  );
});

test('lookup-po: every stampUnboxOpened call site passes an explicit scanKind', () => {
  const calls = callArguments(LOOKUP_PO, 'stampUnboxOpened');
  assert.ok(calls.length >= 6, `expected the known call sites, found ${calls.length}`);
  for (const [i, args] of calls.entries()) {
    assert.equal(
      args.length,
      4,
      `stampUnboxOpened call #${i + 1} passes ${args.length} args (${args.join(' | ')}) — the 4th (scanKind) is mandatory`,
    );
  }
});

test('lookup-po: pre-existing-carton branches classify before stamping', () => {
  // The two shapes that answer "did I just create this carton?".
  assert.ok(
    LOOKUP_PO.includes('scanKindForMaybeExisting'),
    'the get-or-create sites must route through scanKindForMaybeExisting',
  );
  assert.ok(
    /const scanKindForMaybeExisting = \([\s\S]*?preexisting \? scanKindFor\(receivingId\) : Promise\.resolve\('work'\)/.test(
      LOOKUP_PO,
    ),
    'scanKindForMaybeExisting must read the milestone ONLY for a pre-existing carton',
  );

  // Every site that can resolve a carton it did not create must pass a resolved
  // kind, never a bare 'work'.
  const resolvedArgs = callArguments(LOOKUP_PO, 'stampUnboxOpened')
    .map((a) => a[3])
    .filter(Boolean);
  const literalWork = resolvedArgs.filter((a) => /^'work'$/.test(a));
  assert.equal(
    literalWork.length,
    0,
    `a hardcoded 'work' scanKind reintroduces the defect at ${literalWork.length} site(s)`,
  );
});

test('lookup-po: the attribution write is classified wherever the carton pre-exists', () => {
  // `stampUnboxOpened` only governs the ops EVENT. The attribution overwrite —
  // the actual defect — happens in `recordReceivingScan`, so every path that
  // can reach an existing carton has to classify that write too, with the SAME
  // verdict it gives the stamp.
  //
  // `memoizeLookupHit` is the earliest and most important: `findScanByTracking`
  // calls it the moment it resolves an existing carton, BEFORE any branch runs,
  // so a downstream-only fix leaves the overwrite fully intact.
  const memoize = /async function memoizeLookupHit\([\s\S]*?\n\}/.exec(LOOKUP_PO);
  assert.ok(memoize, 'memoizeLookupHit not found');
  assert.ok(
    /resolveUnboxScanKind\(/.test(memoize[0]),
    'memoizeLookupHit must classify — it is the first write on every existing-carton resolution',
  );
  assert.ok(/scanKind/.test(memoize[0]), 'memoizeLookupHit must forward scanKind');

  // The shared wrapper must be able to carry a verdict at all.
  const wrapper = /async function recordScan\(([\s\S]*?)\): Promise<number> \{([\s\S]*?)\n\}/.exec(LOOKUP_PO);
  assert.ok(wrapper, 'recordScan wrapper not found');
  assert.ok(/scanKind/.test(wrapper[1]), 'recordScan must accept a scanKind');
  assert.ok(/scanKind,?/.test(wrapper[2]), 'recordScan must forward scanKind to recordReceivingScan');

  // Every in-handler recordScan call passes scanKind (7th). An optional 8th
  // `registerTracking` is allowed on the ORDER# path so a pure PO-number match
  // never fabricates a shipment tracking entry.
  for (const [i, args] of callArguments(LOOKUP_PO, 'recordScan').entries()) {
    assert.ok(
      args.length === 7 || args.length === 8,
      `recordScan call #${i + 1} passes ${args.length} args (${args.join(' | ')}) — expect 7 (scanKind) or 8 (+ registerTracking)`,
    );
  }

  // The two direct calls in the handler body keep BOTH options. intakeSurface
  // is load-bearing too: `recordReceivingScan` defaults it to 'triage', so
  // dropping it silently records every Unbox scan as a door scan and the
  // Unboxed rail stops being written at all.
  const direct = callArguments(LOOKUP_PO, 'recordReceivingScan').filter((a) => a.length === 6);
  assert.ok(direct.length >= 2, `expected the ticket + dedup direct calls, found ${direct.length}`);
  for (const [i, args] of direct.entries()) {
    assert.ok(/intakeSurface/.test(args[5]), `direct recordReceivingScan #${i + 1} lost intakeSurface`);
    assert.ok(/scanKind/.test(args[5]), `direct recordReceivingScan #${i + 1} lost scanKind`);
  }
});

test('lookup-po: every carton-opening response carries the lookup verdict', () => {
  // The write half being correct is not enough — the PANE decides between the
  // read-only receipt and the work editor from the response. lookup-po posts no
  // touch-scan (it stamped server-side), so its response is the ONLY signal the
  // client gets; without these fields a lookup is recorded correctly and then
  // hands the operator the editor anyway.
  assert.ok(
    /const lookupResponseFields = \(\) =>[\s\S]*?scan_kind: 'lookup' as const/.test(LOOKUP_PO),
    'lookupResponseFields must emit scan_kind: lookup',
  );
  for (const field of ['unboxed_at', 'unboxed_by_name', 'po_number']) {
    assert.ok(
      new RegExp(`lookupResponseFields = \\(\\) =>[\\s\\S]*?${field}:`).test(LOOKUP_PO),
      `lookupResponseFields must carry ${field} — the receipt renders it`,
    );
  }

  // Absent (not `scan_kind: 'work'`) on a work scan: the client tests for the
  // literal 'lookup', so an always-present field would have to lie.
  assert.ok(
    /lookupScanState[\s\S]{0,400}?: \{\}/.test(LOOKUP_PO),
    'lookupResponseFields must return {} when the scan was work',
  );

  // Each response that OPENS a carton spreads it. The `not_found` responses
  // open nothing, so they are correctly excluded.
  const openingResponses = LOOKUP_PO.split('return NextResponse.json({')
    .slice(1)
    .filter((body) => /^[\s\S]{0,400}?receiving_id:/.test(body));
  assert.ok(openingResponses.length >= 6, `expected ≥6 carton-opening responses, found ${openingResponses.length}`);
  for (const [i, body] of openingResponses.entries()) {
    assert.ok(
      /^[\s\S]{0,400}?\.\.\.lookupResponseFields\(\)/.test(body),
      `carton-opening response #${i + 1} does not spread lookupResponseFields() — a lookup through this branch shows the work editor`,
    );
  }
});

test('touch-scan: reads the completion milestone org-scoped, via LEFT JOIN', () => {
  assert.ok(/ru\.unboxed_at/.test(TOUCH_SCAN), 'touch-scan must read receiving_unbox.unboxed_at');
  assert.ok(
    /LEFT JOIN\s+receiving_unbox ru/.test(TOUCH_SCAN),
    'must be a LEFT JOIN — a carton with no street row has never been unboxed and reads as work',
  );
  assert.ok(
    /ru\.organization_id = rc\.organization_id/.test(TOUCH_SCAN),
    'the join must be org-scoped',
  );
  assert.ok(
    /classifyScanKind\(intakeSurface,\s*\{\s*unboxedAt: row\.unboxed_at\s*\}\)/.test(TOUCH_SCAN),
    'classification must go through the shared classifier, not a local re-derivation',
  );
});

test('touch-scan: a lookup writes ONLY the append-only event, then returns', () => {
  const branch = /if \(scanKind === 'lookup'\) \{([\s\S]*?)\n {4}\}/.exec(TOUCH_SCAN);
  assert.ok(branch, "the `if (scanKind === 'lookup')` branch was not found");
  const body = branch[1];

  assert.ok(/recordUnboxLookupScan\(/.test(body), 'a lookup must record the RECEIVING_LOOKUP_SCAN event');
  assert.equal(
    /recordReceivingScan\(/.test(body),
    false,
    'a lookup must NOT upsert receiving_scans — that is the attribution overwrite this fixes',
  );
  assert.equal(
    /recordUnboxScanOpened\(/.test(body),
    false,
    'a lookup must NOT fire UNBOX_SCAN_OPENED — that is a work event',
  );
  assert.ok(/return NextResponse\.json\(/.test(body), 'the lookup branch must return before the work path');
  assert.ok(
    /scan_kind:\s*'lookup'/.test(body),
    'the response must tell the client it was a lookup so the pane can show the receipt',
  );
  // The receipt names the unboxer and offers a PO search jump; both are
  // resolved server-side because the workspace row is often still hydrating
  // when the card paints.
  assert.ok(/unboxed_by_name/.test(body), 'the lookup response must name who unboxed it');
  assert.ok(/po_number/.test(body), 'the lookup response must carry the PO for the details jump');
});
