/**
 * Render contract — the phone checklist row (`/m/home`).
 *
 *   npx tsx --test src/components/mobile/daily/mobile-daily-row.test.tsx
 *
 * What the row promises:
 *   - the title strikes on check, through the SAME `StruckLabel` the desk's
 *     compound cell paints (one animation, two surfaces);
 *   - the whole title is the tick target (label/for → the Radix checkbox), so
 *     a thumb does not have to find a 20px box;
 *   - the row prints NO id — the pencil on the hard right is the door to the
 *     detail sheet, which is where the id now lives;
 *   - a ticket-linked row paints the ticket glyph as a real DOOR (a named
 *     control that opens the thread), never a decorative mark;
 *   - a `once` row carries the exception caption ("Today only") and the
 *     owner's avatar; a recurring row paints no caption at all.
 */

import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MobileDailyRow } from '@/components/mobile/daily/MobileDailyRow';

const TITLE = 'Front door locked';
const noop = () => {};

function paint(
  done: boolean,
  props: Partial<Parameters<typeof MobileDailyRow>[0]> = {},
) {
  return renderToStaticMarkup(
    <MobileDailyRow
      itemId={7}
      title={TITLE}
      done={done}
      onToggle={noop}
      onOpenDetail={noop}
      onOpenTicket={noop}
      {...props}
    />,
  );
}

test('unchecked row paints the title unstruck and prints no id', () => {
  const html = paint(false);
  assert.match(html, new RegExp(TITLE));
  assert.doesNotMatch(html, />7</, 'the id left the phone row — it lives in the sheet');
  assert.doesNotMatch(html, /#7/);
  assert.match(html, /data-struck="false"/);
  assert.match(html, /text-decoration-thickness:0px/);
  assert.doesNotMatch(html, /text-text-muted/);
});

test('the strike is the TITLE text decoration, not a rule across the row', () => {
  // A wrapped title must strike per LINE and stop at its last glyph. A line
  // pinned at the wrapper's mid-height put one rule through the gap between
  // two lines (operator 2026-09-23).
  const html = paint(true);
  assert.match(html, /data-struck="true"/);
  assert.match(html, /\[text-decoration-line:line-through\]/);
  assert.match(html, /text-decoration-thickness:1px/);
  assert.match(html, /text-text-muted/);
  assert.doesNotMatch(html, /absolute[^"]*top-1\/2/, 'no row-height rule survives');
});

test('the whole title is the tick target — label/for matches the checkbox id', () => {
  const html = paint(false);
  assert.match(html, /for="m-daily-check-7"/);
  assert.match(html, /id="m-daily-check-7"/);
});

test('a task row and a check row with the same number get different checkbox ids', () => {
  // Two stores number their rows independently: `daily_check_items.id = 7` and
  // `work_assignments.id = 7` land on the same list, and one shared DOM id
  // would make the task's label tick the check.
  const check = paint(false);
  const task = paint(false, { rowKey: 'task-7', detail: 'record' });
  assert.match(check, /id="m-daily-check-7"/);
  assert.match(task, /id="m-daily-task-7"/);
  assert.match(task, /aria-label="Open Front door locked"/, 'a task walks to its record');
});

test('the row clears the 44px touch floor and the pencil is the edit door', () => {
  const html = paint(false);
  assert.match(html, /min-h-14/, 'row is taller than the touch minimum');
  assert.match(html, /aria-label="Edit Front door locked"/);
  assert.doesNotMatch(html, /aria-label="Details for/, 'the id handle is gone');
});

test('a ticket-linked row paints the ticket door, named by its number', () => {
  const html = paint(false, { ticketId: 48120 });
  assert.match(html, /aria-label="Open ticket #48120"/);
  assert.match(html, /text-text-warning/, 'the ticket mark is always the house amber');
});

test('without the helpdesk permission the glyph stays a MARK, not a door', () => {
  const html = paint(false, { ticketId: 48120, onOpenTicket: undefined });
  assert.doesNotMatch(html, /Open ticket/, 'no door a press would 403');
  assert.match(html, /text-text-warning/, 'recognition survives the missing permission');
});

test('a plain task paints no ticket glyph at all — never a dead affordance', () => {
  const html = paint(false);
  assert.doesNotMatch(html, /Open ticket/);
  assert.doesNotMatch(html, /text-text-warning/);
});

test('a once row carries the Today-only caption and the owner avatar', () => {
  const html = paint(false, {
    once: true,
    owner: { staffId: 10, name: 'Ana' },
  });
  assert.match(html, /Today only/);
  assert.match(html, /Ana/);
  assert.match(html, /data-once="true"/);
  assert.doesNotMatch(html, /min-h-14/, 'the caption, not the floor, sizes the row');
});

test('a recurring row paints no caption — only the exception is marked', () => {
  const html = paint(false);
  assert.doesNotMatch(html, /Today only/);
  assert.doesNotMatch(html, /data-once="true"/);
});
