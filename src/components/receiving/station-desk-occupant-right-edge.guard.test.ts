/**
 * Guard — a DESK occupant of `RightRailHost` and the station Displays column
 * never both push the right edge (source-of-truth → Right-rail modality: one
 * wrapper, one occupant; opening one REPLACES the other).
 *
 * **Why this is a list and not two assertions about one overlay.** It used to
 * pin Add inbound alone, because Add was the only Band-1 tool that mounted on
 * `RightRailHost` from a station page. When **Check receipts** arrived it joined
 * neither half of the exclusion, and nothing here could notice: the guard named
 * a panel rather than the ROLE. It shipped as a second full right column beside
 * the Unbox cockpit's Displays (bench report 2026-08-10). So the occupants are
 * enumerated, and each must hold BOTH halves:
 *
 *   1. `yieldStationRightEdgeForDeskOccupant` as it opens — take the edge.
 *   2. a `STATION_DESK_OCCUPANT_CLOSE_EVENT` listener — give the edge back.
 *
 * A new Band-1 tool that opens on `RightRailHost` over a station adds its row
 * here. The end-to-end proof that the two never paint together is
 * `tests/e2e/station-right-edge-one-wrapper.spec.ts` — this guard is the cheap
 * static half that fails in `npm run verify` rather than in a browser.
 *
 * Run: node --import tsx --test src/components/receiving/station-desk-occupant-right-edge.guard.test.ts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Every desk `RightRailHost` occupant reachable from a station surface. */
const DESK_OCCUPANTS_ON_STATIONS = [
  {
    name: 'Add inbound',
    file: 'src/components/sidebar/receiving/incoming/IncomingAddInboundOverlay.tsx',
  },
  {
    name: 'Check receipts / tracking list',
    file: 'src/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel.tsx',
  },
] as const;

describe('desk occupant ↔ station Displays mutual exclusion', () => {
  for (const occupant of DESK_OCCUPANTS_ON_STATIONS) {
    it(`${occupant.name} takes the edge, and gives it back`, () => {
      const src = read(occupant.file);
      assert.match(
        src,
        /yieldStationRightEdgeForDeskOccupant\(/,
        `${occupant.name} must yield Displays / details / AI as it opens`,
      );
      assert.match(
        src,
        /STATION_DESK_OCCUPANT_CLOSE_EVENT/,
        `${occupant.name} must close itself when a peer claims the right edge`,
      );
    });
  }

  it('Unbox Displays opening closes whatever desk occupant holds the edge', () => {
    const view = read(
      'src/components/receiving/workspace/line-edit/hooks/useUnboxDisplayView.ts',
    );
    assert.match(view, /dispatchStationDeskOccupantClose/);
  });

  it('Arrival Displays open closes the occupant; the occupant closes Arrival Displays', () => {
    const panel = read('src/components/receiving/triage/TriagePanel.tsx');
    assert.match(panel, /dispatchStationDeskOccupantClose/);
    assert.match(panel, /STATION_DISPLAYS_CLOSE_EVENT/);
  });

  it('the event is named for the ROLE, not for one panel', () => {
    const events = read('src/utils/events.ts');
    assert.match(events, /export const STATION_DESK_OCCUPANT_CLOSE_EVENT/);
    assert.doesNotMatch(
      events,
      /export const INCOMING_ADD_INBOUND_CLOSE_EVENT/,
      'a panel-specific name is what let the second occupant skip the wrapper',
    );
  });
});
