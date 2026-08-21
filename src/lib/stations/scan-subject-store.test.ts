import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  SUBJECT_TTL_MS,
  __resetScanSubjectForTests,
  __setScanSubjectClockForTests,
  clearScanSubject,
  getScanSubject,
  setScanSubject,
} from './scan-subject-store';

describe('scan-subject-store', () => {
  beforeEach(() => {
    __resetScanSubjectForTests();
  });

  it('holds the last unit scanned', () => {
    setScanSubject('unit', ' CN1A2B3XYZ ');
    assert.deepEqual(
      { kind: getScanSubject()?.kind, value: getScanSubject()?.value },
      { kind: 'unit', value: 'CN1A2B3XYZ' },
    );
  });

  it('ignores an empty value rather than clearing the live subject', () => {
    setScanSubject('unit', 'A1');
    setScanSubject('unit', '   ');
    assert.equal(getScanSubject()?.value, 'A1');
  });

  it('expires past the TTL', () => {
    // A subject with no expiry is a loaded gun on a shared bench: scan a unit,
    // walk away, and someone else's verdict sticker lands on it.
    let now = 1_000_000;
    __setScanSubjectClockForTests(() => now);
    setScanSubject('unit', 'A1');
    now += SUBJECT_TTL_MS - 1;
    assert.equal(getScanSubject()?.value, 'A1');
    now += 2;
    assert.equal(getScanSubject(), null);
  });

  it('clears on consume so a verdict cannot be re-applied', () => {
    setScanSubject('unit', 'A1');
    clearScanSubject();
    assert.equal(getScanSubject(), null);
  });
});
