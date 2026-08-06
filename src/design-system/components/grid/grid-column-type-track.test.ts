import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIN_TRACK_REM_BY_DATE_FACE,
  MIN_TRACK_REM_EXTERNAL,
  gridTrackRemToPx,
  resolveGridColumnMinTrackRem,
} from './grid-column-type-track';

describe('resolveGridColumnMinTrackRem', () => {
  it('defaults date to day face (4.5rem)', () => {
    assert.equal(resolveGridColumnMinTrackRem({ type: 'date' }), MIN_TRACK_REM_BY_DATE_FACE.day);
  });

  it('resolves stamp / duration faces', () => {
    assert.equal(
      resolveGridColumnMinTrackRem({ type: 'date', dateFace: 'stamp' }),
      MIN_TRACK_REM_BY_DATE_FACE.stamp,
    );
    assert.equal(
      resolveGridColumnMinTrackRem({ type: 'date', dateFace: 'duration' }),
      MIN_TRACK_REM_BY_DATE_FACE.duration,
    );
  });

  it('floors external (platform) at 4rem', () => {
    assert.equal(resolveGridColumnMinTrackRem({ type: 'external' }), MIN_TRACK_REM_EXTERNAL);
    assert.equal(MIN_TRACK_REM_EXTERNAL, 4);
  });

  it('lets minTrackRem override the face map', () => {
    assert.equal(
      resolveGridColumnMinTrackRem({ type: 'date', dateFace: 'stamp', minTrackRem: 10 }),
      10,
    );
    assert.equal(resolveGridColumnMinTrackRem({ type: 'external', minTrackRem: 5 }), 5);
  });

  it('returns 0 for types without a floor yet', () => {
    assert.equal(resolveGridColumnMinTrackRem({ type: 'number' }), 0);
    assert.equal(resolveGridColumnMinTrackRem({ type: 'tracking' }), 0);
    assert.equal(resolveGridColumnMinTrackRem({}), 0);
  });

  it('converts rem to px at 16px root', () => {
    assert.equal(gridTrackRemToPx(12, 16), 192);
    assert.equal(gridTrackRemToPx(MIN_TRACK_REM_EXTERNAL, 16), 64);
  });
});
