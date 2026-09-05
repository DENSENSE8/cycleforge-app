/**
 * Tripwire — QA Design Lab catalog + reskin token layer.
 *
 * Run: node --import tsx --test src/lib/design-lab/catalog.test.ts
 *
 * The lab is only worth running if its catalog cannot silently rot: a station
 * that joins the overlay cohort, or a product table that gains a desk, must
 * either appear here or be declared a known gap.
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { SCAN_STATION_OVERLAY_COHORT } from '@/lib/station/scan-station-overlay-cohort';
import {
  DESIGN_LAB_SECTIONS,
  DESIGN_LAB_SECTION_LABELS,
  DESIGN_LAB_VIEWPOINTS,
  DESK_TABLES_WITHOUT_ROUTE,
  productTableIds,
  viewpointsForSection,
} from './catalog';
import { DESIGN_LAB_FLAG } from './constants';
import { QA_FEATURE_FLAGS } from '@/lib/tenancy/qa-org';
import { THEME_VAR_KEYS } from '@/design-system/themes/registry';
import { VISUAL_SIBLING_PAIRS } from './visual-sibling-pairs';
import {
  RESKIN_ALL_ALIAS,
  RESKIN_ATTR,
  RESKIN_GROUPS,
  RESKIN_GROUP_IDS,
  groupKeyOwner,
  parseReskinSelection,
  reskinGroupSize,
  reskinChangedKeys,
  reskinRegistryCssText,
  serializeReskinSelection,
} from '@/design-system/themes/reskin';
import { RESKIN_BOOT_SCRIPT, withReskinParam } from '@/lib/theme/reskin';

const ROOT = process.cwd();

describe('design-lab catalog', () => {
  it('has unique viewpoint ids', () => {
    const ids = DESIGN_LAB_VIEWPOINTS.map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate viewpoint id');
  });

  it('every viewpoint route is absolute and every section is populated', () => {
    for (const v of DESIGN_LAB_VIEWPOINTS) {
      assert.ok(v.route.startsWith('/'), `${v.id}: route must be absolute (${v.route})`);
      assert.ok(v.label.length > 0, `${v.id}: needs a label`);
      assert.ok(v.exercise.length > 0, `${v.id}: needs an exercise — a card with no test is decor`);
    }
    for (const section of DESIGN_LAB_SECTIONS) {
      assert.ok(viewpointsForSection(section).length > 0, `section ${section} is empty`);
      assert.ok(DESIGN_LAB_SECTION_LABELS[section], `section ${section} has no label`);
    }
  });

  it('covers every scan-station overlay cohort member', () => {
    for (const member of SCAN_STATION_OVERLAY_COHORT) {
      const hit = DESIGN_LAB_VIEWPOINTS.find((v) => v.id === `station:${member.id}`);
      assert.ok(hit, `station ${member.id} is in the overlay cohort but not in the Design Lab`);
      assert.equal(hit.route, member.route, `station ${member.id}: route drifted from the cohort`);
    }
  });

  it('sibling-diff pairs resolve to catalog viewpoints (plan §7.4 step 5)', () => {
    const ids = new Set(DESIGN_LAB_VIEWPOINTS.map((v) => v.id));
    for (const pair of VISUAL_SIBLING_PAIRS) {
      assert.ok(ids.has(pair.a), `sibling pair missing viewpoint ${pair.a}`);
      assert.ok(ids.has(pair.b), `sibling pair missing viewpoint ${pair.b}`);
      assert.notEqual(pair.a, pair.b, `${pair.a} cannot sibling-diff itself`);
    }
  });

  it('accounts for every PRODUCT_TABLES family — routed or declared a gap', () => {
    const routed = new Set(
      DESIGN_LAB_VIEWPOINTS.map((v) => v.tableId).filter((id): id is string => Boolean(id)),
    );
    const declaredGaps = new Set(Object.keys(DESK_TABLES_WITHOUT_ROUTE));

    for (const tableId of productTableIds()) {
      assert.ok(
        routed.has(tableId) || declaredGaps.has(tableId),
        `product table "${tableId}" is neither routed in the Design Lab nor listed in DESK_TABLES_WITHOUT_ROUTE`,
      );
    }

    const known = new Set(productTableIds());
    for (const tableId of routed) {
      assert.ok(known.has(tableId), `viewpoint claims unknown tableId "${tableId}"`);
    }
    for (const tableId of declaredGaps) {
      assert.ok(known.has(tableId), `DESK_TABLES_WITHOUT_ROUTE lists unknown tableId "${tableId}"`);
      assert.ok(
        !routed.has(tableId),
        `"${tableId}" is both routed and declared a gap — delete the gap line`,
      );
    }
  });

  it('routes point at real app segments', () => {
    // Static segments only — a dynamic route is exercised via a fixture id and
    // cannot be resolved from the path alone.
    for (const v of DESIGN_LAB_VIEWPOINTS) {
      if (v.route === '/' || v.route.includes('[')) continue;
      const segments = v.route.slice(1).split('/');
      const direct = join(ROOT, 'src/app', ...segments, 'page.tsx');
      if (existsSync(direct)) continue;
      // Route groups are transparent in the URL — `/shipping/orders` lives at
      // `shipping/(desk)/orders`, `/m/home` at `m/(shell)/home`.
      const anyGroup = ['(desk)', '(shell)', '(immersive)'].some((group) =>
        existsSync(join(ROOT, 'src/app', segments[0], group, ...segments.slice(1), 'page.tsx')),
      );
      assert.ok(anyGroup, `${v.id}: no page.tsx for route ${v.route}`);
    }
  });
});

describe('design-lab gate', () => {
  it('provisions the flag on the QA tenant', () => {
    assert.ok(
      QA_FEATURE_FLAGS.includes(DESIGN_LAB_FLAG),
      'design_lab must be in QA_FEATURE_FLAGS or provisioning never turns the lab on',
    );
  });
});

describe('reskin token layer', () => {
  it('an empty selection is the null layer', () => {
    assert.deepEqual(parseReskinSelection('before'), []);
    assert.deepEqual(parseReskinSelection('nonsense'), []);
    assert.deepEqual(parseReskinSelection(null), []);
    assert.deepEqual(parseReskinSelection(''), []);
    const css = reskinRegistryCssText();
    assert.ok(
      !css.includes("='before']"),
      'before must emit no CSS — it is today’s tokens, not a frozen copy',
    );
  });

  it('the alias expands to every group, and parsing is canonical', () => {
    assert.deepEqual(parseReskinSelection(RESKIN_ALL_ALIAS), [...RESKIN_GROUP_IDS]);
    // Order in, order out: two equivalent selections must stamp identical markup.
    const scrambled = [...RESKIN_GROUP_IDS].reverse().join(' ');
    assert.equal(serializeReskinSelection(parseReskinSelection(scrambled)), RESKIN_GROUP_IDS.join(' '));
    // Separators a human or a URL encoder might produce all work.
    assert.deepEqual(parseReskinSelection('rules,chrome'), ['chrome', 'rules']);
    assert.deepEqual(parseReskinSelection('rules+chrome'), ['chrome', 'rules']);
    // An unknown id degrades to fewer groups rather than throwing.
    assert.deepEqual(parseReskinSelection('chrome ghosts'), ['chrome']);
  });

  it('groups are DISJOINT — no key is owned twice', () => {
    // A key in two groups makes the painted value depend on emission order, so
    // "chrome" and "chrome + rules" could differ for a reason nobody can see.
    for (const key of THEME_VAR_KEYS) {
      const owners = RESKIN_GROUPS.filter(
        (g) => g.lightVars?.[key] !== undefined || g.darkVars?.[key] !== undefined,
      ).map((g) => g.id);
      assert.ok(owners.length <= 1, `--ds-color-${key} is claimed by ${owners.join(' and ')}`);
      if (owners.length === 1) assert.equal(groupKeyOwner(key), owners[0]);
    }
  });

  it('every group emits scheme-scoped blocks that outrank the theme block', () => {
    const css = reskinRegistryCssText();
    for (const group of RESKIN_GROUPS) {
      // A texture-only group (no theme keys) emits ground rules instead of var
      // blocks. It is still scheme-scoped; it just scopes a `body` rule.
      const varsOnly = Boolean(group.lightVars || group.darkVars || group.lightAccent ||
        group.darkAccent || group.lightPage || group.darkPage);
      if (!varsOnly) {
        assert.ok(
          css.includes(`html[${RESKIN_ATTR}~='${group.id}']:not([data-color-scheme='dark']) body {`),
          `${group.id}: texture group must scope its ground rule away from dark`,
        );
        assert.ok(
          css.includes(`html[${RESKIN_ATTR}~='${group.id}'][data-color-scheme='dark'] body {`),
          `${group.id}: missing dark ground rule`,
        );
        // Texture belongs on the ground plane. A rule that reaches past `body`
        // would put grain behind data rows, which is the one thing it must not do.
        const groundRules = css
          .split('\n\n')
          .filter((b) => b.startsWith(`html[${RESKIN_ATTR}~='${group.id}']`));
        for (const rule of groundRules) {
          assert.ok(
            rule.includes(' body {'),
            `${group.id}: texture may only target body — found ${rule.split('\n')[0]}`,
          );
        }
        continue;
      }
      // The light block MUST be scheme-scoped. An unscoped block pushes light
      // values onto every dark theme for any key the dark half does not
      // restate — dark-slate body text on a near-black canvas.
      assert.ok(
        css.includes(`html[${RESKIN_ATTR}~='${group.id}']:not([data-color-scheme='dark']) {`),
        `${group.id}: light block must be scoped away from dark schemes`,
      );
      assert.ok(
        !css.includes(`html[${RESKIN_ATTR}~='${group.id}'] {`),
        `${group.id}: an unscoped block would leak light values into dark themes`,
      );
      assert.ok(
        css.includes(`html[${RESKIN_ATTR}~='${group.id}'][data-color-scheme='dark'] {`),
        `${group.id}: missing dark block`,
      );
    }
    // Every declaration is a real token, never a raw hex on a class.
    for (const line of css.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('--')) continue;
      assert.ok(
        /^--(ds-color-[a-z-]+|background|foreground):/.test(trimmed),
        `reskin emitted a non-token declaration: ${trimmed}`,
      );
    }
  });

  it('every group carries a label, a note, and something to prove', () => {
    for (const group of RESKIN_GROUPS) {
      assert.ok(group.label.length > 0, `${group.id}: needs a label`);
      assert.ok(group.note.length > 0, `${group.id}: a toggle with no note is decor`);
      const moves =
        Object.keys(group.lightVars ?? {}).length +
        Object.keys(group.darkVars ?? {}).length +
        Object.keys(group.lightAccent ?? {}).length +
        Object.keys(group.darkAccent ?? {}).length +
        Object.keys(group.lightPage ?? {}).length +
        Object.keys(group.darkPage ?? {}).length +
        (group.lightGround ? 1 : 0) +
        (group.darkGround ? 1 : 0);
      assert.ok(moves > 0, `${group.id} moves nothing — retire the group`);
      assert.ok(reskinGroupSize(group) > 0, `${group.id}: HUD would show a zero count`);
    }
    assert.ok(reskinChangedKeys().length > 0, 'the candidate moves nothing — retire it');
  });

  it('each scheme carries its own values — nothing is inherited across the line', () => {
    // The failure this guards is a dark theme silently wearing a LIGHT value.
    const css = reskinRegistryCssText();
    for (const group of RESKIN_GROUPS) {
      const darkStart = css.indexOf(`html[${RESKIN_ATTR}~='${group.id}'][data-color-scheme='dark'] {`);
      if (darkStart < 0) continue;
      const darkBlock = css.slice(darkStart, css.indexOf('}', darkStart));
      for (const value of Object.values(group.lightVars ?? {})) {
        if (value === undefined) continue;
        assert.ok(
          !darkBlock.includes(`: ${value};`),
          `${group.id}: dark reuses the light value ${value}`,
        );
      }
    }
  });

  it('boot script only knows registered group ids', () => {
    assert.ok(RESKIN_BOOT_SCRIPT.includes(JSON.stringify(RESKIN_GROUP_IDS)));
    assert.ok(RESKIN_BOOT_SCRIPT.includes('window.top===window.self'));
    assert.ok(
      RESKIN_BOOT_SCRIPT.includes(RESKIN_ALL_ALIAS),
      'boot must honour the alias or an ?reskin=after deep link paints nothing',
    );
  });

  it('withReskinParam round-trips and drops the param for an empty selection', () => {
    assert.equal(withReskinParam('/pack', RESKIN_ALL_ALIAS), '/pack?reskin=after');
    assert.equal(withReskinParam('/pack', [...RESKIN_GROUP_IDS]), '/pack?reskin=after');
    assert.equal(withReskinParam('/pack', ['chrome', 'rules']), '/pack?reskin=chrome+rules');
    assert.equal(withReskinParam('/pack?reskin=after', []), '/pack');
    assert.equal(withReskinParam('/pack?tab=a', RESKIN_ALL_ALIAS), '/pack?tab=a&reskin=after');
    assert.equal(withReskinParam('/pack#row', RESKIN_ALL_ALIAS), '/pack?reskin=after#row');
  });
});
