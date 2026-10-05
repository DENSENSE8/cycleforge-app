/**
 * Inventory › Locations › Racks — movable racks as multi-height record cards
 * (the desk face of the phone's `/m/racks`). One card per rack: `Rack 12 ·
 * RK12` → where it stands now (the room derived up `parent_id`, never printed)
 * · shelf count · arrival shelves; the top-right is when it last moved. Racks
 * carry no workflow, so no next step. The room filter is the sidebar's Room facet (`inventory.racks`).
 *
 * Not in `TRIAGE_VIEWS`: the Racks tool is a `?tab=` of Locations, not a nav
 * view, so there is no `page.view` id to check against.
 */

import { triageView } from '@/design-system/components/triage-card-list/triage-view';

export const LOCATIONS_RACKS_VIEW = triageView({
  id: 'locations.racks',
  grain: 'rack',
  noun: { one: 'rack', many: 'racks' },
  listLabel: 'Racks',
  testIdPrefix: 'rack-card',
  bodyTestId: 'rack-cards',
  storageKeys: { pageMode: 'cf:rack-cards:page-mode', scrollTop: 'cf:rack-cards:scroll-top' },
  recordParams: ['code', 'new'],
  chips: { owner: 'face', param: 'cardStatus' },
  paging: 'client',
  status: 'date',
  slots: { identity: 'rack number · code', channel: 'none', person: 'none', quickLook: 'none', photo: 'none' },
  facts: [
    { id: 'shelves', tier: 'always' },
    { id: 'arrival', tier: 'always' },
  ],
  sections: null,
  next: [],
});
