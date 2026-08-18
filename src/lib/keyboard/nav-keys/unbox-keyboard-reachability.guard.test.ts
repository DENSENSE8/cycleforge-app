/**
 * Unbox keyboard reachability matrix — every actionable surface an operator
 * must reach without a mouse has a declared path (nav-keys letter, chord, or
 * orthogonal arrow). Telemetry / KPI are intentionally excluded.
 *
 *   node --import tsx --test src/lib/keyboard/nav-keys/unbox-keyboard-reachability.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DISPLAY_LEAF_NAV_KEY } from '@/components/station/displays/display-index';
import { UNBOX_BAND3_NAV_KEY } from '@/lib/receiving/unbox-band3-nav-keys';
import { UNBOX_MIDDLE_CARTON_NAV_KEY } from '@/lib/receiving/unbox-middle-carton-nav-keys';

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const read = (rel: string) =>
  stripComments(readFileSync(join(process.cwd(), rel), 'utf8'));

/** Surfaces that MUST stay keyboard-reachable on Unbox. */
const REACHABILITY: {
  surface: string;
  path: string;
  evidence: RegExp | (() => void);
}[] = [
  {
    surface: 'Left recent carton',
    path: '⌘; l → letter (SidebarRailShell navRegionId=left)',
    evidence: () => {
      const src = read('src/components/sidebar/SidebarRailShell.tsx');
      assert.match(src, /navRegionId/);
    },
  },
  {
    surface: 'Station scan bar — next carton',
    path: '⌘. / Ctrl+. clear + focus (scan-hotkey armNext)',
    evidence: () => {
      const src = read('src/lib/scan-hotkey/store.ts');
      assert.match(src, /isNextScanChord/);
      assert.match(src, /armNext/);
      assert.match(src, /Period/);
    },
  },
  {
    surface: 'Station scan bar — reclaim',
    path: 'Insert / F-key focus (scan-hotkey)',
    evidence: () => {
      const src = read('src/lib/scan-hotkey/store.ts');
      assert.match(src, /focusTopTarget|FOCUS_SCAN|getHotkey/);
    },
  },
  {
    surface: 'Band 3 find / refine (browse)',
    path: '⌘; m → f / r',
    evidence: () => {
      assert.equal(UNBOX_BAND3_NAV_KEY.find, 'f');
      assert.equal(UNBOX_BAND3_NAV_KEY.refine, 'r');
    },
  },
  {
    surface: 'Middle scan focus (carton open)',
    path: '⌘; m → s',
    evidence: () => {
      assert.equal(UNBOX_MIDDLE_CARTON_NAV_KEY.scan, 's');
    },
  },
  {
    surface: 'Middle PO ledger → dock step',
    path: '⌘; m → n / c / h',
    evidence: () => {
      assert.equal(UNBOX_MIDDLE_CARTON_NAV_KEY.serial, 'n');
      assert.equal(UNBOX_MIDDLE_CARTON_NAV_KEY.condition, 'c');
      assert.equal(UNBOX_MIDDLE_CARTON_NAV_KEY.photos, 'h');
    },
  },
  {
    surface: 'Middle dock CTA / Print·Receive',
    path: '⌘; m → a / p / e',
    evidence: () => {
      assert.equal(UNBOX_MIDDLE_CARTON_NAV_KEY.cta, 'a');
      assert.equal(UNBOX_MIDDLE_CARTON_NAV_KEY.print, 'p');
      assert.equal(UNBOX_MIDDLE_CARTON_NAV_KEY.receive, 'e');
    },
  },
  {
    surface: 'Procedure pager',
    path: '← → (Middle owns keyboard)',
    evidence: () => {
      const src = read(
        'src/components/receiving/workspace/line-edit/useUnboxProcedureArrowKeys.ts',
      );
      assert.match(src, /ArrowLeft/);
      assert.match(src, /ArrowRight/);
    },
  },
  {
    surface: 'Displays open / close',
    path: 'Cmd+]',
    evidence: () => {
      const src = read(
        'src/components/station/displays/displays-toggle-hotkey.ts',
      );
      assert.match(src, /BracketRight/);
      assert.match(src, /metaKey|ctrlKey/);
    },
  },
  {
    surface: 'Displays index leaves',
    path: '⌘; r → DISPLAY_LEAF_NAV_KEY',
    evidence: () => {
      assert.ok(DISPLAY_LEAF_NAV_KEY.photos);
      assert.ok(DISPLAY_LEAF_NAV_KEY.checklist);
      assert.ok(DISPLAY_LEAF_NAV_KEY.manuals);
    },
  },
  {
    surface: 'Displays verb commit (Photos / Units / Linkage)',
    path: '↑↓ Enter + second-layer letters via useNavRegion(right)',
    evidence: () => {
      const photos = read(
        'src/components/receiving/workspace/line-edit/PhotosActionsArmedList.tsx',
      );
      const verbs = read(
        'src/components/station/displays/StationArmedVerbList.tsx',
      );
      assert.match(photos, /useNavRegion|PHOTO_VERB_NAV_KEY|preferredKey/);
      assert.match(verbs, /useNavRegion|preferredKey/);
    },
  },
];

describe('Unbox keyboard reachability matrix', () => {
  for (const row of REACHABILITY) {
    it(`${row.surface} — ${row.path}`, () => {
      if (typeof row.evidence === 'function') row.evidence();
      else {
        // unused branch — evidence is always a fn above
      }
    });
  }

  it('Middle carton-open keys do not collide with Band 3 browse keys', () => {
    const band3 = new Set(Object.values(UNBOX_BAND3_NAV_KEY));
    for (const [id, key] of Object.entries(UNBOX_MIDDLE_CARTON_NAV_KEY)) {
      assert.equal(
        band3.has(key),
        false,
        `carton-open '${id}'='${key}' collides with Band 3 — mode-split broken`,
      );
    }
  });

  it('LineEditPanel registers Middle carton-open nav (not nulled forever)', () => {
    const src = read('src/components/receiving/workspace/LineEditPanel.tsx');
    assert.match(
      src,
      /useUnboxMiddleCartonNav|UNBOX_MIDDLE_CARTON_NAV_KEY/,
      'carton-open Middle must register via the Unbox Middle hook',
    );
  });

  it('procedure-% is never a nav-key target', () => {
    const progress = read(
      'src/components/receiving/workspace/UnboxScanProgressControl.tsx',
    );
    assert.doesNotMatch(progress, /useNavRegion|preferredKey|NAV_KEY_HINT/);
  });

  it('intentional mouse-only secondaries are documented (notes · carton-hop)', () => {
    // Notes toggle is off on main Unbox (`showNotesToggle={false}`); carton
    // hop chrome stays pointer / Left-recent letter — not Middle letters (v1).
    const panel = read('src/components/receiving/workspace/LineEditPanel.tsx');
    assert.match(panel, /showNotesToggle=\{false\}/);
    assert.match(panel, /ScanStationCartonCursor/);
  });
});
