import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThrowTaskRow } from '@/components/layout/goal-chip/ThrowTaskRow';

/**
 * Discovery CTA for throw — rendered, not grepped. The invariant is "an
 * operator can reach Throw from the pace-and-next panel and see the chord",
 * which is a property of the markup.
 */

const html = renderToStaticMarkup(React.createElement(ThrowTaskRow));

test('the row is a button that names Throw and advertises ⌘⇧U', () => {
  assert.match(html, /<button/);
  assert.match(html, /Throw a task/);
  assert.match(html, /⌘⇧U/);
});

test('the row is flush-square ops chrome, not a rounded card', () => {
  const buttonClasses = html.match(/<button[^>]*class="([^"]+)"/)?.[1] ?? '';
  assert.match(buttonClasses, /rounded-none/);
  assert.doesNotMatch(buttonClasses, /rounded-(?!none)/);
});
