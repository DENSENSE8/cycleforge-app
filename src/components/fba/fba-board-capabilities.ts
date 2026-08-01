/**
 * FBA shipment board — declared grid surface capabilities.
 *
 * `FbaBoardTable` mounts the Workbench spreadsheet SoT (`LedgerGrid`,
 * `gridSkin="airtable"`, day bands by due date) but reached it without a
 * declared feature set, which put it outside the one gate that keeps a display
 * surface from growing dispatch chrome.
 *
 * **No `GridSurfaceDescriptor` yet, deliberately.** The board still hand-rolls
 * its track template (`FBA_GRID`) and its header spans instead of composing a
 * house `LedgerGridColumnModel[]`. Authoring a column model here *without*
 * rendering from it would create exactly the stale second declaration
 * `makeGridSurfaceDescriptor` warns about — the model and the template would
 * drift on the first width change. The column model + descriptor are the
 * board's migration wave; the capabilities bag is what it needs now.
 *
 * `fieldsMenu: false` is the honest read: the board has no `GridFieldsMenu` and
 * no `staff_preferences.tableColumns` entry, so every column is structural.
 */

import type { GridSurfaceCapabilities } from '@/design-system/components/grid';

/** FBA board — multi-select + day bands; display only, never triage wash. */
export const FBA_BOARD_GRID_CAPABILITIES: GridSurfaceCapabilities = {
  rowTriageFlags: false,
  multiSelect: true,
  inCellEdit: false,
  fieldsMenu: false,
  dayBands: true,
};
