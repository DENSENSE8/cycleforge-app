/**
 * Hard law: the deck is a TRANSFORM — never a filter, never a sort.
 *
 * Flat foundation (amended 2026-08-04): every step is a full face at a fixed
 * 40px height; selection is outline-only; evidence mounts under the list.
 * No peek, covered, negative margins, layout motion, or wheel.
 *
 * Run: `node --import tsx --test \
 *        src/design-system/components/procedure/procedure-deck-order.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DECK = fileURLToPath(new URL('./ProcedureDeck.tsx', import.meta.url));
const LAYOUT = fileURLToPath(new URL('./procedure-stack-layout.ts', import.meta.url));

const raw = () => readFileSync(DECK, 'utf8');
const layoutRaw = () => readFileSync(LAYOUT, 'utf8');

/** Comments stripped — a docblock swearing off sorting must not satisfy a check. */
const code = () =>
  raw()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');

test('the deck maps its steps and does nothing else to the list', () => {
  const src = code();

  assert.match(src, /steps\.map\s*\(/, 'the deck must render from steps.map — that is the transform');

  for (const [name, re] of [
    ['filter', /steps\s*\.\s*filter\s*\(/],
    ['sort', /steps\s*\.\s*sort\s*\(/],
    ['toSorted', /steps\s*\.\s*toSorted\s*\(/],
    ['slice', /steps\s*\.\s*slice\s*\(/],
    ['reverse', /steps\s*\.\s*reverse\s*\(/],
  ] as const) {
    assert.equal(
      re.test(src),
      false,
      `the deck ${name}s its steps. Membership and order belong to the vocabulary.`,
    );
  }
});

test('flat geometry — full rows only; no peek / covered / pull-up / layout motion', () => {
  const src = code();
  const layout = layoutRaw()
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ');

  assert.equal(/runProcedureStackAdvance/.test(src), false);
  assert.equal(/layout=["']position["']/.test(src), false);
  assert.equal(/LayoutGroup/.test(src), false);
  assert.equal(/queuedPeekPullUpRem/.test(src), false);
  assert.equal(/queuedPeekPullUpRem/.test(layout), false);
  assert.equal(/PROCEDURE_STACK_PEEK_REM/.test(layout), false);
  assert.equal(/data-procedure-peek/.test(src), false);
  assert.equal(/isCovered/.test(src), false);
  assert.equal(/PROCEDURE_COVERED/.test(src), false);
  assert.equal(/PROCEDURE_PEEK/.test(src), false);
  assert.equal(/sticky\s+bottom-0/.test(src), false);
  assert.equal(/addEventListener\(\s*['"]wheel['"]/.test(src), false);
  assert.equal(/stackArmed/.test(src), false);
  assert.equal(/overflow-y-auto/.test(src), false);
  assert.equal(/snap-y/.test(src), false);
  assert.equal(/space-y-/.test(src), false);

  assert.match(src, /data-procedure-mode=["']full["']/);
  assert.match(src, /PROCEDURE_STACK_GAP_REM/);
  assert.match(src, /marginTop:\s*`\$\{PROCEDURE_STACK_GAP_REM\}rem`/);
});

test('there is ONE face height for every state, matching the layout module', () => {
  const src = raw();
  assert.match(
    src,
    /PROCEDURE_STEP_FACE_HEIGHT\s*=\s*['"]h-7['"]/,
    'PROCEDURE_STEP_FACE_HEIGHT must be h-7 (28px — PRIMARY chrome)',
  );

  const layoutFace = /PROCEDURE_STACK_FACE_REM\s*=\s*([\d.]+)/.exec(layoutRaw());
  assert.ok(layoutFace);
  assert.equal(Number(layoutFace![1]), 2.5);

  // Active must not drop the shared face height (outline selection only).
  const srcCode = code();
  assert.match(srcCode, /PROCEDURE_STEP_FACE_HEIGHT/);
  assert.equal(
    /!isActive\s*&&\s*PROCEDURE_STEP_FACE_HEIGHT/.test(srcCode),
    false,
    'face height must apply to active rows too — not only inactive',
  );
});

test('selection is outline-only; evidence mounts under the list', () => {
  const src = code();
  assert.match(src, /ring-1 ring-inset ring-blue-400/);
  assert.match(src, /data-procedure-active-body/);
  // Body is a sibling under the list — not nested inside steps.map's face.
  assert.match(src, /<\/ol>[\s\S]*data-procedure-active-body/);
  assert.match(src, /faceHeader/);
  // Active keeps the Icon medallion (same face chrome as inactive).
  assert.match(src, /<Icon\b/);
});

test('content motion only — procedureFocusBody on the evidence band; no layout settle', () => {
  const src = code();
  assert.match(src, /framerPresence\.procedureFocusBody/);
  assert.equal(/motionRole\.procedure\.advance/.test(src), false);
  assert.equal(/useMotionTransition\(motionRole\.procedure/.test(src), false);
  assert.equal(/layout=["']position["']/.test(src), false);
});

test('travel scrolls the active step into view on the host port', () => {
  const src = code();
  assert.match(src, /scrollIntoView/);
  assert.match(src, /block:\s*['"]nearest['"]/);
});
