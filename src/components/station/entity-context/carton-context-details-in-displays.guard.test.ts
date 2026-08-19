/**
 * Carton / station secondary detail lives in **Displays** — never under the
 * middle identity band or centre work plane as a "Show details" expander.
 *
 * WHY
 * Progressive disclosure for exact triage (full IDs, qty rollups, lineage,
 * exception routing, diagnostics) belongs in the right-edge Displays column
 * (`StationDisplaysPushStack`). Stuffing that under `CartonContextCard` /
 * the centre column truncates facts, fights scan muscle memory, and forks a
 * third surface beside Displays + desk inspectors.
 *
 * This guard bans the anti-pattern (header/middle detail disclosure) and
 * pins that every Unbox-family station still composes Displays for secondary
 * reference / triage tools.
 *
 * Run: `npx tsx --test src/components/station/entity-context/carton-context-details-in-displays.guard.test.ts`
 *
 * @see .claude/rules/source-of-truth.md → Displays vs inspector · Station entity-context
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

/** Identity / middle surfaces that must stay Level-0 only. */
const MIDDLE_IDENTITY_FILES = [
  'src/components/station/entity-context/CartonContextCard.tsx',
  'src/components/station/entity-context/StationContextBar.tsx',
  'src/components/receiving/workspace/line-edit/LineCartonContextSection.tsx',
  'src/components/tech/testing-panel/TestingCartonHeader.tsx',
  'src/components/tech/shipping/ShippingEntityContextHeader.tsx',
  'src/components/packer/PackOrderIdentity.tsx',
] as const;

/**
 * Phrases / symbols that mean "secondary detail disclosure under identity /
 * middle" — the pattern this guard exists to kill.
 */
const BANNED_MIDDLE_DETAIL = [
  {
    re: /CartonContextLevel1/,
    why: 'CartonContextLevel1 under identity — secondary detail belongs in Displays',
  },
  {
    re: /carton-context-level1/,
    why: 'Level-1 carton-context test ids under identity',
  },
  {
    re: /Show details/i,
    why: '"Show details" CTA on identity / middle — open Displays instead',
  },
  {
    re: /SHOW DETAILS/,
    why: 'SHOW DETAILS expander on identity / middle',
  },
  {
    re: /Exception · Unfound|Exception · Claim open|exception routing/i,
    why: 'exception-routing copy under identity — route via Displays (Claim / Classify / Linkage)',
  },
] as const;

/** Stations that must keep secondary triage on Displays push. */
const DISPLAYS_STATIONS: { name: string; file: string }[] = [
  {
    name: 'Unbox',
    file: 'src/components/receiving/workspace/LineEditPanel.tsx',
  },
  {
    name: 'Arrival',
    file: 'src/components/receiving/triage/TriagePanel.tsx',
  },
  {
    name: 'Testing',
    file: 'src/components/tech/TestingPanel.tsx',
  },
  {
    name: 'Pack',
    file: 'src/components/packer/PackOrderPanel.tsx',
  },
  {
    name: 'Shipping',
    file: 'src/components/tech/ActiveOrderWorkspace.tsx',
  },
  {
    name: 'Packer review',
    file: 'src/features/review/packer/PackerReviewMode.tsx',
  },
];

describe('carton-context-details-in-displays', () => {
  it('CartonContextLevel1 module stays deleted (no middle disclosure twin)', () => {
    assert.equal(
      existsSync(
        join(ROOT, 'src/components/station/entity-context/CartonContextLevel1.tsx'),
      ),
      false,
      'Do not reintroduce CartonContextLevel1 — put exact triage detail in Displays',
    );
  });

  it('identity / middle adapters never host Show-details / Level-1 disclosure', () => {
    const offenders: string[] = [];
    for (const file of MIDDLE_IDENTITY_FILES) {
      if (!existsSync(join(ROOT, file))) continue;
      const src = code(file);
      for (const ban of BANNED_MIDDLE_DETAIL) {
        if (ban.re.test(src)) {
          offenders.push(`${file}: ${ban.why}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `Secondary detail disclosure leaked into middle identity:\n${offenders.join('\n')}`,
    );
  });

  it('CartonContextCard stays a one-row face — no collapseHeight detail drawer under it', () => {
    const card = code(
      'src/components/station/entity-context/CartonContextCard.tsx',
    );
    // The two-row face was retired by `da4736740`; this guard kept asserting it
    // and so failed on every run instead of guarding the drawer ban below.
    assert.match(
      card,
      /carton-context-one-row/,
      'CartonContextCard must keep the one-row identity face',
    );
    assert.doesNotMatch(
      card,
      /framerPresence\.collapseHeight/,
      'identity must not use collapseHeight for a detail drawer — that grammar is for centre bodies (e.g. Show label) or Displays, not under the carton face',
    );
    assert.doesNotMatch(
      card,
      /Show details|SHOW DETAILS|CartonContextLevel1/i,
      'no Show details / Level1 under CartonContextCard',
    );
  });

  it('every Unbox-family station composes StationDisplaysPushStack for secondary detail', () => {
    for (const station of DISPLAYS_STATIONS) {
      const src = code(station.file);
      assert.match(
        src,
        /StationDisplaysPushStack/,
        `${station.name} (${station.file}) must compose StationDisplaysPushStack — secondary / exact triage detail opens in Displays, not under carton identity`,
      );
    }
  });

  it('Unbox Displays index remains the gateway for secondary tools (not identity)', () => {
    const index = code(
      'src/components/receiving/workspace/line-edit/unbox-display-index.ts',
    );
    const tabs = code(
      'src/components/receiving/workspace/line-edit/unbox-side-tabs.ts',
    );
    // At least the reference / triage leaves that hold exact detail.
    for (const leaf of ['linkage', 'inventory', 'ticket', 'photos'] as const) {
      assert.match(
        tabs,
        new RegExp(`'${leaf}'`),
        `Unbox side-tab union must keep '${leaf}' as a Displays leaf for exact detail`,
      );
    }
    assert.match(
      index,
      /buildUnboxDisplayIndexRows|DisplayIndexRow|index/,
      'Unbox must keep a Displays index builder — operators open exact detail from Displays, not the middle header',
    );
  });
});
