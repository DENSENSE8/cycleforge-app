/** station-chrome contracts — the tone vocabulary every mobile station inherits. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATION_TONE_INK,
} from '@/components/mobile/station/station-chrome';

const TONES = ['ok', 'warn', 'bad'] as const;

/** Raw Tailwind palette steps — the pre-token state of these maps. */
const RAW_PALETTE = /-(emerald|green|lime|amber|yellow|orange|red|rose|blue|sky|indigo|teal|cyan)-\d/;
const HEX = /#[0-9a-f]{3,8}/i;

describe('tone maps are total over StationTone', () => {
  it('every map carries exactly ok/warn/bad — a missing key renders undefined classes silently', () => {
    for (const map of [STATION_TONE_INK]) {
      assert.deepEqual(Object.keys(map).sort(), [...TONES].sort());
      for (const tone of TONES) {
        assert.ok(typeof map[tone] === 'string' && map[tone].length > 0, `${tone} present`);
      }
    }
  });
});

describe('ink stays in the semantic token families', () => {
  it('ink is text-text-*', () => {
    for (const tone of TONES) {
      assert.match(STATION_TONE_INK[tone], /^text-text-/);
    }
  });

  it('no map value carries a raw palette step or a hex — the two-greens regression', () => {
    for (const map of [STATION_TONE_INK]) {
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

