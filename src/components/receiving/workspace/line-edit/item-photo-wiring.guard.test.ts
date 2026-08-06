/**
 * Hard law: a photo's EVIDENCE STAGE is threaded explicitly at every mount, and
 * item scope is never half-wired.
 *
 *   arrival_package — the pre-opening insurance shot, taken at the door/Triage.
 *                     `require_one` counts ONLY this stage (`photo-policy.ts`),
 *                     so a bench capture stamping it would satisfy the receive
 *                     gate with a post-opening photo and void the control.
 *   unbox_carton    — the bench's own carton capture (packing material folds here).
 *   unbox_item      — RECEIVING_LINE + `receiving_item`. Requires a line id.
 *
 * Two failure modes this guard exists for, both of which have already happened:
 *
 *  1. **A defaulted safety classification.** `.claude/rules/backend-patterns.md`
 *     — a parameter that decides what a write may CLAIM gets no default, because
 *     a default is a silent opt-out taken by every call site nobody visited.
 *  2. **A documented mode with no call site.** `ReceivingPhotoButton` shipped an
 *     `unbox_item` mode in its docblock that nothing mounted, so the desktop had
 *     no item-evidence surface at all while the code read as though it did. That
 *     is invisible to a behavioral test — there is no surface to drive.
 *
 * Why a SOURCE guard: this is prop wiring across lanes. The regression shape is
 * one identifier dropped from one JSX mount, which typechecks (the props are
 * optional by necessity — carton scope must not pass a line id).
 *
 * Run: `npx tsx --test src/components/receiving/workspace/line-edit/item-photo-wiring.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../../../', import.meta.url));

/** Strip comments so prose ABOUT the law can never satisfy the law. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/**
 * Every `<ReceivingPhotoButton …/>` mount's attribute text, brace-depth aware so
 * a nested expression's `>` cannot truncate the element early.
 */
function mountsIn(src: string): string[] {
  const found: string[] = [];
  const needle = '<ReceivingPhotoButton';
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at === -1) return found;
    let i = at + needle.length;
    let depth = 0;
    for (; i < src.length; i += 1) {
      const ch = src[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) break;
    }
    found.push(src.slice(at + needle.length, i));
    from = i;
  }
}

interface Mount {
  file: string;
  attrs: string;
}

const MOUNTS: Mount[] = walk(SRC)
  .filter((f) => !f.endsWith('ReceivingPhotoButton.tsx'))
  .flatMap((file) =>
    mountsIn(code(readFileSync(file, 'utf8'))).map((attrs) => ({
      file: file.slice(SRC.length),
      attrs,
    })),
  );

const has = (m: Mount, attr: string) => new RegExp(`\\b${attr}\\s*=`).test(m.attrs);
const itemScope = (m: Mount) => /photoStage\s*=\s*["']unbox_item["']/.test(m.attrs);

test('the pill exists and is mounted somewhere', () => {
  // A zero-mount result would make every assertion below vacuously true.
  assert.ok(MOUNTS.length >= 2, `expected ReceivingPhotoButton mounts, found ${MOUNTS.length}`);
});

test('photoStage is required at the component, never defaulted', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./ReceivingPhotoButton.tsx', import.meta.url)),
    'utf8',
  );
  // `photoStage,` in the destructure — not `photoStage = 'anything',`. A default
  // here is the silent opt-out the whole stage split exists to prevent.
  assert.match(code(source), /\n\s*photoStage,/, 'photoStage must be destructured with no default');
  assert.doesNotMatch(
    code(source),
    /photoStage\s*=\s*['"]/,
    'photoStage must not carry a default stage',
  );
});

test('every mount threads the stage explicitly', () => {
  for (const m of MOUNTS) {
    assert.ok(has(m, 'photoStage'), `${m.file}: mount must pass photoStage explicitly`);
  }
});

test('item scope and the line id travel together, both ways', () => {
  for (const m of MOUNTS) {
    if (itemScope(m)) {
      assert.ok(
        has(m, 'receivingLineId'),
        `${m.file}: unbox_item without receivingLineId writes carton evidence under an item label`,
      );
    }
    if (has(m, 'receivingLineId')) {
      assert.ok(
        itemScope(m),
        `${m.file}: a line id makes this ITEM evidence — pass photoStage="unbox_item"`,
      );
    }
  }
});

test('PO-line body does not mount an item camera (condition · serial only)', () => {
  // Main Unbox / unmatched accordion paint condition · serial on the active
  // line; item capture lives on the Units explosion display (and phone).
  for (const lane of [
    'components/receiving/workspace/line-edit/LinePoItemsSection.tsx',
    'components/receiving/workspace/unmatched-items/UnmatchedAccordionSurface.tsx',
  ]) {
    const mounts = MOUNTS.filter((m) => m.file === lane);
    assert.equal(
      mounts.length,
      0,
      `${lane}: active-line body must not mount ReceivingPhotoButton (found ${mounts.length})`,
    );
  }
});

test('Units explosion mounts the desktop item camera', () => {
  const mounts = MOUNTS.filter(
    (m) => m.file === 'components/receiving/workspace/UnitsExplosionDisplay.tsx',
  );
  assert.ok(mounts.length > 0, 'UnitsExplosionDisplay must mount ReceivingPhotoButton');
  assert.ok(
    mounts.some(itemScope),
    'Units explosion item camera must use photoStage="unbox_item"',
  );
});

test('no unbox-bench mount can stamp arrival evidence', () => {
  // Triage's door pill legitimately passes `arrival_package`; the bench never
  // may. Scope the ban to the lanes that render inside the opened carton.
  for (const m of MOUNTS) {
    if (!m.file.includes('receiving/workspace/')) continue;
    assert.doesNotMatch(
      m.attrs,
      /arrival_package/,
      `${m.file}: a bench capture stamping arrival_package voids the require_one receive gate`,
    );
  }
});
