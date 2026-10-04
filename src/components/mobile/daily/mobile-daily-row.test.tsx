/** Render contract — the phone checklist row (`/m/home`). */

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

test('every open task row wears its status pill, To do included; a done row wears none (P1: the column aligns)', () => {
  const held = paint(false, { rowKey: 'task-7', detail: 'record', taskStatus: 'PENDING', due: 'Due today' });
  assert.match(held, /data-task-status="PENDING"[^>]*>.*Pending/);
  const todo = paint(false, { rowKey: 'task-7', detail: 'record', taskStatus: 'TODO', due: 'Due today' });
  assert.match(todo, /data-task-status="TODO"/, 'To do paints too — the status column never jumps');
  const done = paint(true, { rowKey: 'task-7', detail: 'record', taskStatus: 'DONE', due: 'Due today' });
  assert.doesNotMatch(done, /data-task-status=/, 'Done is the strike, not a pill');
});

test('the caption reads WHEN, then the task status, then the ticket, then the record', () => {
  const html = paint(false, {
    rowKey: 'task-7',
    detail: 'record',
    due: 'Overdue',
    dueTone: 'danger',
    taskStatus: 'IN_PROGRESS',
    ticketStatus: 'open',
    subtitle: 'Carton 4471',
  });
  const at = (needle: RegExp) => html.search(needle);
  assert.ok(at(/Overdue/) >= 0 && at(/Overdue/) < at(/data-task-status=/), 'due leads the caption');
  assert.ok(at(/data-task-status=/) < at(/Carton 4471/), 'the record trails');
  assert.match(html, /text-text-danger[^"]*">Overdue/, 'only the due wears the overdue ink');
});
