/**
 * materializeTracks — SlotLayout + FieldCatalog → the grid's column tracks.
 *
 * Plan: `docs/todo/slot-based-metadata-table-PLAN.md` §8.1. This is the ONE
 * place a binding becomes a track. Track keys are SLOT INDICES (`status:1`,
 * `subtitle:2`), never field ids, so rebinding a slot to a different fact
 * keeps every width/pref keyed by that slot intact.
 *
 * The family supplies its chrome skeleton (`base`) — the structural tracks the
 * morph always paints (select · fulfillment · thumb · item · dates · state ·
 * _fill on the compound row). Line money is a subtitle, not a chrome track.
 * The materializer inserts the BOUND
 * bands into it:
 *
 * - **status band** — one track per status binding, keyed `status:N`, labeled
 *   from the field, sized by {@link trackGeometryFor} defaults. Inserted after
 *   `statusAnchorKey` (the compound `state` pill by default — the position the
 *   hand-spliced Slice 1 `tested` track occupied).
 * - **subtitle band** — compound morph paints subtitles INSIDE the item cell,
 *   so no tracks; the sheet morph opens one `subtitle:N` track per binding
 *   (inserted after the item/title anchor).
 *
 * Deviations from the plan's sketch, named for the next family's porter:
 * - The plan draws materializeTracks emitting the gutters itself. Emitting
 *   them here would either fork the chrome geometry (a second declaration of
 *   `COMPOUND_TRACKS`) or point lib code at a component module; passing the
 *   family's skeleton in keeps this pure, keeps the chrome SoT where it
 *   lives, and keeps the materializer family-agnostic.
 * - The plan names an `identity` track key. On the compound morph the
 *   identity slot IS the shared `fulfillment` chrome track (order # over
 *   tracking) — renaming that key would fork it away from Receiving / Tasks /
 *   Incoming, thrash the sort map (`COMPOUND_TRACK_SORT_KEYS`) and staff
 *   width prefs for a rename with no behaviour. `identityFieldId` still
 *   drives WHICH fact the identity cell resolves; only the key differs.
 *
 * A binding whose field the catalog does not know is SKIPPED (defense in
 * depth — `resolveEffectiveLayout` already drops stale bindings). An empty
 * binding array opens no tracks.
 */

import type { ColumnType } from '@/lib/tables/table-columns';
import { catalogById, type FieldCatalog, type FieldDef, type FieldDisplayType } from '@/lib/tables/field-catalog/types';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';

/**
 * The structural shape a materialized track adds to a family's column model.
 * Families extend their own `LedgerGridColumnModel`-derived interface with
 * {@link SlotTrackFields} so the row renderer can resolve the cell's facts.
 */
export interface SlotTrackFields {
  /**
   * The catalog field bound into this slot — how the row resolver knows WHAT
   * to paint in the track. The KEY stays the slot index; this is metadata.
   */
  fieldId?: string;
  /** Glyph key for `stage_event` cells, copied from the field. */
  slotIconKey?: string;
  /** The bound field's display type — the cell branches on this, never on id. */
  slotDisplayType?: FieldDisplayType;
  /** `stage_event` verb faces (done/pending), copied from the field. */
  slotStageLabels?: Readonly<{ done: string; pending: string }>;
}

/**
 * The minimum column shape the materializer reads and writes. Every family
 * column interface in the repo satisfies it structurally.
 */
export interface MaterializableTrack extends SlotTrackFields {
  key: string;
  width: string;
  label?: string;
  gridLabel?: string;
  labelFitRem?: number;
  type?: ColumnType;
  align?: 'start' | 'end' | 'center';
  resizable?: boolean;
  minTrackRem?: number;
  sortable?: boolean;
}

/**
 * Default geometry per display type. Widths mirror the hand-tuned tracks the
 * bindings replace (`stage_event` is the Slice 1 tested track's 9rem) and the
 * flat orders columns for the rest — measured values, not guesses.
 */
export function trackGeometryFor(displayType: FieldDisplayType): {
  width: string;
  type: ColumnType;
  align?: 'start' | 'end' | 'center';
  minTrackRem?: number;
  labelFitRem: number;
  resizable: boolean;
} {
  switch (displayType) {
    case 'stage_event':
      // 8rem (operator ruling 2026-08-31, down from 10). The stamp line is the
      // widest fact a step can hold, but it is the SECOND line and it truncates
      // gracefully; three status columns at 10rem spent 30rem of a 72rem sheet
      // on two words and a timestamp each, and the gaps between them read as
      // gutters rather than as columns of one table. The floor drops with the
      // default so a drag can still recover the old width per staffer.
      return { width: 'minmax(8rem, 8rem)', type: 'text', align: 'start', minTrackRem: 6.5, labelFitRem: 5, resizable: true };
    case 'tag':
      return { width: 'minmax(5.5rem, 5.5rem)', type: 'tag', align: 'start', labelFitRem: 4.5, resizable: false };
    case 'date':
      return { width: 'minmax(7rem, 7rem)', type: 'date', labelFitRem: 4.5, resizable: false };
    case 'person':
      // Avatar mark + truncated name — wider than a plain tag chip.
      return { width: 'minmax(8rem, 9rem)', type: 'text', align: 'start', labelFitRem: 5, resizable: true };
    case 'number':
      return { width: 'minmax(3.5rem, 3.5rem)', type: 'number', labelFitRem: 3.5, resizable: false };
    case 'money':
      return { width: 'minmax(7rem, 7rem)', type: 'price', align: 'end', labelFitRem: 4.5, resizable: false };
    case 'note':
      return { width: 'minmax(8rem, 8rem)', type: 'longtext', minTrackRem: 6, labelFitRem: 5, resizable: true };
    case 'tracking':
      return { width: 'minmax(5.5rem, 5.5rem)', type: 'tracking', labelFitRem: 5.5, resizable: false };
    case 'id':
      return { width: 'minmax(5.5rem, 5.5rem)', type: 'id', align: 'start', labelFitRem: 4.5, resizable: false };
    case 'text':
      return { width: 'minmax(8rem, 8rem)', type: 'text', minTrackRem: 6, labelFitRem: 5, resizable: true };
  }
}

function slotTrack<C extends MaterializableTrack>(key: string, field: FieldDef): C {
  const geometry = trackGeometryFor(field.displayType);
  return {
    key,
    width: geometry.width,
    label: field.label,
    gridLabel: field.label,
    type: geometry.type,
    ...(geometry.align ? { align: geometry.align } : null),
    ...(geometry.minTrackRem ? { minTrackRem: geometry.minTrackRem } : null),
    labelFitRem: geometry.labelFitRem,
    resizable: geometry.resizable,
    fieldId: field.id,
    ...(field.iconKey ? { slotIconKey: field.iconKey } : null),
    ...(field.stageLabels ? { slotStageLabels: field.stageLabels } : null),
    slotDisplayType: field.displayType,
  } as C;
}

export interface MaterializeTracksArgs<C extends MaterializableTrack> {
  layout: SlotLayout;
  catalog: FieldCatalog;
  /** The family's structural skeleton for this morph, in paint order. */
  base: readonly C[];
  /** Status band inserts AFTER this base key. Default: the compound `state` pill. */
  statusAnchorKey?: string;
  /** Sheet-morph subtitle band inserts AFTER this base key. Default: `item`. */
  subtitleAnchorKey?: string;
}

function insertAfter<C extends MaterializableTrack>(
  tracks: readonly C[],
  anchorKey: string,
  band: readonly C[],
): readonly C[] {
  // Empty band MUST return the same array reference so product-default
  // compound mounts stay `=== COMPOUND_TRACKS` (compound-row-model guard).
  if (band.length === 0) return tracks;
  const at = tracks.findIndex((t) => t.key === anchorKey);
  if (at < 0) {
    throw new Error(`materializeTracks: anchor '${anchorKey}' is not in the base skeleton`);
  }
  return [...tracks.slice(0, at + 1), ...band, ...tracks.slice(at + 1)];
}

/**
 * Build the mounted track list. Pure; stable output for stable input.
 */
export function materializeTracks<C extends MaterializableTrack>({
  layout,
  catalog,
  base,
  statusAnchorKey = 'state',
  subtitleAnchorKey = 'item',
}: MaterializeTracksArgs<C>): readonly C[] {
  const byId = catalogById(catalog);
  const collision = base.find(
    (t) => t.key.startsWith('status:') || t.key.startsWith('subtitle:'),
  );
  if (collision) {
    throw new Error(
      `materializeTracks: base skeleton already carries slot track '${collision.key}' — ` +
        'slot bands are materialized, never hand-spliced',
    );
  }

  const bindingTracks = (
    bindings: SlotLayout['statusBindings'],
    prefix: 'status' | 'subtitle',
  ): C[] => {
    const tracks: C[] = [];
    for (const binding of bindings) {
      const field = byId.get(binding.fieldId);
      if (!field) continue; // stale binding — resolver normally drops these
      // Slot index AFTER skips, so the painted band is dense and the keys
      // stay `status:1..N` for the tracks that actually mounted.
      tracks.push(slotTrack<C>(`${prefix}:${tracks.length + 1}`, field));
    }
    return tracks;
  };

  const withStatus = insertAfter(base, statusAnchorKey, bindingTracks(layout.statusBindings, 'status'));

  // Compound paints subtitles inside the item cell; only the sheet morph opens
  // subtitle tracks.
  if (layout.morph !== 'sheet') return withStatus;
  return insertAfter(withStatus, subtitleAnchorKey, bindingTracks(layout.subtitleBindings, 'subtitle'));
}

/** Is this track key a materialized slot track? */
export function isSlotTrackKey(key: string): boolean {
  return key.startsWith('status:') || key.startsWith('subtitle:');
}
