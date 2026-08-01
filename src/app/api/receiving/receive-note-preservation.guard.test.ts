/**
 * Hard law: a RECEIVE may set the operator's item note, but must never CLEAR
 * one it was not given.
 *
 * `receiving_line.notes` is the operator's durable item note (see
 * `source-of-truth.md` → Note vs label grain — it stopped doubling as the
 * printed label face on 2026-07-31). Receive endpoints take an optional
 * `notes` field, and a caller that omits it means "I have nothing to say about
 * the note", not "erase it".
 *
 * This shipped broken: `mark-received` used a bare `SET notes = $1` while the
 * mobile QA sheet's Pass-all path passes `notes: null`
 * (`ReceivingQaActionSheet.tsx` → `markAllLines(targetLines, 'PASSED',
 * 'ACCEPT', null, …)`). So a phone-side pass silently erased whatever the
 * desktop operator had typed on the Unbox panel. The two sibling writers
 * — `receive-line.ts` and `lines/[id]/status` — already had it right, which is
 * exactly why a source guard is worth more than one more code comment: the
 * correct pattern was already present and got diverged from anyway.
 *
 * Clearing a note stays the notes composer's job (`PATCH
 * /api/receiving-lines`, which presence-checks the field).
 *
 * Run: `npx tsx --test src/app/api/receiving/receive-note-preservation.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

function abs(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

function sourceOf(relative: string): string {
  return readFileSync(abs(relative), 'utf8');
}

/** Strip comments so prose about the law can never satisfy the law. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Every `UPDATE receiving_line … SET …` statement's SET clause in a source
 * file. Returns the text between `SET` and the terminating `WHERE`/`RETURNING`.
 */
function receivingLineSetClauses(src: string): string[] {
  const out: string[] = [];
  const re = /UPDATE\s+receiving_line\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const tail = src.slice(m.index, m.index + 1200);
    const setAt = tail.search(/\bSET\b/);
    if (setAt === -1) continue;
    const after = tail.slice(setAt + 3);
    const endAt = after.search(/\bWHERE\b|\bRETURNING\b/);
    out.push(endAt === -1 ? after : after.slice(0, endAt));
  }
  return out;
}

/** Every .ts file under the receive-side trees. */
function receiveSideFiles(): string[] {
  const roots = [abs('.'), abs('../../../lib/receiving')];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

test('mark-received preserves a note it was not given', () => {
  const clauses = receivingLineSetClauses(code(sourceOf('./mark-received/route.ts')));
  assert.ok(clauses.length > 0, 'expected an UPDATE receiving_line in mark-received');
  for (const clause of clauses) {
    if (!/\bnotes\b/.test(clause)) continue;
    assert.match(
      clause,
      /notes\s*=\s*COALESCE\(/i,
      'mark-received must COALESCE notes — a bare assignment erases the operator note when the caller sends null',
    );
  }
});

test('the sibling receive writers keep their COALESCE', () => {
  // These two were already correct. Pinning them stops the fix from being
  // "corrected" in the wrong direction later.
  for (const rel of ['../../../lib/receiving/receive-line.ts', './lines/[id]/status/route.ts']) {
    const clauses = receivingLineSetClauses(code(sourceOf(rel)));
    const noteClauses = clauses.filter((c) => /\bnotes\b/.test(c));
    assert.ok(noteClauses.length > 0, `expected a notes write in ${rel}`);
    for (const clause of noteClauses) {
      assert.match(clause, /notes\s*=\s*COALESCE\(/i, `${rel} must COALESCE notes`);
    }
  }
});

test('NO receive-side writer assigns receiving_line.notes unconditionally', () => {
  // The sweep is the part that survives a new endpoint being added.
  const offenders: string[] = [];
  for (const file of receiveSideFiles()) {
    for (const clause of receivingLineSetClauses(code(readFileSync(file, 'utf8')))) {
      if (!/\bnotes\b/.test(clause)) continue;
      if (!/notes\s*=\s*COALESCE\(/i.test(clause)) {
        offenders.push(file.replace(/^.*\/src\//, 'src/'));
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'these receive-side writers assign receiving_line.notes unconditionally and will erase the operator note',
  );
});
