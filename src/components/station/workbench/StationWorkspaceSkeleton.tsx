'use client';

/** Station focused-overlay workspace skeleton — **SoT**. */

import { SkeletonBase } from '@/design-system';
import {
  WorkspaceCard,
  WORKSPACE_NESTED_FIELD,
  WORKSPACE_NESTED_FIELD_PAD,
} from '@/design-system/components';
import { Panel } from '@/design-system/primitives/Panel';
import {
  STATION_WORKBENCH_BODY_COLUMN,
  STATION_WORKBENCH_COLUMN,
  STATION_WORKBENCH_HEADER_COLUMN,
  STATION_WORKBENCH_IDENTITY_COLUMN,
} from '@/components/station/workbench/workbench-layout';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import {
  STATION_CHROME_ROW_FACE,
  stationIdentityGapClass,
  stationIdentityPadClass,
  stationIdentityPanelClass,
  stationContextBarHostClass,
  stationMoreDetailsHostClass,
  stationUtilityPanelClass,
} from '@/components/station/entity-context/station-identity-chrome';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

type StationWorkspaceSkeletonHeader = 'identity-tabs' | 'toolbar' | 'none';
type StationWorkspaceSkeletonBody = 'unbox-overview' | 'sections';

/** Force flush over SkeletonBase's default `rounded-md` (no twMerge there). */
const FLUSH_BAR = cn(cornerClass('flush'), '!rounded-none');

function SkeletonSectionCard({ rows }: { rows: number }) {
  return (
    <Panel padding="md" radius="none" elevation="none" className="border-b border-border-soft">
      <SkeletonBase width="96px" height="10px" className={cn('mb-3', FLUSH_BAR)} />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBase
            key={i}
            width={`${100 - i * 12}%`}
            height="12px"
            className={FLUSH_BAR}
          />
        ))}
      </div>
    </Panel>
  );
}

/**
 * Flush identity strip + corner utilities — mirrors StationContextBar
 * (CartonContextCard bar + StationMoreDetails).
 */
function IdentityTabsHeader() {
  return (
    <div className={stationContextBarHostClass} aria-hidden>
      <div
        className={cn(
          STATION_WORKBENCH_IDENTITY_COLUMN,
          'pointer-events-none flex items-start justify-center',
        )}
      >
        <Panel
          padding="none"
          radius="none"
          elevation="none"
          borderless
          className={cn(
            stationIdentityPanelClass,
            stationIdentityPadClass,
            STATION_WORKBENCH_COLUMN,
            'flex items-center overflow-hidden',
            STATION_CHROME_ROW_FACE,
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-0.5">
            <div className="flex shrink-0 items-center gap-1">
              <SkeletonBase width="64px" height="22px" className={FLUSH_BAR} />
              <SkeletonBase width="52px" height="22px" className={FLUSH_BAR} />
              <SkeletonBase width="36px" height="22px" className={FLUSH_BAR} />
            </div>
            <div className="mx-auto flex min-w-0 items-center justify-center gap-2">
              <SkeletonBase width="72px" height="14px" className={FLUSH_BAR} />
              <SkeletonBase width="48px" height="14px" className={FLUSH_BAR} />
              <SkeletonBase width="40px" height="14px" className={FLUSH_BAR} />
            </div>
          </div>
        </Panel>
      </div>
      <div className={stationMoreDetailsHostClass}>
        <Panel
          padding="none"
          radius="none"
          elevation="none"
          borderless
          className={cn(
            stationUtilityPanelClass,
            stationIdentityPadClass,
            stationIdentityGapClass,
            'flex items-center',
            STATION_CHROME_ROW_FACE,
          )}
        >
          <SkeletonBase width="56px" height="24px" className={FLUSH_BAR} />
          <SkeletonBase width="28px" height="28px" className={FLUSH_BAR} />
          <SkeletonBase width="28px" height="28px" className={FLUSH_BAR} />
          <SkeletonBase width="28px" height="28px" className={FLUSH_BAR} />
        </Panel>
      </div>
    </div>
  );
}

/** SectionTabsSlider density — primary tab chips + trailing pencil rightSlot. */
function SectionTabsStrip() {
  return (
    <div className="flex items-center justify-between gap-2" aria-hidden>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <SkeletonBase width="72px" height="32px" className={FLUSH_BAR} />
        <SkeletonBase width="80px" height="32px" className={FLUSH_BAR} />
        <SkeletonBase width="64px" height="32px" className={FLUSH_BAR} />
        <SkeletonBase width="56px" height="32px" className={FLUSH_BAR} />
        <SkeletonBase width="52px" height="32px" className={FLUSH_BAR} />
      </div>
      <SkeletonBase width="32px" height="32px" className={cn('shrink-0', FLUSH_BAR)} />
    </div>
  );
}

/** POUnboxingSection / SerialCard overview geometry — flush ledger face. */
function UnboxProductSerialCard() {
  return (
    <WorkspaceCard variant="glass" bodyDensity="nested" bodyClassName="px-3 pt-3 pb-2">
      <div className="space-y-3" aria-hidden>
        <SkeletonBase width="68%" height="18px" className={FLUSH_BAR} />
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBase width="28px" height="16px" className={FLUSH_BAR} />
          <SkeletonBase width="48px" height="16px" className={FLUSH_BAR} />
          <SkeletonBase width="56px" height="16px" className={FLUSH_BAR} />
          <SkeletonBase width="44px" height="16px" className={FLUSH_BAR} />
          <SkeletonBase width="64px" height="16px" className={cn('ml-auto', FLUSH_BAR)} />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBase width="36px" height="36px" className={cn('shrink-0', FLUSH_BAR)} />
          <SkeletonBase
            width="100%"
            height="40px"
            className={cn('min-w-0 flex-1', FLUSH_BAR)}
          />
          <SkeletonBase width="40px" height="40px" className={cn('shrink-0', FLUSH_BAR)} />
        </div>
      </div>
    </WorkspaceCard>
  );
}

/** WorkspaceLabelPreviewCard — print-faithful 2×1 sticker (~480×240 max). */
function UnboxLabelCard() {
  return (
    <WorkspaceCard variant="glass" bodyDensity="nested">
      <div
        className={cn(WORKSPACE_NESTED_FIELD, WORKSPACE_NESTED_FIELD_PAD)}
        aria-hidden
      >
        <div className="mx-auto aspect-[2/1] w-full max-w-[480px] overflow-hidden rounded-none bg-white ring-1 ring-border-soft/60"> {/* ds-allow-raw-neutral: print-preview paper face */}
          <div className="flex h-full items-stretch gap-1 p-1.5">
            <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
              <div className="flex items-start justify-between gap-2">
                <SkeletonBase width="72px" height="10px" className={FLUSH_BAR} />
                <SkeletonBase width="40px" height="10px" className={FLUSH_BAR} />
              </div>
              <div className="flex items-end justify-between gap-2">
                <SkeletonBase width="56px" height="10px" className={FLUSH_BAR} />
                <SkeletonBase width="48px" height="10px" className={FLUSH_BAR} />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center gap-0.5">
              <div className="aspect-square h-[86%] w-auto animate-pulse rounded-none bg-surface-strong" />
              <SkeletonBase width="40px" height="8px" className={FLUSH_BAR} />
            </div>
          </div>
        </div>
      </div>
    </WorkspaceCard>
  );
}

interface StationWorkspaceSkeletonProps {
  /**
   * `identity-tabs` — Unbox (floating StationContextBar + section tab strip).
   * `toolbar` — Triage (single toolbar band).
   * `none` — body cards only.
   */
  header?: StationWorkspaceSkeletonHeader;
  /**
   * `unbox-overview` — product/serial + label preview cards.
   * `sections` — generic stacked Panel text cards (Triage).
   */
  body?: StationWorkspaceSkeletonBody;
  /** Override body column (default Station Workbench 720px). */
  bodyColumnClassName?: string;
  /** Override header column pad (toolbar variant). */
  headerColumnClassName?: string;
  /** Row counts per stacked section card when `body="sections"`. */
  sectionRows?: readonly number[];
  /** Accessible label for the busy region. */
  label?: string;
  className?: string;
}

const DEFAULT_SECTION_ROWS = [2, 3, 2] as const;

export function StationWorkspaceSkeleton({
  header = 'identity-tabs',
  body = 'sections',
  bodyColumnClassName = STATION_WORKBENCH_BODY_COLUMN,
  headerColumnClassName = STATION_WORKBENCH_HEADER_COLUMN,
  sectionRows = DEFAULT_SECTION_ROWS,
  label = 'Loading workspace',
  className,
}: StationWorkspaceSkeletonProps) {
  const showIdentityTabs = header === 'identity-tabs';
  const showToolbar = header === 'toolbar';

  return (
    <div
      className={cn(
        'relative flex h-full w-full flex-col bg-surface-canvas',
        className,
      )}
      aria-busy="true"
      aria-label={label}
    >
      {showIdentityTabs ? <IdentityTabsHeader /> : null}

      {showToolbar ? (
        <div
          className={cn(
            'flex items-center border-b border-border-hairline bg-surface-card',
            PRIMARY_CHROME_ROW_FACE,
          )}
        >
          <div className={cn(headerColumnClassName, 'flex items-center justify-between')}>
            <SkeletonBase width="120px" height="24px" className={FLUSH_BAR} />
            <div className="flex items-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBase key={i} width="32px" height="32px" className={FLUSH_BAR} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className={bodyColumnClassName}>
          {showIdentityTabs ? <SectionTabsStrip /> : null}

          {body === 'unbox-overview' ? (
            <div className="space-y-4">
              <UnboxProductSerialCard />
              <UnboxLabelCard />
            </div>
          ) : (
            sectionRows.map((rows, i) => <SkeletonSectionCard key={i} rows={rows} />)
          )}
        </div>
      </div>
    </div>
  );
}
