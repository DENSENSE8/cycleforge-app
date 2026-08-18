/**
 * LedgerGrid / DataTable column headers render Sentence case as authored.
 * CSS `uppercase` on `tableHeader` would force ALL CAPS and undo the house law
 * (Unbox History golden consumer). Eyebrows · chips · section/field labels keep
 * their own uppercase presets — this guard only locks `tableHeader`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tableHeader } from './presets';

describe('tableHeader casing', () => {
  it('does not apply CSS uppercase (Sentence case as authored)', () => {
    assert.ok(
      !/\buppercase\b/.test(tableHeader),
      `tableHeader must not include uppercase; got: ${tableHeader}`,
    );
  });
});
