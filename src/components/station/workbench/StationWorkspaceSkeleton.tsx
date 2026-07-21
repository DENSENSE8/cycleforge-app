'use client';

/**
 * Station focused-overlay workspace skeleton — **SoT**.
 *
 * Mirrors StationWorkbench identity/header + stacked glass cards so the
 * handoff to LineEditPanel / TriagePanel feels continuous. Section cards
 * compose {@link Panel} — never hand-roll `rounded-2xl border…`.
 *
 * Domain wrappers (`ReceivingWorkspaceSkeleton`, `TriageWorkspaceSkeleton`)
 * pick the header variant + column recipe.
 */

import { SkeletonBase } from '@/design-system';
import { Panel } from '@/design-system/primitives/Panel';
import {
  STATION_WORKBENCH_BODY_COLUMN,
  STATION_WORKBENCH_HEADER_COLUMN,
} from '@/components/station/workbench/workbench-layout';
import { cn } from '@/utils/_cn';

type StationWorkspaceSkeletonHeader = 'stepper-toolbar' | 'toolbar' | 'none';

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

interface StationWorkspaceSkeletonProps {
  /**
   * `stepper-toolbar` — Unbox (stepper row + toolbar row).
   * `toolbar` — Triage (single toolbar band).
   * `none` — body cards only.
   */
  header?: StationWorkspaceSkeletonHeader;
  /** Override body column (default Station Workbench 720px). */
  bodyColumnClassName?: string;
  /** Override header column pad. */
  headerColumnClassName?: string;
  /** Row counts per stacked section card. */
  sectionRows?: readonly number[];
  /** Accessible label for the busy region. */
  label?: string;
  className?: string;
}

const DEFAULT_SECTION_ROWS = [2, 3, 2] as const;

export function StationWorkspaceSkeleton({
  header = 'stepper-toolbar',
  bodyColumnClassName = STATION_WORKBENCH_BODY_COLUMN,
  headerColumnClassName = STATION_WORKBENCH_HEADER_COLUMN,
  sectionRows = DEFAULT_SECTION_ROWS,
  label = 'Loading workspace',
  className,
}: StationWorkspaceSkeletonProps) {
  const showHeader = header !== 'none';

  return (
    <div
      className={cn('flex h-full w-full flex-col bg-surface-canvas', className)}
      aria-busy="true"
      aria-label={label}
    >
      {showHeader && header === 'stepper-toolbar' ? (
        <>
          <div className="shrink-0 border-b border-border-hairline bg-surface-card">
            <div
              className={cn(
                headerColumnClassName,
                'flex h-10 items-center justify-center gap-2',
              )}
            >
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonBase
                  key={i}
                  width={`${56 + (i % 2) * 12}px`}
                  height="24px"
                  className="rounded-full"
                />
              ))}
            </div>
          </div>
          <div className="flex h-10 shrink-0 items-center border-b border-border-hairline bg-surface-card">
            <div className={cn(headerColumnClassName, 'flex items-center justify-between')}>
              <div className="flex items-center gap-2">
                <SkeletonBase width="72px" height="28px" className="rounded-full" />
                <SkeletonBase width="88px" height="28px" className="rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonBase key={i} circle width="32px" height="32px" />
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {showHeader && header === 'toolbar' ? (
        <div className="flex h-10 shrink-0 items-center border-b border-border-hairline bg-surface-card">
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
          {sectionRows.map((rows, i) => (
            <SkeletonSectionCard key={i} rows={rows} />
          ))}
        </div>
      </div>
    </div>
  );
}
