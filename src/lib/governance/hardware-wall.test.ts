/**
 * Hardware wall — floor (station) vs desk (support) is an interaction-contract
 * firewall. The fork hunter must not treat visual twins across that divide as
 * merge candidates.
 *
 * Runtime SoT: `scripts/hardware-wall.mjs` (consumed by `scripts/jscpd-gate.mjs`).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, describe, it } from 'node:test';

const ROOT = process.cwd();

describe('hardware wall (station vs support)', () => {
  let wall: {
    hardwareSide: (p: string) => 'floor' | 'desk' | null;
    isCrossHardwareClone: (a: string, b: string) => boolean;
    filterHardwareWallClones: (d: Array<{ lines?: number; firstFile?: { name?: string }; secondFile?: { name?: string } }>) => typeof d;
    tallyDuplicates: (d: Array<{ lines?: number }>) => { clones: number; duplicatedLines: number };
  };

  before(async () => {
    wall = await import(pathToFileURL(join(ROOT, 'scripts/hardware-wall.mjs')).href);
  });
  it('classifies station as floor and support as desk', () => {
    assert.equal(wall.hardwareSide('src/components/station/StationListTable.tsx'), 'floor');
    assert.equal(
      wall.hardwareSide('src/components/support/zendesk/SupportTicketChromeActions.tsx'),
      'desk',
    );
    assert.equal(wall.hardwareSide('src/design-system/primitives/Button.tsx'), null);
    assert.equal(wall.hardwareSide('src/lib/orders-sync/client.ts'), null);
  });

  it('flags only pairwise clones that cross the hardware divide', () => {
    assert.equal(
      wall.isCrossHardwareClone(
        'src/components/station/StationListTable.tsx',
        'src/components/support/zendesk/SupportTicketsBoard.tsx',
      ),
      true,
    );
    assert.equal(
      wall.isCrossHardwareClone(
        'src/components/station/StationListTable.tsx',
        'src/components/station/StationHistoryTable.tsx',
      ),
      false,
    );
    assert.equal(
      wall.isCrossHardwareClone(
        'src/components/support/zendesk/SupportTicketChromeActions.tsx',
        'src/components/support/issues/IssuesWorkspace.tsx',
      ),
      false,
    );
    assert.equal(
      wall.isCrossHardwareClone(
        'src/components/station/StationListTable.tsx',
        'src/design-system/components/grid/LedgerGridSurface.tsx',
      ),
      false,
    );
  });

  it('drops cross-hardware duplicates from the clone tally', () => {
    const kept = wall.filterHardwareWallClones([
      {
        lines: 40,
        firstFile: { name: 'src/components/station/A.tsx' },
        secondFile: { name: 'src/components/support/B.tsx' },
      },
      {
        lines: 22,
        firstFile: { name: 'src/components/station/A.tsx' },
        secondFile: { name: 'src/components/station/C.tsx' },
      },
    ]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].secondFile.name, 'src/components/station/C.tsx');
    assert.deepEqual(wall.tallyDuplicates(kept), { clones: 1, duplicatedLines: 22 });
  });

  it('jscpd-gate imports the wall (does not glob-ignore either tree)', () => {
    const gate = readFileSync(join(ROOT, 'scripts/jscpd-gate.mjs'), 'utf8');
    const config = readFileSync(join(ROOT, '.jscpd.json'), 'utf8');
    assert.match(gate, /hardware-wall\.mjs/);
    assert.match(gate, /filterHardwareWallClones/);
    assert.doesNotMatch(
      config,
      /src\/components\/station\/\*\*/,
      'do not glob-ignore station/** — that silences clones inside the floor tree',
    );
    assert.doesNotMatch(
      config,
      /src\/components\/support\/\*\*/,
      'do not glob-ignore support/** — that silences clones inside the desk tree',
    );
  });
});
