'use client';

/**
 * Outbound sidebar filter map body — smart segments + saved views.
 * Lane/staff refinements live in DataTable's filter (To-ship gold), not here.
 */

import { useMemo, type ComponentType } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AlertTriangle, User } from '@/components/Icons';
import { unshippedQueueCountsQuery } from '@/lib/queries/dashboard-queries';
import { cn } from '@/utils/_cn';
import { useOutboundSidebarScope } from '@/components/unshipped/useOutboundSidebarScope';
import { OutboundSavedViewsList } from '@/components/unshipped/OutboundSavedViewsList';
import {
  RAIL_OWNED_SEGMENT_IDS,
  type RailOwnedSegmentId,
} from '@/components/unshipped/outbound-sidebar-shared';
import { NAV_ROW } from '@/components/ui/queue-row-chrome';

const EYEBROW = 'text-role-eyebrow uppercase tracking-widest text-text-soft';

const ROW =
  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors';
const ROW_IDLE = 'hover:bg-surface-hover text-text-muted';
const ROW_ACTIVE = NAV_ROW.selectedClass;

type SegmentRow = {
  id: RailOwnedSegmentId;
  label: string;
  count: number | null;
  icon: ComponentType<{ className?: string }>;
  toneClass?: string;
  disabled?: boolean;
  tooltip?: string;
};

/**
 * Label + glyph for each rail-owned facet. A total `Record<RailOwnedSegmentId>`
 * so a new `'rail'` owner in {@link OUTBOUND_FACET_OWNER} is a compile error
 * here until its face is declared.
 */
const RAIL_SEGMENT_FACE: Record<
  RailOwnedSegmentId,
  { label: string; icon: ComponentType<{ className?: string }> }
> = {
  mine: { label: 'My queue', icon: User },
};

/**
 * The Focus rail owns ONLY personal scope (`mine`). Lifecycle stages live in the
 * Band-1 tabs; Urgent / Out-of-stock live in the Band-2 KPI strip. Rows are built
 * from {@link RAIL_OWNED_SEGMENT_IDS} so the rail can never restate a tab or a
 * KPI tile — see `outbound-sidebar-shared.ts` → OUTBOUND_FACET_OWNER (report
 * P1/P5/P8). Guard: `outbound-rail-dedup.guard.test.ts`.
 */
function UnshippedSegments() {
  const { myStaffId, activeUnshippedSegment, selectUnshippedSegment } =
    useOutboundSidebarScope();

  /**
   * NOT the same answer as the desk's canonical `{ staffId: null }` counts, so
   * it is deliberately NOT merged onto that key. `?staff=` on
   * `/api/orders/queue-counts` adds a `work_assignments` EXISTS clause, and the
   * unscoped payload carries no per-staff breakdown to `select` this total off
   * — total / byStage / urgent / combos are all org-wide there. Merging the two
   * keys would paint the whole backlog on the "My queue" row.
   *
   * The cost is real: `myStaffId` comes from the session, not `?staff=`, so a
   * desk with no staff filter runs this ~15s query a SECOND time alongside the
   * unscoped one (they collapse only while the operator is filtered to
   * themselves). The fix is a `mine` tally on the unscoped payload — one
   * `COUNT(*) FILTER (WHERE assigned to $me)` in the route — after which this
   * becomes a `select` off the canonical key. Do not "dedupe" it before then.
   */
  const { data: myCounts } = useQuery({
    ...unshippedQueueCountsQuery({ staffId: myStaffId ?? undefined }),
    enabled: myStaffId != null,
  });

  const rows: SegmentRow[] = useMemo(
    () =>
      RAIL_OWNED_SEGMENT_IDS.map((id): SegmentRow => {
        const face = RAIL_SEGMENT_FACE[id];
        // `mine` is the only rail-owned facet today; its count is the operator's
        // own open-queue total and it disables until they sign in as staff.
        return {
          id,
          label: face.label,
          icon: face.icon,
          count: myStaffId != null ? (myCounts?.total ?? null) : null,
          disabled: myStaffId == null,
          tooltip: myStaffId == null ? 'Sign in as staff to scope your queue' : undefined,
        };
      }),
    [myCounts, myStaffId],
  );

  return (
    <section className="space-y-1.5" aria-label="Queue segments">
      <p className={EYEBROW}>Focus</p>
      <ul className="space-y-0.5">
        {rows.map((row) => {
          const isActive = activeUnshippedSegment === row.id;
          const Icon = row.icon;
          const button = (
            <button
              type="button"
              disabled={row.disabled}
              onClick={() => selectUnshippedSegment(row.id)}
              className={cn(
                ROW,
                isActive ? ROW_ACTIVE : ROW_IDLE,
                row.disabled && 'cursor-not-allowed opacity-50',
                row.toneClass,
              )}
            >
              <Icon className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-blue-600' : 'text-text-faint')} />
              <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">{row.label}</span>
              {row.count != null ? (
                <span
                  className={cn(
                    'tabular-nums text-role-caption font-semibold',
                    isActive ? 'text-blue-700' : 'text-text-faint',
                  )}
                >
                  {row.count.toLocaleString()}
                </span>
              ) : null}
            </button>
          );
          return (
            <li key={row.id}>
              {row.tooltip ? (
                <HoverTooltip label={row.tooltip} asChild>
                  {button}
                </HoverTooltip>
              ) : (
                button
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ShippedSegments() {
  const { shipped, setStaff, myStaffId, staffId } = useOutboundSidebarScope();
  const exceptionsOnly = shipped.state.exceptionsOnly;
  const { toggleExceptions } = shipped.actions;
  const mineActive = myStaffId != null && staffId === myStaffId;

  return (
    <section className="space-y-1.5" aria-label="Shipped focus">
      <p className={EYEBROW}>Focus</p>
      <ul className="space-y-0.5">
        <li>
          <button
            type="button"
            onClick={toggleExceptions}
            className={cn(ROW, exceptionsOnly ? ROW_ACTIVE : ROW_IDLE)}
          >
            <AlertTriangle
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                exceptionsOnly ? 'text-blue-600' : 'text-amber-500',
              )}
            />
            <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">Needs attention</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={myStaffId == null}
            onClick={() => setStaff(mineActive ? null : myStaffId)}
            className={cn(
              ROW,
              mineActive ? ROW_ACTIVE : ROW_IDLE,
              myStaffId == null && 'cursor-not-allowed opacity-50',
            )}
          >
            <User className={cn('h-3.5 w-3.5 shrink-0', mineActive ? 'text-blue-600' : 'text-text-faint')} />
            <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">My queue</span>
          </button>
        </li>
      </ul>
    </section>
  );
}

function PackedSegments() {
  const { setStaff, myStaffId, staffId } = useOutboundSidebarScope();
  const mineActive = myStaffId != null && staffId === myStaffId;

  return (
    <section className="space-y-1.5" aria-label="Packed focus">
      <p className={EYEBROW}>Focus</p>
      <ul className="space-y-0.5">
        <li>
          <button
            type="button"
            disabled={myStaffId == null}
            onClick={() => setStaff(mineActive ? null : myStaffId)}
            className={cn(
              ROW,
              mineActive ? ROW_ACTIVE : ROW_IDLE,
              myStaffId == null && 'cursor-not-allowed opacity-50',
            )}
          >
            <User className={cn('h-3.5 w-3.5 shrink-0', mineActive ? 'text-blue-600' : 'text-text-faint')} />
            <span className="min-w-0 flex-1 truncate text-role-caption font-semibold">My queue</span>
          </button>
        </li>
      </ul>
    </section>
  );
}

/** Scroll body for the Outbound rail (segments + saved views). */
export function OutboundSidebarFilterMap() {
  const { mode } = useOutboundSidebarScope();
  const isPrePack = mode === 'unshipped' || mode === 'tested';

  return (
    <div className="space-y-4">
      {isPrePack ? (
        <UnshippedSegments />
      ) : mode === 'packed' ? (
        <PackedSegments />
      ) : (
        <ShippedSegments />
      )}
      <OutboundSavedViewsList mode={isPrePack ? 'unshipped' : mode} />
    </div>
  );
}
