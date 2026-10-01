/**
 * ModeRegion — modes nest by REGION, one level deep; re-declaring the mode a
 * region already sits in is not a level. Plain `.ts` (createElement, no JSX)
 * so `scripts/run-unit-tests.mjs`, which collects `*.test.ts`, runs it.
 */
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ModeName } from '@/design-system/modes/registry';
import { ModeRegion, useMode } from '@/design-system/providers/ModeRegion';

function renderCapturingErrors(node: ReactElement): { html: string; errors: string[] } {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    return { html: renderToStaticMarkup(node), errors };
  } finally {
    console.error = original;
  }
}

function region(mode: ModeName, ...children: ReactNode[]): ReactElement {
  return h(ModeRegion, { mode }, ...children);
}

function ModeProbe() {
  return h('span', { 'data-probe': useMode() ?? 'none' });
}

test('a page region and one nested region render their modes without a report', () => {
  const { html, errors } = renderCapturingErrors(region('counter', region('triage', h(ModeProbe))));
  assert.deepEqual(errors, []);
  assert.match(html, /^<div data-mode="counter"><div data-mode="triage"><span data-probe="triage">/);
});

test('a third level is reported, naming both enclosing modes', () => {
  const { html, errors } = renderCapturingErrors(
    region('counter', region('triage', region('assistant'))),
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"assistant"/);
  assert.match(errors[0], /"counter" → "triage"/);
  // Reported, not refused: the region still renders.
  assert.match(html, /data-mode="assistant"/);
});

test('sibling regions do not add depth to each other', () => {
  const { errors } = renderCapturingErrors(region('counter', region('triage'), region('assistant')));
  assert.deepEqual(errors, []);
});

test('re-declaring the enclosing mode is not a new level', () => {
  // A page region, an in-page panel re-declaring it, then a genuinely nested
  // region: the panel is not a level, so the nested region is level 2.
  const { html, errors } = renderCapturingErrors(
    region('triage', region('triage', region('assistant', region('assistant')))),
  );
  assert.deepEqual(errors, []);
  assert.match(html, /data-mode="assistant"/);
});

test('a third distinct mode under a re-declared region is still reported', () => {
  const { errors } = renderCapturingErrors(
    region('counter', region('triage', region('triage', region('assistant')))),
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"counter" → "triage"/);
});
