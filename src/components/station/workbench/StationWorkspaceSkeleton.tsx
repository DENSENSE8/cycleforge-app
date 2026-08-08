'use client';

/**
 * Station focused-overlay workspace skeleton — **SoT**.
 *
 * Mirrors StationWorkbench identity + section tabs + stacked glass cards so the
 * handoff to LineEditPanel / TriagePanel feels continuous. Section cards
 * compose {@link Panel} / {@link WorkspaceCard} — never hand-roll
 * `rounded-2xl border…`.
 *
 * Domain wrappers (`ReceivingWorkspaceSkeleton`, `TriageWorkspaceSkeleton`)
 * pick the header variant, body preset, and column recipe.
 */

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
  stationIdentityGapClass,
  stationIdentityPadClass,
  stationIdentityPanelClass,
  stationContextBarHostClass,
  stationMoreDetailsHostClass,
  stationUtilityPanelClass,
} from '@/components/station/entity-context/station-identity-chrome';
import { cn } from '@/utils/_cn';

type StationWorkspaceSkeletonHeader = 'identity-tabs' | 'toolbar' | 'none';
type StationWorkspaceSkeletonBody = 'unbox-overview' | 'sections';

function SkeletonSectionCard({ rows }: { rows: number }) {
  return (
    <Panel padding="md" radius="2xl" elevation="sm">
      <SkeletonBase width="96px" height="10px" className="mb-3 rounded-full" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBase
            key={i}
            width={`${100 - i * 12}%`}
            height="12px"
            className="rounded-full"
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
          radius="2xl"
          elevation="none"
          borderless
          className={cn(
            stationIdentityPanelClass,
            stationIdentityPadClass,
            STATION_WORKBENCH_COLUMN,
            'flex min-h-9 items-center overflow-hidden',
            PRIMARY_CHROME_ROW_FACE,
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 px-0.5">
            <div className="flex shrink-0 items-center gap-1">
              <SkeletonBase width="64px" height="22px" className="rounded-full" />
              <SkeletonBase width="52px" height="22px" className="rounded-full" />
              <SkeletonBase width="36px" height="22px" className="rounded-full" />
            </div>
            <div className="mx-auto flex min-w-0 items-center justify-center gap-2">
              <SkeletonBase width="72px" height="14px" className="rounded-full" />
              <SkeletonBase width="48px" height="14px" className="rounded-full" />
              <SkeletonBase width="40px" height="14px" className="rounded-full" />
            </div>
          </div>
        </Panel>
      </div>
      <div className={stationMoreDetailsHostClass}>
        <Panel
          padding="none"
          radius="2xl"
          elevation="none"
          borderless
          className={cn(
            stationUtilityPanelClass,
            stationIdentityPadClass,
            stationIdentityGapClass,
            'flex min-h-9 items-center',
            PRIMARY_CHROME_ROW_FACE,
          )}
        >
          <SkeletonBase width="56px" height="24px" className="rounded-full" />
          <SkeletonBase circle width="28px" height="28px" />
          <SkeletonBase circle width="28px" height="28px" />
          <SkeletonBase circle width="28px" height="28px" />
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
        <SkeletonBase width="72px" height="32px" className="rounded-full" />
        <SkeletonBase width="80px" height="32px" className="rounded-full" />
        <SkeletonBase width="64px" height="32px" className="rounded-full" />
        <SkeletonBase width="56px" height="32px" className="rounded-full" />
        <SkeletonBase width="52px" height="32px" className="rounded-full" />
      </div>
      <SkeletonBase circle width="32px" height="32px" className="shrink-0" />
    </div>
  );
}

/** POUnboxingSection / SerialCard overview geometry. */
function UnboxProductSerialCard() {
  return (
    <WorkspaceCard variant="glass" bodyDensity="nested" bodyClassName="px-3 pt-3 pb-2">
      <div className="space-y-3" aria-hidden>
        <SkeletonBase width="68%" height="18px" className="rounded-md" />
        <div className="flex flex-wrap items-center gap-2">
          <SkeletonBase width="28px" height="16px" className="rounded-full" />
          <SkeletonBase width="48px" height="16px" className="rounded-full" />
          <SkeletonBase width="56px" height="16px" className="rounded-full" />
          <SkeletonBase width="44px" height="16px" className="rounded-full" />
          <SkeletonBase width="64px" height="16px" className="ml-auto rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBase circle width="36px" height="36px" className="shrink-0" />
          <SkeletonBase
            width="100%"
            height="40px"
            className="min-w-0 flex-1 rounded-xl"
          />
          <SkeletonBase width="40px" height="40px" className="shrink-0 rounded-xl" />
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
        <div className="mx-auto aspect-[2/1] w-full max-w-[480px] overflow-hidden rounded-sm bg-white ring-1 ring-border-soft/60">
          <div className="flex h-full items-stretch gap-1 p-1.5">
            <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
              <div className="flex items-start justify-between gap-2">
                <SkeletonBase width="72px" height="10px" className="rounded-full" />
                <SkeletonBase width="40px" height="10px" className="rounded-full" />
              </div>
              <div className="flex items-end justify-between gap-2">
                <SkeletonBase width="56px" height="10px" className="rounded-full" />
                <SkeletonBase width="48px" height="10px" className="rounded-full" />
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center gap-0.5">
              <div className="aspect-square h-[86%] w-auto animate-pulse rounded-sm bg-surface-strong" />
              <SkeletonBase width="40px" height="8px" className="rounded-full" />
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
            <SkeletonBase width="120px" height="24px" className="rounded-full" />
            <div className="flex items-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBase key={i} circle width="32px" height="32px" />
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
