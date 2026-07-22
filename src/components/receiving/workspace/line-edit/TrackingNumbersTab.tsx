'use client';

/**
 * Unbox Tracking tab — primary + extra tracking CRUD for a carton PO.
 * Chip Edit on the identity bar navigates here; add-extra lives in this tab
 * (not on the CartonContextCard strip).
 */

import { useState, type Dispatch, type SetStateAction } from 'react';
import { MapPin, Plus, X } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { WorkspaceCard } from '@/design-system/components';
import { IconButton } from '@/design-system/primitives';
import { WorkspaceFieldLabel } from '@/components/receiving/workspace/WorkspaceSectionLabel';
import {
  RECEIVING_SCAN_RULE_LINE_CLASS,
  TRACKING_ADD_BTN_CLASS,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';

export function TrackingNumbersTab({
  trackingEdit,
  setTrackingEdit,
  onCommitTracking,
  extraTrackings,
  setExtraTrackings,
  onCommitExtraTracking,
  primaryTrackingTrimmed,
}: {
  trackingEdit: string;
  setTrackingEdit: (v: string) => void;
  onCommitTracking: (raw: string) => void;
  extraTrackings: string[];
  setExtraTrackings: Dispatch<SetStateAction<string[]>>;
  onCommitExtraTracking?: (raw: string, index: number) => void;
  primaryTrackingTrimmed: string;
}) {
  const [focusExtra, setFocusExtra] = useState(false);

  const addExtraRow = () => {
    if (extraTrackings.length >= 1) return;
    setExtraTrackings((xs) => (xs.length >= 1 ? xs : [...xs, '']));
    setFocusExtra(true);
  };

  return (
    <WorkspaceCard variant="glass" overflow="visible" bodyDensity="nested">
      <div className="space-y-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <WorkspaceFieldLabel className="whitespace-nowrap">Tracking numbers</WorkspaceFieldLabel>
          <HoverTooltip
            label={
              extraTrackings.length >= 1
                ? 'Only one extra tracking row'
                : 'Add tracking number to this PO'
            }
            asChild
          >
            <IconButton
              type="button"
              onClick={addExtraRow}
              disabled={extraTrackings.length >= 1}
              ariaLabel="Add second tracking number to this PO"
              className={TRACKING_ADD_BTN_CLASS}
              icon={<Plus className="h-3 w-3" />}
            />
          </HoverTooltip>
        </div>

        <div className="group relative min-w-0">
          <div className="mb-1.5">
            <WorkspaceFieldLabel className="whitespace-nowrap">Primary</WorkspaceFieldLabel>
          </div>
          <SearchBar
            value={trackingEdit}
            onChange={setTrackingEdit}
            onSearch={onCommitTracking}
            placeholder="Tracking"
            variant="blue"
            size="compact"
            hideUnderline
            pasteOnlyTrailing
            leadingIcon={<MapPin className="h-[14px] w-[14px]" />}
            className="w-full min-w-0"
          />
          <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
          {primaryTrackingTrimmed ? (
            <p className="mt-1 truncate font-mono text-role-caption text-text-faint" title={primaryTrackingTrimmed}>
              Saved · {primaryTrackingTrimmed}
            </p>
          ) : null}
        </div>

        {extraTrackings.map((t, i) => (
          <div key={i} className="group relative min-w-0">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <WorkspaceFieldLabel className="whitespace-nowrap">
                Extra box {i + 1}
              </WorkspaceFieldLabel>
              <HoverTooltip label="Remove extra tracking row" asChild>
                <IconButton
                  type="button"
                  onClick={() => setExtraTrackings((xs) => xs.filter((_, j) => j !== i))}
                  ariaLabel="Remove extra tracking row"
                  className="rounded p-0.5 text-text-faint hover:bg-red-50 hover:text-red-600"
                  icon={<X className="h-3.5 w-3.5" />}
                />
              </HoverTooltip>
            </div>
            <SearchBar
              value={t}
              onChange={(v) => setExtraTrackings((xs) => xs.map((x, j) => (j === i ? v : x)))}
              onSearch={(v) => onCommitExtraTracking?.(v, i)}
              placeholder="Tracking"
              variant="blue"
              size="compact"
              hideUnderline
              debounceMs={0}
              pasteOnlyTrailing
              autoFocus={focusExtra && i === extraTrackings.length - 1}
              leadingIcon={<MapPin className="h-[14px] w-[14px]" />}
              className="w-full min-w-0"
            />
            <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
          </div>
        ))}
      </div>
    </WorkspaceCard>
  );
}
