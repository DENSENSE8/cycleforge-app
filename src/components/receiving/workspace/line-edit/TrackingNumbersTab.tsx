'use client';

/**
 * Unbox Tracking display — primary + extra tracking CRUD for a carton PO.
 *
 * Flush Displays body (no WorkspaceCard glass island). The Displays tab already
 * names this surface — no redundant "Tracking numbers" eyebrow. Chip Edit on
 * the identity bar navigates here; add-extra lives next to Primary.
 */

import { useState, type Dispatch, type SetStateAction } from 'react';
import { MapPin, Plus, X } from '@/components/Icons';
import { SearchBar } from '@/components/ui/SearchBar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { WorkspaceFieldLabel } from '@/components/receiving/workspace/WorkspaceSectionLabel';
import { RECEIVING_SCAN_RULE_LINE_CLASS } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

const FLUSH_HOST_CLASS = cn('min-w-0', cornerClass('flush'));

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
    <div className={FLUSH_HOST_CLASS}>
      <div className="space-y-3">
        <div className="group relative min-w-0">
          <div className="mb-1.5 flex w-full min-w-0 items-center justify-between gap-2">
            <WorkspaceFieldLabel className="whitespace-nowrap">Primary</WorkspaceFieldLabel>
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
                size="xs"
                tone="neutral"
                onClick={addExtraRow}
                disabled={extraTrackings.length >= 1}
                ariaLabel="Add second tracking number to this PO"
                icon={<Plus className="h-3.5 w-3.5" />}
              />
            </HoverTooltip>
          </div>
          <SearchBar
            value={trackingEdit}
            onChange={setTrackingEdit}
            onSearch={onCommitTracking}
            placeholder="Tracking"
            variant="blue"
            size="compact"
            hideUnderline
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
            <div className="mb-1.5 flex w-full items-center justify-between gap-2">
              <WorkspaceFieldLabel className="whitespace-nowrap">
                Extra box {i + 1}
              </WorkspaceFieldLabel>
              <HoverTooltip label="Remove extra tracking row" asChild>
                <IconButton
                  type="button"
                  size="xs"
                  onClick={() => setExtraTrackings((xs) => xs.filter((_, j) => j !== i))}
                  ariaLabel="Remove extra tracking row"
                  className="text-text-faint hover:bg-red-50 hover:text-red-600"
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
              autoFocus={focusExtra && i === extraTrackings.length - 1}
              leadingIcon={<MapPin className="h-[14px] w-[14px]" />}
              className="w-full min-w-0"
            />
            <div className={RECEIVING_SCAN_RULE_LINE_CLASS} aria-hidden />
          </div>
        ))}
      </div>
    </div>
  );
}
