'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { AnimatePresence, motion } from '@/design-system/motion';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from '@/components/Icons';
import { FbaDraggableLineRow } from '@/components/fba/sidebar/FbaDraggableLineRow';
import { FbaQtyStepper } from '@/components/fba/sidebar/FbaQtyStepper';
import { PrintTableCheckbox } from '@/components/fba/table/Checkbox';
import { TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, TextField } from '@/design-system/primitives';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import type { StationTheme } from '@/utils/staff-colors';

export interface BundleItemAllocation {
  item_id: number;
  fnsku: string;
  display_title: string;
  qty: number;
  max_qty: number;
}

export interface TrackingBundleDraft {
  link_id: number | null;
  tracking_number: string;
  carrier: string;
  allocations: BundleItemAllocation[];
  collapsed: boolean;
}

interface FbaTrackingBundleCardProps {
  bundle: TrackingBundleDraft;
  bundleIndex: number;
  droppableId: string;
  stationTheme: StationTheme;
  selectedIds: Set<number>;
  onToggleSelect: (itemId: number) => void;
  onSelectAllInBundle: (bundleIndex: number) => void;
  onUpdateTracking: (index: number, value: string) => void;
  onRemoveBundle: (index: number) => void;
  onToggleCollapse: (index: number) => void;
  onDeallocateItem: (bundleIndex: number, itemId: number) => void;
  onChangeAllocationQty: (bundleIndex: number, itemId: number, qty: number) => void;
}

export function FbaTrackingBundleCard({
  bundle,
  bundleIndex,
  droppableId,
  stationTheme,
  selectedIds,
  onToggleSelect,
  onSelectAllInBundle,
  onUpdateTracking,
  onRemoveBundle,
  onToggleCollapse,
  onDeallocateItem,
  onChangeAllocationQty,
}: FbaTrackingBundleCardProps) {
  const { setNodeRef, isOver } = useDroppable({ id: droppableId });

  // Edit mode: blank bundles start in edit mode; filled bundles show the chip until user clicks edit
  const [editingTracking, setEditingTracking] = useState(!bundle.tracking_number);

  const totalUnits = bundle.allocations.reduce((s, a) => s + a.qty, 0);
  const allSelected = bundle.allocations.length > 0 && bundle.allocations.every((a) => selectedIds.has(a.item_id));
  const someSelected = bundle.allocations.some((a) => selectedIds.has(a.item_id));

  const showChip = !editingTracking && bundle.tracking_number.trim().length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`overflow-hidden rounded-none border transition-colors ${
        isOver
          ? 'border-dashed border-border-accent bg-surface-accent'
          : bundle.allocations.length > 0
            ? 'border-border-soft bg-surface-card'
            : 'border-border-soft bg-surface-canvas/30'
      }`}
    >
      {/* Header — grid matches FbaSelectedLineRow so checkboxes align with item rows below */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 bg-surface-canvas/80 px-3 py-1.5">
        {/* Col 1: checkbox — always reserves slot for alignment */}
        <div className="flex h-5 w-5 items-center justify-center">
          {bundle.allocations.length > 0 ? (
            <PrintTableCheckbox
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              stationTheme={stationTheme}
              onChange={() => onSelectAllInBundle(bundleIndex)}
              label={allSelected ? 'Deselect all in box' : 'Select all in box'}
            />
          ) : null}
        </div>

        {/* Col 2: tracking chip or input */}
        {showChip ? (
          <div className="flex min-w-0 items-center gap-1">
            <TrackingChip value={bundle.tracking_number} display={getLast8(bundle.tracking_number)} />
            <HoverTooltip label="Edit tracking number" asChild>
              <IconButton
                type="button"
                onClick={() => setEditingTracking(true)}
                radius="flush"
                className="flex h-4 w-4 shrink-0 items-center justify-center text-text-faint hover:bg-surface-sunken hover:text-text-muted"
                ariaLabel="Edit tracking number"
                icon={<Pencil className="h-2.5 w-2.5" />}
              />
            </HoverTooltip>
          </div>
        ) : (
          <TextField
            label="Tracking number"
            value={bundle.tracking_number}
            onChange={(value) => onUpdateTracking(bundleIndex, value)}
            onBlur={() => { if (bundle.tracking_number.trim()) setEditingTracking(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && bundle.tracking_number.trim()) setEditingTracking(false); }}
            autoFocus={editingTracking}
            mono
            className="min-w-0"
          />
        )}

        {/* Col 3: actions */}
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-role-micro uppercase tracking-widest text-text-faint">
            {bundle.allocations.length > 0
              ? `${bundle.allocations.length} · ${totalUnits}`
              : ''}
          </span>
          <IconButton
            type="button"
            onClick={() => onToggleCollapse(bundleIndex)}
            radius="flush"
            className="flex h-5 w-5 shrink-0 items-center justify-center text-text-faint hover:text-text-muted"
            ariaLabel={bundle.collapsed ? 'Expand box' : 'Collapse box'}
            icon={bundle.collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          />
          {/* Divider + extra padding so the destructive trash button is harder to mis-tap next to the chevron */}
          <span aria-hidden className="mx-0.5 h-3 w-px bg-surface-strong" />
          <IconButton
            type="button"
            onClick={() => onRemoveBundle(bundleIndex)}
            radius="flush"
            className="flex h-5 w-5 shrink-0 items-center justify-center text-text-faint hover:bg-surface-danger hover:text-text-danger"
            ariaLabel="Remove this box"
            icon={<Trash2 className="h-3 w-3" />}
          />
        </div>
      </div>

      {/* Collapsible items */}
      <AnimatePresence initial={false}>
        {!bundle.collapsed && (
          <motion.div
            initial={motionPresence.collapseHeight.initial}
            animate={motionPresence.collapseHeight.animate}
            exit={motionPresence.collapseHeight.exit}
            transition={motionTransition.upNextCollapse}
            className="overflow-hidden"
          >
            {bundle.allocations.length === 0 ? (
              <div className="border-t border-border-hairline px-3 py-2">
                <p className="text-center text-role-eyebrow uppercase tracking-wider text-text-faint">
                  Drag items here
                </p>
              </div>
            ) : (
              <div className="border-t border-border-hairline">
                {bundle.allocations.map((alloc) => (
                  <FbaDraggableLineRow
                    key={alloc.item_id}
                    dragId={`editor-drag-${alloc.item_id}-${droppableId}`}
                    dragData={{ itemId: alloc.item_id, sourceContainer: droppableId }}
                    displayTitle={alloc.display_title || 'No title'}
                    fnsku={alloc.fnsku.toUpperCase()}
                    stationTheme={stationTheme}
                    checked
                    selected={selectedIds.has(alloc.item_id)}
                    onToggleSelect={() => onToggleSelect(alloc.item_id)}
                    onCheckedChange={() => onDeallocateItem(bundleIndex, alloc.item_id)}
                    rightSlot={
                      <FbaQtyStepper
                        value={alloc.qty}
                        onChange={(v) => {
                          if (v <= 0) {
                            onDeallocateItem(bundleIndex, alloc.item_id);
                          } else {
                            onChangeAllocationQty(bundleIndex, alloc.item_id, Math.min(v, alloc.max_qty));
                          }
                        }}
                        fnsku={alloc.fnsku}
                      />
                    }
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
