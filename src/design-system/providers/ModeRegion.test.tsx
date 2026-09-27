/** ModeRegion — modes nest by REGION, one level deep. */
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

test('re-declaring the enclosing mode is not a new level', () => {
  // A page region, an in-page panel re-declaring it, then a genuinely nested
  // region: the panel is not a level, so the nested region is level 2.
  const { html, errors } = renderCapturingErrors(
    <ModeRegion mode="triage">
      <ModeRegion mode="triage">
        <ModeRegion mode="assistant">
          <ModeRegion mode="assistant" />
        </ModeRegion>
      </ModeRegion>
    </ModeRegion>,
  );
  assert.deepEqual(errors, []);
  assert.match(html, /data-mode="assistant"/);
});

test('a third distinct mode under a re-declared region is still reported', () => {
  const { errors } = renderCapturingErrors(
    <ModeRegion mode="industrial">
      <ModeRegion mode="triage">
        <ModeRegion mode="triage">
          <ModeRegion mode="assistant" />
        </ModeRegion>
      </ModeRegion>
    </ModeRegion>,
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /"industrial" → "triage"/);
});
