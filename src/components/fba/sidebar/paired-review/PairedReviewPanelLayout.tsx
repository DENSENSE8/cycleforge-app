import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { AnimatePresence } from '@/design-system/motion';
import { Check, ChevronUp, Plus } from '@/components/Icons';
import type { FbaBoardItem } from '@/lib/fba/types';
import { FbaSelectedLineRow } from '@/components/fba/sidebar/FbaSelectedLineRow';
import { FbaUnallocatedBucket } from '@/components/fba/sidebar/FbaUnallocatedBucket';
import { FbaTrackingBucket } from '@/components/fba/sidebar/FbaTrackingBucket';
import { FbaQtySplitPopover } from '@/components/fba/sidebar/FbaQtySplitPopover';
import { microBadge } from '@/design-system/tokens/typography/presets';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { StationTheme } from '@/utils/staff-colors';
import type { PairedReviewController } from './usePairedReview';

/** Narrow vertical stack for the sidebar (legacy) combine-review layout. */
export function PairedReviewPanelLayout({
  c,
  stationTheme,
  selectedItems,
  onToggleExpanded,
}: {
  c: PairedReviewController;
  stationTheme: StationTheme;
  selectedItems: FbaBoardItem[];
  onToggleExpanded?: () => void;
}) {
  return (
    <div className="border-b border-border-hairline">
      {onToggleExpanded ? (
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <p className="text-role-micro uppercase tracking-widest text-text-soft">Combine review</p>
          <HoverTooltip label="Collapse" asChild>
            <IconButton
              type="button"
              radius="flush"
              onClick={onToggleExpanded}
              ariaLabel="Collapse combine review"
              icon={<ChevronUp className="h-4 w-4" />}
              className="flex h-7 w-7 shrink-0 items-center justify-center hover:bg-surface-sunken"
            />
          </HoverTooltip>
        </div>
      ) : null}

      <div className="space-y-2 px-3 pb-3 pt-1">
        {/* FBA Shipment ID — parent card header */}
        <div>
          <div className="flex items-center justify-between mb-1">
            {c.lockedFbaId && (
              <HoverTooltip label="Done with this FBA Shipment ID" asChild>
                <IconButton
                  type="button"
                  radius="flush"
                  onClick={c.handleDismissFbaId}
                  ariaLabel="Done — clear FBA Shipment ID"
                  icon={<Check className="h-3 w-3" />}
                  className="flex h-5 w-5 items-center justify-center bg-surface-success text-text-success hover:bg-surface-hover"
                />
              </HoverTooltip>
            )}
          </div>
          <TextField
            label="FBA Shipment ID"
            value={c.lockedFbaId || c.amazonShipmentId}
            onChange={(value) => {
              if (c.lockedFbaId) return;
              c.setAmazonShipmentId(value.toUpperCase());
            }}
            disabled={c.saving || Boolean(c.lockedFbaId)}
            mono
            inputClassName={c.lockedFbaId ? 'disabled:!border-border-success disabled:!bg-surface-success disabled:!text-text-success' : ''}
          />
          {c.activeSplit ? (
            <p className="mt-1.5 text-role-eyebrow font-semibold leading-snug text-text-warning">
              If you change this FBA ID from the prefilled value, Save creates a new active shipment for these
              FNSKUs with this Amazon ID and UPS; the original card keeps its FBA ID for remaining lines.
            </p>
          ) : null}
        </div>

        {/* Drag-and-drop hierarchy: Unallocated + UPS Tracking Buckets */}
        {c.hasItems ? (
          <div className="relative space-y-2">
            <DndContext
              sensors={c.sensors}
              collisionDetection={closestCenter}
              onDragStart={c.handleDragStart}
              onDragEnd={c.handleDragEnd}
              onDragCancel={c.handleDragCancel}
            >
              <FbaUnallocatedBucket
                allocations={c.allocations.unallocated}
                selectedItems={selectedItems}
                stationTheme={stationTheme}
                onQtyChange={c.handleQtyChange}
                onRemoveItem={c.removeSelectedItem}
              />

              {c.allocations.buckets.map((bucket) => (
                <FbaTrackingBucket
                  key={bucket.bucketId}
                  bucket={bucket}
                  selectedItems={selectedItems}
                  stationTheme={stationTheme}
                  saving={c.saving}
                  onTrackingChange={c.handleTrackingChange}
                  onQtyChange={c.handleQtyChange}
                  onRemoveItem={c.removeSelectedItem}
                  onToggleCollapse={c.handleToggleCollapse}
                  onDelete={c.handleDeleteBucket}
                />
              ))}

              <DragOverlay>
                {c.activeItem ? (
                  <div className="border border-border-accent bg-surface-card/95 shadow-none">
                    <FbaSelectedLineRow
                      displayTitle={c.activeItem.display_title || 'No title'}
                      fnsku={String(c.activeItem.fnsku || '').toUpperCase()}
                      stationTheme={stationTheme}
                      checked
                      checkboxDisabled
                      rightSlot={null}
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            {/* Qty split popover */}
            <AnimatePresence>
              {c.splitState && (
                <FbaQtySplitPopover
                  itemId={c.splitState.itemId}
                  fnsku={c.splitState.fnsku}
                  maxQty={c.splitState.maxQty}
                  onConfirm={c.confirmSplit}
                  onCancel={c.cancelSplit}
                />
              )}
            </AnimatePresence>
          </div>
        ) : c.lockedFbaId ? (
          <p className={`${microBadge} tracking-wider text-text-success`}>
            Select more items to add another UPS tracking to {c.lockedFbaId}
          </p>
        ) : null}

        {/* Add UPS Tracking bucket button */}
        {c.hasItems ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            radius="flush"
            onClick={c.addBucket}
            disabled={c.saving}
            icon={<Plus />}
            className="w-full border border-dashed border-border-default text-text-soft hover:border-border-accent hover:bg-surface-accent hover:text-text-accent disabled:opacity-40"
          >
            Add UPS Tracking Box
          </Button>
        ) : null}

        {/* Error / success messages */}
        {c.error && <p className={`${microBadge} tracking-wider text-text-danger`}>{c.error}</p>}
        {c.success && <p className={`${microBadge} tracking-wider text-text-success`}>{c.success}</p>}

        {/* Save button */}
        {c.hasAllocatedItems ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            radius="flush"
            onClick={() => void c.handleSaveAll()}
            disabled={c.saving}
            loading={c.saving}
            className={c.chrome.primaryButton}
          >
            {c.lockedFbaId ? 'Save UPS Tracking' : 'Save Shipment + UPS'}
          </Button>
        ) : c.hasItems && c.allocations.buckets.length === 0 ? (
          <p className={`${microBadge} text-center tracking-wider text-text-faint`}>
            Add a UPS tracking box, then drag items into it
          </p>
        ) : null}
      </div>
    </div>
  );
}
