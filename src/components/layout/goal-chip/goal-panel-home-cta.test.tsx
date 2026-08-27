import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoalPanelHomeCta } from '@/components/layout/goal-chip/GoalPanelHomeCta';

/**
 * The pace-and-next panel's one door out. Rendered, not grepped — the invariant
 * is "an operator can reach Home from this panel", which is a property of the
 * markup, not of the source text (`AGENTS.md` → Guard authoring).
 */

const html = renderToStaticMarkup(<GoalPanelHomeCta />);

test('the CTA is a real link to Home', () => {
  assert.match(html, /<a[^>]+href="\/"/, 'Home is one route — the CTA navigates to it');
  assert.match(html, /Open Home/);
});

test('the CTA is labelled for its destination, not for a mini-Home inside the panel', () => {
  assert.doesNotMatch(html, /<button/, 'navigation is a link: middle-click and prefetch matter');
  assert.doesNotMatch(html, /rounded-(?!none)/, 'ops chrome is flush-square');
});
