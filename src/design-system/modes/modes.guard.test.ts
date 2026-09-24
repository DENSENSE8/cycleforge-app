/**
 * GUARD — one language, two densities (owner ruling 2026-09-24).
 *
 * The operational family (industrial + triage) shares ONE identity: warm
 * greys, square corners, the same warning ink. A mode in the family may change
 * SPACE (padding, hit, body size, motion) — never colour family or corner.
 * Triage once carried slate greys and rounded panels, which put a consumer-SaaS
 * record inside the industrial terminal on the same screen. This file makes
 * that regression fail CI — in the token registry, in the generated CSS, and in
 * the component-level corner constants that bypass the mode vars.
 *
 * Changing identity is an owner decision: edit OPERATIONAL_BASE (both modes
 * move together) — never a per-mode override. A new mode must either join
 * OPERATIONAL_MODES or be named, with a reason, in IDENTITY_EXEMPT_MODES.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DENSITY_KEYS,
  IDENTITY_EXEMPT_MODES,
  MODE_NAMES,
  MODE_REGISTRY,
  OPERATIONAL_BASE,
  OPERATIONAL_MODES,
  modeRegistryCssText,
} from './registry';
import { cornerClass, TRIAGE_PANEL_INNER_CORNER } from '@/design-system/tokens/radius';
import { TRIAGE_PANEL_SEGMENT_ENDS } from '@/design-system/tokens/triage-panel';

const density = new Set<string>(DENSITY_KEYS);

test('every mode either shares the operational identity or is exempted by name', () => {
  for (const name of MODE_NAMES) {
    const operational = (OPERATIONAL_MODES as readonly string[]).includes(name);
    const exempt = Object.prototype.hasOwnProperty.call(IDENTITY_EXEMPT_MODES, name);
    assert.ok(
      operational !== exempt,
      `mode "${name}" must be in exactly one of OPERATIONAL_MODES / IDENTITY_EXEMPT_MODES`,
    );
  }
});

test('operational modes differ from the shared base only in density keys', () => {
  for (const name of OPERATIONAL_MODES) {
    const spec = MODE_REGISTRY[name] as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(spec)) {
      if (density.has(key)) continue;
      assert.ok(
        Object.prototype.hasOwnProperty.call(OPERATIONAL_BASE, key),
        `mode "${name}" sets "${key}", which is neither a density key nor part of the shared identity`,
      );
      assert.deepEqual(
        value,
        (OPERATIONAL_BASE as Record<string, unknown>)[key],
        `mode "${name}" overrides identity key "${key}" — identity is OPERATIONAL_BASE, shared by the family`,
      );
    }
    for (const key of Object.keys(OPERATIONAL_BASE)) {
      assert.ok(key in spec, `mode "${name}" drops identity key "${key}"`);
    }
  }
});

test('the shared identity is warm and square', () => {
  assert.equal(OPERATIONAL_BASE.radius, '0');
  assert.equal(OPERATIONAL_BASE.radiusPill, '0');
  assert.equal(OPERATIONAL_BASE.surfaces.ink, '#10110f');
  assert.equal(OPERATIONAL_BASE.surfaces.rule, '#cacbc5');
});

test('generated CSS: industrial and triage declare the same radius and palette', () => {
  const css = modeRegistryCssText();
  const block = (selector: string) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `missing block ${selector}`);
    return css.slice(at, css.indexOf('}', at));
  };
  for (const name of OPERATIONAL_MODES) {
    assert.match(block(`[data-mode='${name}']`), /--mode-radius: 0;/);
    const light = block(`html:not([data-color-scheme='dark']) [data-mode='${name}']`);
    assert.match(light, /--ds-color-text-primary: #10110f;/);
    assert.match(light, /--ds-color-border-subtle: #cacbc5;/);
  }
});

test('triage component corners are square (no rounded escape hatch around the mode var)', () => {
  const soft = /\brounded-(?!none\b)[a-z0-9-]+/;
  assert.doesNotMatch(cornerClass('surface'), soft);
  assert.doesNotMatch(TRIAGE_PANEL_INNER_CORNER, soft);
  assert.doesNotMatch(TRIAGE_PANEL_SEGMENT_ENDS, /rounded-[lr]-/);
});
