/** Build registered DataTable columns from a family's static fact bindings. */

import type { ColumnType } from '@/lib/tables/table-columns';
import { catalogById, type FieldCatalog, type FieldDef, type FieldDisplayType } from '@/lib/tables/field-catalog/types';
import type { DataTableColumnLayout } from '@/lib/tables/data-table-column-layout';

/** Fact metadata added to a family's concrete column model. */
export interface DataTableColumnFields {
  fieldId?: string;
  /** Glyph key for `stage_event` cells, copied from the field. */
  slotIconKey?: string;
  /** The bound field's display type. */
  slotDisplayType?: FieldDisplayType;
  /** `stage_event` verb faces (done/pending), copied from the field. */
  slotStageLabels?: Readonly<{ done: string; pending: string }>;
}

/**
 * The minimum column shape the materializer reads and writes. Every family
 * column interface in the repo satisfies it structurally.
 */
export interface MaterializableTrack extends DataTableColumnFields {
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
      // 8rem (operator ruling 2026-08-31, down from 10).
      // 8rem (operator ruling 2026-08-31, down from 10). The stamp line is the
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

function dataTableTrack<C extends MaterializableTrack>(key: string, field: FieldDef): C {
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

interface MaterializeTracksArgs<C extends MaterializableTrack> {
  layout: DataTableColumnLayout;
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
  // Empty bands preserve the base array reference for stable product defaults.
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
      `materializeTracks: base skeleton already carries bound track '${collision.key}' — ` +
        'bound bands are materialized, never hand-spliced',
    );
  }

  const bindingTracks = (
    bindings: DataTableColumnLayout['statusBindings'],
    prefix: 'status' | 'subtitle',
  ): C[] => {
    const tracks: C[] = [];
    for (const binding of bindings) {
      const field = byId.get(binding.fieldId);
      if (!field) continue; // stale binding — resolver normally drops these
      // Indices follow mounted columns after stale facts are skipped.
      tracks.push(dataTableTrack<C>(`${prefix}:${tracks.length + 1}`, field));
    }
    return tracks;
  };

  const withStatus = insertAfter(base, statusAnchorKey, bindingTracks(layout.statusBindings, 'status'));

  // Contextual rows paint subtitles inside the item cell; sheets use columns.
  if (layout.morph !== 'sheet') return withStatus;
  return insertAfter(withStatus, subtitleAnchorKey, bindingTracks(layout.subtitleBindings, 'subtitle'));
}

/** Whether this key identifies a materialized fact column. */
export function isDataTableBoundColumnKey(key: string): boolean {
  return key.startsWith('status:') || key.startsWith('subtitle:');
}

/** Grandfathered name for existing dogfood cell renderers. */
export const isSlotTrackKey = isDataTableBoundColumnKey;
