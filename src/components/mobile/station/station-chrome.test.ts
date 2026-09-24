/**
 * station-chrome contracts — the tone vocabulary every mobile station inherits.
 *
 * The maps' own doc comments are the law's history: tone-as-ground (a 10px ink
 * stamp at 3.26:1 was not a signal), semantic tokens not raw palette steps
 * (emerald vs green-600 showed two mismatched greens in one row), and an
 * untinted ok row ("a ledger where every row is coloured has no signal").
 * These tests make each of those regressions a failure, not a story.
 *
 * Pure data contracts — the render consumption (MobileStationTapeItem) is
 * covered by the maps being total over StationTone.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATION_EYEBROW_CLASS,
  STATION_TONE_GROUND,
  STATION_TONE_INK,
} from '@/components/mobile/station/station-chrome';

const TONES = ['ok', 'warn', 'bad'] as const;

/** Raw Tailwind palette steps — the pre-token state of these maps. */
const RAW_PALETTE = /-(emerald|green|lime|amber|yellow|orange|red|rose|blue|sky|indigo|teal|cyan)-\d/;
const HEX = /#[0-9a-f]{3,8}/i;

describe('tone maps are total over StationTone', () => {
  it('every map carries exactly ok/warn/bad — a missing key renders undefined classes silently', () => {
    for (const map of [STATION_TONE_GROUND, STATION_TONE_INK]) {
      assert.deepEqual(Object.keys(map).sort(), [...TONES].sort());
      for (const tone of TONES) {
        assert.ok(typeof map[tone] === 'string' && map[tone].length > 0, `${tone} present`);
      }
    }
  });
});

describe('tone is a ground, not ink-only', () => {
  it('ground values are surface tokens, never raw palette or hex', () => {
    for (const tone of TONES) {
      const v = STATION_TONE_GROUND[tone];
      assert.match(v, /^bg-surface-/);
      assert.doesNotMatch(v, RAW_PALETTE);
      assert.doesNotMatch(v, HEX);
    }
  });

  it('ok is untinted — a ledger where every row is coloured has no signal', () => {
    assert.equal(STATION_TONE_GROUND.ok, 'bg-surface-card');
  });

  it('warn and bad tint, and are distinct signals', () => {
    assert.notEqual(STATION_TONE_GROUND.warn, STATION_TONE_GROUND.ok);
    assert.notEqual(STATION_TONE_GROUND.bad, STATION_TONE_GROUND.ok);
    assert.notEqual(STATION_TONE_GROUND.warn, STATION_TONE_GROUND.bad);
  });
});

describe('ink stays in the semantic token families', () => {
  it('ink is text-text-*', () => {
    for (const tone of TONES) {
      assert.match(STATION_TONE_INK[tone], /^text-text-/);
    }
  });

  it('no map value carries a raw palette step or a hex — the two-greens regression', () => {
    for (const map of [STATION_TONE_GROUND, STATION_TONE_INK]) {
      for (const tone of TONES) {
        assert.doesNotMatch(map[tone], RAW_PALETTE, `${tone}: ${map[tone]}`);
        assert.doesNotMatch(map[tone], HEX, `${tone}: ${map[tone]}`);
      }
    }
  });

  it('each tone speaks one hue family (ok→success, warn→warning, bad→danger)', () => {
    const family = { ok: 'success', warn: 'warning', bad: 'danger' } as const;
    for (const tone of TONES) {
      assert.ok(STATION_TONE_INK[tone].includes(family[tone]), `${tone} ink`);
    }
  });
});

describe('eyebrow face is a modifier, not a face', () => {
  it('carries no size, weight, or letterspacing — the house scale owns tracking per size', () => {
    assert.equal(STATION_EYEBROW_CLASS, 'uppercase');
    assert.doesNotMatch(STATION_EYEBROW_CLASS, /(text-|font-|tracking-)/);
  });
});
