/**
 * Station Displays — **every declared display must be reachable**.
 *
 * WHY THIS EXISTS
 * A `navMode="leaf"` variant rendered one leaf and no Root Index, so the column
 * had no switcher at all: `onTabChange` was threaded in but nothing inside the
 * column ever called it. On 2026-08-07 Pack declared `ticket · photos ·
 * support · timeline` and an operator could open exactly one of them (Shipping
 * 1 of 2, Packer review 1 of 3) — the rest unreachable from anywhere in the app.
 *
 * Every guard was green through all of it, because they asserted the *mode*
 * (`navMode="leaf"` is present) rather than the operator-facing contract (every
 * display this station declares can be opened). This file asserts the contract.
 *
 * The mode is now DELETED — one Root-to-Leaf grammar, so reachability holds by
 * construction and this guard's job is to keep it that way: the prop must not
 * come back, the edge toggle must land the index on a multi-display station,
 * and no resolver may fall back to `displayTabs[0]`.
 *
 * A `displayTabs[0]` fallback is banned for the same reason: a requested leaf
 * that gates away must fall back to the INDEX, never silently swap in an
 * unrelated display.
 *
 *   node --import tsx --test src/components/station/displays/station-displays-reachability.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

/**
 * Every panel that mounts the shared push stack, with the union type that
 * declares its displays. A new adopter adds a row here — an adopter with no row
 * is caught by the census test at the bottom.
 */
const STATIONS: { name: string; file: string; union: string }[] = [
  {
    name: 'Unbox',
    file: 'src/components/receiving/workspace/LineEditPanel.tsx',
    union: 'src/components/receiving/workspace/line-edit/unbox-side-tabs.ts',
  },
  {
    name: 'Arrival',
    file: 'src/components/receiving/triage/TriagePanel.tsx',
    union: 'src/components/receiving/triage/build-triage-displays.tsx',
  },
  {
    name: 'Testing',
    file: 'src/components/tech/TestingPanel.tsx',
    union: 'src/components/tech/testing-panel/build-testing-displays.tsx',
  },
  {
    name: 'Pack',
    file: 'src/components/packer/PackOrderPanel.tsx',
    union: 'src/components/packer/PackOrderPanel.tsx',
  },
  {
    name: 'Shipping',
    file: 'src/components/tech/ActiveOrderWorkspace.tsx',
    union: 'src/components/tech/ActiveOrderWorkspace.tsx',
  },
  {
    name: 'Packer review',
    file: 'src/features/review/packer/PackerReviewMode.tsx',
    union: 'src/features/review/packer/PackerReviewMode.tsx',
  },
];

/** Count the string literals in the station's `…DisplayTab` / `…SideTab` union. */
function countDeclaredDisplays(src: string): number {
  const m = src.match(/type\s+\w*(?:DisplayTab|SideTab)\s*=\s*([\s\S]*?);/);
  if (!m?.[1]) return 0;
  return (m[1].match(/'[^']+'/g) ?? []).length;
}

describe('Station Displays — every declared display is reachable', () => {
  for (const station of STATIONS) {
    it(`${station.name} mounts a switcher for every display it declares`, () => {
      const panel = read(station.file);
      const declared = countDeclaredDisplays(read(station.union));

      assert.ok(declared > 0, `${station.name}: could not read a display union`);
      assert.match(
        panel,
        /<StationDisplaysPushStack/,
        `${station.name} must mount the shared Displays SoT`,
      );

      assert.doesNotMatch(
        panel,
        /navMode/,
        `${station.name}: navMode was deleted — one Root-to-Leaf grammar. A ` +
          'leaf-only column renders no switcher, which stranded 9 displays ' +
          'across three stations the day it shipped.',
      );
    });

    it(`${station.name} opens the Root Index from the pane edge toggle`, () => {
      const panel = read(station.file);
      const declared = countDeclaredDisplays(read(station.union));
      // A one-display station SHOULD land its single leaf directly — an index
      // with one row is a tap that teaches nothing (Arrival · Pairing only).
      if (declared <= 1) return;
      assert.match(
        panel,
        /on(?:Click|OpenDisplays)=\{open\w*Index\}/,
        `${station.name}: \`←|\` Open displays must land the Root Index, not a guessed ` +
          'leaf — with 2+ displays a guess IS the whole surface',
      );
    });

    it(`${station.name} falls back to the index, never displayTabs[0]`, () => {
      const panel = read(station.file);
      assert.doesNotMatch(
        panel,
        /return\s*\(?displayTabs\[0\]/,
        `${station.name}: a gated-away leaf must resolve to the index — swapping in ` +
          'an unrelated display is the failure the index exists to prevent',
      );
    });
  }

  it('the census covers every panel that mounts the push stack', () => {
    // A new adopter must join STATIONS above, or its reachability is unchecked.
    const listed = new Set(STATIONS.map((s) => s.file));
    // Known non-panel mounts: the SoT module itself, guards, and the design demo.
    const exempt = [
      'src/components/station/displays/',
      'src/app/design-demo/',
      '.guard.test.ts',
    ];
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    const hits = execSync('grep -rl "<StationDisplaysPushStack" src/ || true', {
      encoding: 'utf8',
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((f) => !exempt.some((e) => f.includes(e)));

    for (const f of hits) {
      assert.ok(
        listed.has(f),
        `${f} mounts StationDisplaysPushStack but is not in the STATIONS census — ` +
          'add it so its displays are checked for reachability',
      );
    }
  });
});
