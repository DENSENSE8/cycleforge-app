/** ProgressDots contracts — the step-rail algorithm and its accessibility face. */
import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDotRail, ProgressDots } from '@/components/mobile/ProgressDots';

// ─── buildDotRail — clamping ─────────────────────────────────────────────────

test('clamps done into [0, total] before building the rail', () => {
  assert.deepEqual(buildDotRail(-3, 5, 7), buildDotRail(0, 5, 7));
  assert.deepEqual(buildDotRail(99, 5, 7), buildDotRail(5, 5, 7));
});

test('total 0 renders no rail — nothing to show', () => {
  assert.deepEqual(buildDotRail(0, 0, 7), []);
});

// ─── buildDotRail — the no-compression window ────────────────────────────────

test('total within maxVisible shows every step: done, one current, rest pending', () => {
  assert.deepEqual(buildDotRail(2, 5, 7), ['done', 'done', 'current', 'pending', 'pending']);
});

test('a completed rail is all done — no dangling current step', () => {
  assert.deepEqual(buildDotRail(5, 5, 7), ['done', 'done', 'done', 'done', 'done']);
});

test('compression starts exactly one step past maxVisible', () => {
  assert.equal(buildDotRail(0, 7, 7).includes('ellipsis'), false);
  assert.equal(buildDotRail(0, 8, 7).includes('ellipsis'), true);
});

// ─── buildDotRail — compression shape ────────────────────────────────────────

test('a compressed rail is head-2 ··· tail-2 — five cells, one ellipsis', () => {
  const rail = buildDotRail(1, 20, 7);
  assert.equal(rail.length, 5);
  assert.equal(rail.filter((s) => s === 'ellipsis').length, 1);
  assert.deepEqual(rail, ['done', 'current', 'ellipsis', 'pending', 'pending']);
});

test('current stays visible while it sits in the tail window', () => {
  assert.deepEqual(buildDotRail(19, 20, 7), ['done', 'done', 'ellipsis', 'done', 'current']);
});

test('current in the compressed middle is not shown — the documented trade', () => {
  const rail = buildDotRail(10, 20, 7);
  assert.equal(rail.includes('current'), false);
  assert.deepEqual(rail, ['done', 'done', 'ellipsis', 'pending', 'pending']);
});

// ─── ProgressDots — the accessible face ──────────────────────────────────────

test('renders a progressbar with min/max/now and the default step label', () => {
  const html = renderToStaticMarkup(<ProgressDots done={2} total={5} />);
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="5"/);
  assert.match(html, /aria-valuenow="2"/);
  assert.match(html, /Step 3 of 5/);
});

test('a custom ariaLabel replaces the default wording', () => {
  const html = renderToStaticMarkup(<ProgressDots done={1} total={4} ariaLabel="Carton 2 of 4" />);
  assert.match(html, /Carton 2 of 4/);
  assert.doesNotMatch(html, /Step \d/);
});

test('aria-valuenow is clamped to total, not the raw input', () => {
  const html = renderToStaticMarkup(<ProgressDots done={99} total={5} />);
  assert.match(html, /aria-valuenow="5"/);
});

// ─── Token law — dots speak the fill family, never raw palette ─────────────

test('done/current dots use the semantic fill tokens; no raw palette anywhere', () => {
  const html = renderToStaticMarkup(<ProgressDots done={2} total={5} />);
  assert.match(html, /bg-fill-success/, 'done dot: solid fill family (progress indicators)');
  assert.match(html, /bg-fill-info/, 'current dot: solid fill family');
  assert.match(html, /bg-surface-strong/, 'pending dots stay the quiet surface tone');
  assert.doesNotMatch(
    html,
    /\b(bg|text|border|ring)-(emerald|green|blue|sky|indigo|teal|cyan|amber|yellow|orange|red|rose)-\d/,
    'the pre-token state of this component',
  );
});
