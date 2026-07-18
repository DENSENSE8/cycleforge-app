import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLaneAgeCompact,
  getLaneAgeHours,
  getLaneAgeTone,
  getLaneAgeToneBesideDeadline,
} from '@/utils/date';

describe('formatLaneAgeCompact', () => {
  it('returns null for empty input', () => {
    assert.equal(formatLaneAgeCompact(null), null);
    assert.equal(formatLaneAgeCompact(''), null);
  });

  it('formats minutes under one hour', () => {
    const now = Date.parse('2026-07-12T18:00:00.000Z');
    const thirtyMinAgo = new Date(now - 30 * 60_000).toISOString();
    assert.equal(formatLaneAgeCompact(thirtyMinAgo, now), '30m');
  });

  it('formats hours under two days', () => {
    const now = Date.parse('2026-07-12T18:00:00.000Z');
    const tenHoursAgo = new Date(now - 10 * 3_600_000).toISOString();
    assert.equal(formatLaneAgeCompact(tenHoursAgo, now), '10h');
  });

  it('formats multi-day age as days', () => {
    const now = Date.parse('2026-07-12T18:00:00.000Z');
    const threeDaysAgo = new Date(now - 72 * 3_600_000).toISOString();
    assert.equal(formatLaneAgeCompact(threeDaysAgo, now), '3d');
  });
});

describe('getLaneAgeHours / tone', () => {
  it('computes elapsed hours', () => {
    const now = Date.parse('2026-07-12T18:00:00.000Z');
    const fiveHoursAgo = new Date(now - 5 * 3_600_000).toISOString();
    const h = getLaneAgeHours(fiveHoursAgo, now);
    assert.ok(h != null && h >= 4.9 && h <= 5.1);
  });

  it('heats tone for older ages', () => {
    assert.equal(getLaneAgeTone(null), 'text-text-muted');
    assert.equal(getLaneAgeTone(2), 'text-text-muted');
    assert.equal(getLaneAgeTone(12), 'text-yellow-700');
    assert.equal(getLaneAgeTone(30), 'text-amber-600');
    assert.equal(getLaneAgeTone(60), 'text-red-600');
  });

  it('keeps lane age muted when days-late already owns urgency', () => {
    assert.equal(getLaneAgeToneBesideDeadline(60, 38), 'text-text-muted');
    assert.equal(getLaneAgeToneBesideDeadline(60, null), 'text-red-600');
    assert.equal(getLaneAgeToneBesideDeadline(12, null), 'text-yellow-700');
  });
});
