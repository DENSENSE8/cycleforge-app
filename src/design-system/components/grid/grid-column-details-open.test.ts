import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  GRID_COLUMN_DETAILS_CLOSE_EVENT,
  GRID_COLUMN_DETAILS_OPEN_EVENT,
  GRID_COLUMN_DETAILS_RAIL_ID,
  requestCloseGridColumnDetails,
  requestOpenGridColumnDetails,
} from './grid-column-details-open';

afterEach(() => {
  // jsdom / node:test share the process; leave listeners clean.
});

test('GRID_COLUMN_DETAILS_RAIL_ID is the panel occupant id', () => {
  assert.equal(GRID_COLUMN_DETAILS_RAIL_ID, 'detail:grid-column-details');
});

test('requestOpenGridColumnDetails dispatches the open event', () => {
  let seen = 0;
  const onOpen = () => {
    seen += 1;
  };
  const prev = globalThis.window;
  const listeners = new Map<string, Set<() => void>>();
  // @ts-expect-error test stub
  globalThis.window = {
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(event: Event) {
      for (const fn of listeners.get(event.type) ?? []) fn();
      return true;
    },
  };
  window.addEventListener(GRID_COLUMN_DETAILS_OPEN_EVENT, onOpen);
  try {
    requestOpenGridColumnDetails();
    assert.equal(seen, 1);
  } finally {
    window.removeEventListener(GRID_COLUMN_DETAILS_OPEN_EVENT, onOpen);
    globalThis.window = prev;
  }
});

test('requestCloseGridColumnDetails dispatches the close event', () => {
  let seen = 0;
  const onClose = () => {
    seen += 1;
  };
  const prev = globalThis.window;
  const listeners = new Map<string, Set<() => void>>();
  // @ts-expect-error test stub
  globalThis.window = {
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(event: Event) {
      for (const fn of listeners.get(event.type) ?? []) fn();
      return true;
    },
  };
  window.addEventListener(GRID_COLUMN_DETAILS_CLOSE_EVENT, onClose);
  try {
    requestCloseGridColumnDetails();
    assert.equal(seen, 1);
  } finally {
    window.removeEventListener(GRID_COLUMN_DETAILS_CLOSE_EVENT, onClose);
    globalThis.window = prev;
  }
});
