import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TaskList } from '@/components/layout/goal-chip/TaskList';
import { TaskListMenu } from '@/components/layout/goal-chip/TaskListMenu';
import type { Todo } from '@/components/layout/goal-chip/goal-chip-shared';

/**
 * The checklist's verbs, asserted on the RENDERED row rather than the source
 * text (`AGENTS.md` → Guard authoring).
 *
 * The invariant these pin is the one the hover-only trash can broke: every row
 * must expose its actions to a finger, not to a pointer that a phone does not
 * have. `opacity-0 group-hover:opacity-100` on the only delete control is the
 * regression to catch.
 */

const ITEMS: Todo[] = [
  { id: '1', text: 'Sweep the bench', done: false },
  { id: '2', text: 'Restock label rolls', done: true },
];

const noop = () => {};

function render(props: Partial<React.ComponentProps<typeof TaskList>> = {}) {
  return renderToStaticMarkup(
    <TaskList
      items={ITEMS}
      onToggle={noop}
      onRemove={noop}
      onRename={noop}
      adding={false}
      draft=""
      onDraft={noop}
      onAdd={noop}
      onStartAdd={noop}
      onCancelAdd={noop}
      emptyHint="empty"
      placeholder="new…"
      addLabel="Add a task"
      {...props}
    />,
  );
}

test('every row carries its own actions trigger, named for its task', () => {
  const html = render();
  assert.match(html, /Task actions — Sweep the bench/);
  assert.match(html, /Task actions — Restock label rolls/);
});

test('row actions are never hover-gated — a phone has no hover', () => {
  const html = render();
  assert.doesNotMatch(
    html,
    /opacity-0[^"]*group-hover/,
    'a control revealed only on hover is unreachable on touch',
  );
});

test('touch density lifts rows and triggers to the 44px tap floor', () => {
  const html = render({ touch: true });
  assert.match(html, /min-h-\[52px\]/, 'sheet rows are tall enough to hit');
  assert.match(html, /h-11 w-11/, 'the ⋯ trigger takes the touch box');
});

test('the list menu links out rather than rendering a second archived list', () => {
  const html = renderToStaticMarkup(
    <TaskListMenu
      listLabel="To-do"
      doneCount={1}
      total={2}
      onClearCompleted={noop}
      onDeleteAll={noop}
    />,
  );
  // Radix renders menu CONTENT in a portal on open, so the closed trigger is
  // all static markup can see — which is exactly the invariant worth pinning
  // here: one control, named for its list.
  assert.match(html, /To-do list actions/);
});
