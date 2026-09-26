/** OneTimeCodeInput — the edit algebra behind the boxes, plus the typing face. */
import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  OneTimeCodeInput,
  backspaceCode,
  writeCodeChars,
  uppercaseAlphanumeric,
} from '@/design-system/primitives/OneTimeCodeInput';

// ─── writeCodeChars — typing and pasting ─────────────────────────────────────

test('a character fills its box and hands the caret to the next one', () => {
  assert.deepEqual(writeCodeChars('', 0, '7', 4), { value: '7', focusIndex: 1 });
  assert.deepEqual(writeCodeChars('7K', 2, '4', 4), { value: '7K4', focusIndex: 3 });
});

test('typing into a filled box overwrites it and keeps the rest of the code', () => {
  assert.deepEqual(writeCodeChars('7K4M', 1, 'Z', 4), { value: '7Z4M', focusIndex: 2 });
});

test('the last box keeps the caret — there is nowhere further right to go', () => {
  assert.deepEqual(writeCodeChars('7K4', 3, 'M', 4), { value: '7K4M', focusIndex: 3 });
});

test('a multi-character write spills rightward and is clamped to the code length', () => {
  assert.deepEqual(writeCodeChars('', 0, '7K4M', 4), { value: '7K4M', focusIndex: 3 });
  assert.deepEqual(writeCodeChars('7K4M', 2, 'XY', 4), { value: '7KXY', focusIndex: 3 });
  assert.deepEqual(writeCodeChars('', 0, '7K4MZZ', 4), { value: '7K4M', focusIndex: 3 });
});

test('an empty write clears the box and leaves the caret on it', () => {
  assert.deepEqual(writeCodeChars('7K4M', 1, '', 4), { value: '74M', focusIndex: 1 });
});

// ─── backspaceCode — the retreat ─────────────────────────────────────────────

test('backspace on a filled box clears it without moving', () => {
  assert.deepEqual(backspaceCode('7K4M', 2), { value: '7KM', focusIndex: 2 });
});

test('backspace on an empty box eats the character to its left and steps back', () => {
  assert.deepEqual(backspaceCode('7K', 2), { value: '7', focusIndex: 1 });
});

test('backspace on the first, empty box is a no-op', () => {
  assert.deepEqual(backspaceCode('', 0), { value: '', focusIndex: 0 });
});

// ─── The alphabet — already capitalised, no Shift ────────────────────────────

test('the default transform uppercases and drops anything off-alphabet', () => {
  assert.equal(uppercaseAlphanumeric('7k4m'), '7K4M');
  assert.equal(uppercaseAlphanumeric('cf-7k 4m'), 'CF7K4M');
});

// ─── The rendered face ───────────────────────────────────────────────────────

test('renders one box per character, labelled for a screen reader', () => {
  const html = renderToStaticMarkup(
    <OneTimeCodeInput value="7K" onChange={() => {}} length={4} label="Pairing code" />,
  );
  assert.equal(html.match(/<input/g)?.length, 4);
  assert.match(html, /aria-label="Pairing code, character 1 of 4"/);
  assert.match(html, /aria-label="Pairing code, character 4 of 4"/);
  assert.match(html, /role="group"/);
});

test('the keyboard comes up capitalised and only the first box claims autofill', () => {
  const html = renderToStaticMarkup(
    <OneTimeCodeInput value="" onChange={() => {}} length={4} label="Pairing code" />,
  );
  assert.equal(html.match(/autocapitalize="characters"/gi)?.length, 4);
  assert.equal(html.match(/autocomplete="one-time-code"/gi)?.length, 1);
  assert.equal(html.match(/autocomplete="off"/gi)?.length, 3);
});

test('boxes paint filled vs empty edges, and the danger edge when rejected', () => {
  const typing = renderToStaticMarkup(
    <OneTimeCodeInput value="7K" onChange={() => {}} length={4} label="Pairing code" />,
  );
  assert.match(typing, /border-border-strong/, 'filled boxes take the strong edge');
  assert.match(typing, /border-border-soft/, 'empty boxes stay quiet');
  assert.doesNotMatch(typing, /border-border-danger/);

  const rejected = renderToStaticMarkup(
    <OneTimeCodeInput value="7K4M" onChange={() => {}} length={4} label="Pairing code" invalid />,
  );
  assert.match(rejected, /border-border-danger/);
  assert.match(rejected, /aria-invalid="true"/);
});
