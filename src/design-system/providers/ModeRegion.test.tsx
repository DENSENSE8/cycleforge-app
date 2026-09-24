/**
 * ModeRegion — modes nest by REGION, one level deep.
 *
 *   npx tsx --test src/design-system/providers/ModeRegion.test.tsx
 *
 * A page region plus one nested region (the right rail) is the whole budget;
 * the third level is the regression this pins, because a depth counter that
 * does not thread through context (or counts from 0) would let it pass silently.
 */
import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModeRegion, useMode } from '@/design-system/providers/ModeRegion';

function renderCapturingErrors(node: React.ReactElement): { html: string; errors: string[] } {
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

function ModeProbe() {
  return <span data-probe={useMode() ?? 'none'} />;
}

test('a page region and one nested region render their modes without a report', () => {
  const { html, errors } = renderCapturingErrors(
    <ModeRegion mode="industrial">
      <ModeRegion mode="triage">
        <ModeProbe />
      </ModeRegion>
    </ModeRegion>,
  );
  assert.deepEqual(errors, []);
  assert.match(html, /^<div data-mode="industrial"><div data-mode="triage"><span data-probe="triage">/);
});

test('a third level is reported, naming both enclosing modes', () => {
  const { html, errors } = renderCapturingErrors(
    <ModeRegion mode="industrial">
      <ModeRegion mode="triage">
        <ModeRegion mode="assistant" />
      </ModeRegion>
    </ModeRegion>,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"assistant"/);
  assert.match(errors[0], /"industrial" → "triage"/);
  // Reported, not refused: the region still renders.
  assert.match(html, /data-mode="assistant"/);
});

test('sibling regions do not add depth to each other', () => {
  const { errors } = renderCapturingErrors(
    <ModeRegion mode="industrial">
      <ModeRegion mode="triage" />
      <ModeRegion mode="assistant" />
    </ModeRegion>,
  );
  assert.deepEqual(errors, []);
});
