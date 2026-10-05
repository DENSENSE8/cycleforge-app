/**
 * Print station › Stations — the managing mode (owner 2026-10-04): every org
 * print station on one line, read left to right: Online / Offline · name ·
 * its label and paper printers · what it prints by default · who was last at
 * it · when it was last heard. The open station (`?station=`) renames it, sets
 * the org default per stock and sends a test print. One-row density only.
 *
 * Not in `TRIAGE_VIEWS`, like FNSKU labels: the Stations mode has no nav views
 * (no server scope), so there is no `page.view` id to check against.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';
import { PRINT_STATIONS_STATION_PARAM } from '@/lib/print-station/stations';

export const PRINT_STATIONS_VIEW = triageView({
  id: 'print-station.stations',
  grain: 'print station',
  noun: { one: 'station', many: 'stations' },
  listLabel: 'Stations',
  testIdPrefix: 'print-station-row',
  bodyTestId: 'print-station-rows',
  storageKeys: { pageMode: 'cf:print-station-rows:page-mode', scrollTop: 'cf:print-station-rows:scroll-top' },
  recordParams: [PRINT_STATIONS_STATION_PARAM],
  chips: { owner: 'face', param: 'cardStatus' },
  paging: 'client',
  status: 'state',
  slots: { identity: 'station name', channel: 'none', person: 'none', quickLook: 'none', photo: 'none' },
  facts: [
    { id: 'default', tier: 'always' },
    { id: 'who', tier: 'always' },
    { id: 'seen', tier: 'always' },
  ],
  sections: null,
  next: [],
});
