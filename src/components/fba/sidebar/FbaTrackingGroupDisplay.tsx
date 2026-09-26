'use client';

import type { HTMLAttributes } from 'react';
import { MapPin } from '@/components/Icons';
import { emitOpenQuickAddFnsku } from '@/components/fba/FbaQuickAddFnskuModal';
import { FbaSelectedLineRow } from '@/components/fba/sidebar/FbaSelectedLineRow';
import { FbaQtyStepper, FbaQtyDisplay } from '@/components/fba/sidebar/FbaQtyStepper';
import { TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import type { StationTheme } from '@/utils/staff-colors';
import type { ShipmentCardItem, TrackingBundle } from '@/lib/fba/types';

interface FbaTrackingGroupDisplayProps {
  bundle: TrackingBundle;
  items: ShipmentCardItem[];
  stationTheme: StationTheme;
  /** When true, the qty stepper is interactive (tech / sidebar edit mode). */
  editable?: boolean;
  /** Current qty for an item (applies overrides). */
  getQty?: (item: ShipmentCardItem) => number;
  /** Item-level checkbox state (tech card selection). Omit for pure display. */
  selectedIds?: Set<number>;
  /** Unchecking: toggles selection. Falls back to onRemoveItem if not provided. */
  onCheckedChange?: (itemId: number, next: boolean) => void;
  /** Used when the row checkbox is toggled off and no onCheckedChange given. */
  onRemoveItem?: (item: ShipmentCardItem) => void;
  onAdjustQty?: (item: ShipmentCardItem, delta: number) => void;
  onSetQty?: (item: ShipmentCardItem, qty: number) => void;
  /** When true, rows render with no leading checkbox column (read-only display). */
  hideCheckbox?: boolean;
  /** When `editable`, the tracking chip strip accepts HTML5 drops from combine-review (`FBA_BOARD_DND_TYPE`). */
  trackingStripBoardDrop?:
    | (Pick<HTMLAttributes<HTMLDivElement>, 'onDragEnter' | 'onDragLeave' | 'onDragOver' | 'onDrop'> & {
        draggingOver?: boolean;
      })
    | undefined;
}

/**
 * Shared display for a UPS tracking bundle + its FNSKU lines.
 * Used by both the active-shipments sidebar and the station up-next card
 * so the visual/format stays consistent with the editor (TrackingChip + FbaSelectedLineRow).
 */
export function FbaTrackingGroupDisplay({
  bundle,
  items,
  stationTheme,
  editable = false,
  getQty,
  selectedIds,
  onCheckedChange,
  onRemoveItem,
  onAdjustQty,
  onSetQty,
  hideCheckbox = false,
  trackingStripBoardDrop,
}: FbaTrackingGroupDisplayProps) {
  const resolveQty = (item: ShipmentCardItem) => (getQty ? getQty(item) : item.expected_qty);
  const totalQty = items.reduce((s, i) => s + resolveQty(i), 0);
  const tracking = (bundle.tracking_number || '').trim();

  if (items.length === 0) return null;

  const chipStripDraggingOver =
    editable && trackingStripBoardDrop?.draggingOver;

  const chipStripDragHandlers =
    editable && trackingStripBoardDrop
      ? (({ draggingOver: _stripHighlight, ...handlers }) => handlers)(trackingStripBoardDrop)
      : undefined;

  return (
    <div className="border-b border-border-hairline last:border-b-0">
      {/* Tracking header — same visual as editor (TrackingChip) */}
      <div
        className={`flex items-center gap-2 border-b border-border-accent bg-surface-accent px-3 py-1.5 ${
          chipStripDraggingOver ? 'ring-2 ring-inset ring-border-accent bg-surface-accent' : ''
        }`}
        {...(chipStripDragHandlers ?? {})}
      >
        {tracking ? (
          <TrackingChip value={tracking} display={getLast8(tracking)} />
        ) : (
          <div className="flex items-center gap-1.5 text-text-accent">
            <MapPin className="h-3 w-3" />
            <span className="font-mono text-role-caption font-semibold">No tracking</span>
          </div>
        )}
        <span className="ml-auto shrink-0 text-role-micro tabular-nums text-text-muted">
          {items.length} SKU{items.length !== 1 ? 's' : ''} · {totalQty} units
        </span>
      </div>

      <div className="divide-y divide-border-hairline">
        {items.map((item) => {
          const qty = resolveQty(item);
          const isSelected = selectedIds ? selectedIds.has(item.item_id) : true;
          return (
            <FbaSelectedLineRow
              key={item.item_id}
              displayTitle={item.display_title || 'No title'}
              fnsku={String(item.fnsku || '').toUpperCase()}
              stationTheme={stationTheme}
              checked={isSelected}
              checkboxDisabled={!editable}
              hideCheckbox={hideCheckbox}
              onCheckedChange={(next) => {
                if (onCheckedChange) onCheckedChange(item.item_id, next);
                else if (!next && onRemoveItem) onRemoveItem(item);
              }}
              onEditDetails={
                editable
                  ? () =>
                      emitOpenQuickAddFnsku({
                        fnsku: String(item.fnsku || '').trim(),
                        product_title: item.display_title || null,
                      })
                  : undefined
              }
              rightSlot={
                editable && (onSetQty || onAdjustQty) ? (
                  <FbaQtyStepper
                    value={qty}
                    onChange={(v) => {
                      if (onSetQty) onSetQty(item, v);
                      else if (onAdjustQty) onAdjustQty(item, v - qty);
                    }}
                    fnsku={item.fnsku}
                  />
                ) : (
                  <FbaQtyDisplay value={qty} />
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}
