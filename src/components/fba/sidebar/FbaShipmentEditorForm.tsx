'use client';

import { DndContext, DragOverlay } from '@dnd-kit/core';
import { AnimatePresence } from '@/design-system/motion';
import { Collapse } from '@/design-system/components/Collapse';
import { MapPin, Package, Plus, RotateCcw, Search, X } from '@/components/Icons';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { getLast8 } from '@/components/ui/CopyChip';
import { FbaTrackingBundleCard } from '@/components/fba/sidebar/FbaTrackingBundleCard';
import { FbaQtySplitPopover } from '@/components/fba/sidebar/FbaQtySplitPopover';
import { droppableIdForBundle, UNALLOCATED_ID, type FbaShipmentEditorFormProps } from './shipment-editor/shipment-editor-helpers';
import { useShipmentEditor } from './shipment-editor/useShipmentEditor';
import { UnallocatedDropZone } from './shipment-editor/UnallocatedDropZone';
import { FnskuSearchModal } from './shipment-editor/FnskuSearchModal';

export type { FbaShipmentEditorFormProps } from './shipment-editor/shipment-editor-helpers';

/** FBA shipment editor — thin composition shell. */
export function FbaShipmentEditorForm(props: FbaShipmentEditorFormProps) {
  const { shipment, stationTheme = 'green', onClose } = props;
  const c = useShipmentEditor(props);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card">
      {/* Header */}
      <div className="relative z-20 flex shrink-0 items-center justify-between border-b border-border-soft bg-surface-card px-3 py-2">
        <div className="flex items-center gap-2">
          <IconButton type="button" radius="flush" onClick={onClose} ariaLabel="Close editor" icon={<X className="h-3.5 w-3.5 text-text-muted" />} className="flex h-7 w-7 items-center justify-center bg-surface-sunken hover:bg-surface-strong" />
          <div>
            <h2 className="text-role-caption font-semibold tracking-tight text-text-default">Edit Shipment</h2>
            <p className="text-role-eyebrow text-text-accent">{shipment.shipment_ref}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-role-micro tabular-nums text-text-faint">{c.totalAllocated} in boxes · {c.totalUnallocated} loose</p>
        </div>
      </div>

      {/* Selection action bar */}
      <Collapse open={c.selectionCount > 0} appear className="border-b border-border-accent bg-surface-accent">
        <div className="px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-role-eyebrow text-text-accent">
              {c.selectionCount} selected
            </p>
            <Button type="button" variant="ghost" size="sm" radius="flush" onClick={c.clearSelection} className="h-auto px-0 text-role-micro text-text-accent hover:bg-transparent hover:text-text-default">
              Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            {c.bundles.map((bundle, idx) => {
              const hasTracking = bundle.tracking_number.trim().length > 0;
              return (
                <Button
                  key={bundle.link_id ?? `action-${idx}`}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => c.moveSelectedTo(droppableIdForBundle(idx))}
                  radius="flush"
                  className="h-auto gap-1 border border-border-soft bg-surface-card px-2 py-1 hover:bg-surface-hover"
                >
                  {hasTracking ? (
                    <>
                      <MapPin className="h-3 w-3 shrink-0 text-text-accent" />
                      <span className="border-b-2 border-border-accent pb-0.5 font-mono text-role-micro tracking-tight leading-none text-text-default">
                        {getLast8(bundle.tracking_number)}
                      </span>
                    </>
                  ) : (
                    <>
                      <Package className="h-3 w-3 shrink-0 text-text-soft" />
                      <span className="text-role-eyebrow text-text-muted">
                        Box {idx + 1}
                      </span>
                    </>
                  )}
                </Button>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => c.moveSelectedTo(UNALLOCATED_ID)}
              radius="flush"
              className="h-auto border border-border-warning bg-surface-card px-2 py-1 text-role-eyebrow text-text-warning hover:bg-surface-warning"
            >
              Unallocated
            </Button>
          </div>
        </div>
      </Collapse>

      {/* Scrollable body */}
      <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto bg-surface-card p-3 scrollbar-hide">
        {/* FBA Shipment ID */}
        <TextField
          label="FBA Shipment ID"
          value={c.amazonShipmentId}
          onChange={(value) => c.setAmazonShipmentId(value.toUpperCase())}
          mono
          className="mt-1"
          inputClassName="text-role-caption font-semibold"
        />

        <DndContext sensors={c.sensors} onDragStart={c.handleDragStart} onDragEnd={c.handleDragEnd} onDragCancel={c.handleDragCancel}>
          {/* UPS Tracking section — + button at very top, then boxes */}
          <div className="space-y-2">
            <Button type="button" variant="ghost" size="sm" onClick={c.addBundle}
              icon={<Plus className="h-2.5 w-2.5" />}
              radius="flush"
              className="h-auto w-full justify-center gap-1 border border-dashed border-border-default bg-surface-canvas/50 px-2 py-1.5 text-role-eyebrow text-text-soft hover:border-border-accent hover:bg-surface-accent hover:text-text-accent"
            >
              UPS Tracking{c.bundles.length > 0 ? ` (${c.bundles.length})` : ''}
            </Button>

            {c.bundles.map((bundle, idx) => (
              <FbaTrackingBundleCard
                key={bundle.link_id ?? `new-${idx}`}
                bundle={bundle} bundleIndex={idx} droppableId={droppableIdForBundle(idx)} stationTheme={stationTheme}
                selectedIds={c.selectedIds} onToggleSelect={c.toggleSelect} onSelectAllInBundle={c.selectAllInBundle}
                onUpdateTracking={c.updateTrackingNumber} onRemoveBundle={c.removeBundle} onToggleCollapse={c.toggleCollapse}
                onDeallocateItem={c.deallocateItem} onChangeAllocationQty={c.changeAllocationQty}
              />
            ))}
          </div>

          {/* Unallocated at bottom */}
          {c.unallocatedItems.length > 0 && (
            <UnallocatedDropZone
              items={c.unallocatedItems} stationTheme={stationTheme}
              selectedIds={c.selectedIds} onToggleSelect={c.toggleSelect}
              onSelectAllUnallocated={c.selectAllUnallocated} onRemoveItem={c.removeUnallocatedItem}
              moveUndo={c.moveUndo} onRestoreToBundle={c.restoreToBundle}
            />
          )}

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {c.activeItem ? (
              <div className="border border-border-accent bg-surface-accent px-2.5 py-1.5 shadow-none">
                <p className="text-role-micro text-text-default">{c.activeItem.display_title || c.activeItem.fnsku}</p>
                <div className="flex items-center gap-1.5">
                  <p className="font-mono text-role-eyebrow text-text-soft">{c.activeItem.fnsku}</p>
                  {c.dragCount > 1 && (
                    <span className="bg-fill-info px-1.5 py-0.5 text-role-micro text-text-inverse">
                      +{c.dragCount - 1}
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Split popover */}
        <AnimatePresence>
          {c.splitState && (
            <FbaQtySplitPopover itemId={c.splitState.itemId} fnsku={c.splitState.fnsku} maxQty={c.splitState.maxQty} onConfirm={c.confirmSplit} onCancel={c.cancelSplit} />
          )}
        </AnimatePresence>

        {/* Undo */}
        <Collapse open={c.visibleUndos.length > 0} appear>
          <div className="space-y-1">
            {c.visibleUndos.map((entry) => (
              <div key={entry.item_id} className="flex items-center gap-2 border border-border-warning bg-surface-warning px-2.5 py-1.5">
                <RotateCcw className="h-3 w-3 shrink-0 text-text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-role-eyebrow text-text-muted">{entry.display_title || entry.fnsku}</p>
                  <p className="font-mono text-role-micro text-text-faint">{entry.fnsku} · {entry.expected_qty} qty</p>
                </div>
                <Button type="button" variant="ghost" size="sm" radius="flush" onClick={() => c.popUndo(entry.item_id)} className="h-auto shrink-0 bg-surface-card px-2 py-0.5 text-role-micro text-text-warning hover:bg-surface-hover">Undo</Button>
                <IconButton type="button" radius="flush" onClick={() => c.dismissUndo(entry.item_id)} ariaLabel="Dismiss" icon={<X className="h-2.5 w-2.5" />} className="flex h-4 w-4 shrink-0 items-center justify-center text-text-warning hover:bg-surface-warning hover:text-text-default" />
              </div>
            ))}
          </div>
        </Collapse>

        {/* FNSKU search — popup trigger */}
        <Button type="button" variant="ghost" size="sm" radius="flush" onClick={() => c.setFnskuSearchOpen(true)} icon={<Search className="h-2.5 w-2.5" />} className="h-auto gap-1 px-0 text-role-eyebrow text-text-accent hover:bg-transparent hover:text-text-default">
          Add Amazon SKU to shipment
        </Button>
      </div>

      {/* FNSKU search popup — portaled to body so it escapes any transformed ancestor */}
      <FnskuSearchModal
        open={c.fnskuSearchOpen}
        onClose={() => c.setFnskuSearchOpen(false)}
        query={c.fnskuQuery}
        onQueryChange={c.setFnskuQuery}
        searchInputRef={c.searchInputRef}
        searching={c.fnskuSearching}
        results={c.fnskuResults}
        items={c.items}
        addingFnsku={c.addingFnsku}
        stationTheme={stationTheme}
        onAddFnsku={c.handleAddFnskuToShipment}
      />

      {/* Footer */}
      <div className="border-t border-border-soft bg-surface-card px-3 py-2">
        {c.saveError && <p className="mb-1.5 text-role-micro font-semibold text-text-danger">{c.saveError}</p>}
        <Button type="button" variant="primary" size="lg" radius="flush" onClick={c.save} loading={c.saving} className={c.chrome.primaryButton}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
