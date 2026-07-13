'use client';

/**
 * Center region of the FBA page: the board table (PLANNED in plan mode, the
 * PACKED queue in combine), FloatingButton for combine/clear (receiving pattern),
 * and the combine workspace that crossfades over the board after combine.
 */

import { motion } from 'framer-motion';
import { motionBezier } from '@/design-system/foundations/motion-framer';
import { Package, X } from '@/components/Icons';
import { FloatingButton } from '@/design-system/primitives';
import { stationThemeColors } from '@/utils/staff-colors';
import { FbaErrorState } from '@/components/fba/FbaStateShells';
import { FbaBoardTable, type FbaBoardItem } from '@/components/fba/FbaBoardTable';
import { FbaCombineWorkspace } from '@/components/fba/sidebar/FbaCombineWorkspace';
import { FBA_BOARD_TOGGLE_ALL } from '@/lib/fba/events';
import type { StationTheme } from '@/hooks/useStationTheme';
import type { FbaMode } from '@/lib/fba/fba-modes';
import type { FbaWeekFilter } from '@/app/fba/useFbaWeekFilter';
import type { FbaCombine } from '@/app/fba/useFbaCombine';

interface FbaBoardRegionProps {
  error: string | null;
  onRetry: () => void;
  activeMode: FbaMode;
  stationTheme: StationTheme;
  prefersReducedMotion: boolean | null;
  loading: boolean;
  hasBoardItems: boolean;
  weekFilter: FbaWeekFilter;
  combine: FbaCombine;
  onDetailOpen: (item: FbaBoardItem) => void;
}

export function FbaBoardRegion({
  error,
  onRetry,
  activeMode,
  stationTheme,
  prefersReducedMotion,
  loading,
  hasBoardItems,
  weekFilter,
  combine,
  onDetailOpen,
}: FbaBoardRegionProps) {
  if (error) {
    return <FbaErrorState message={error} onRetry={onRetry} theme={stationTheme} />;
  }

  if (activeMode === 'shipped') {
    return (
      <div className="flex h-full flex-1 items-center justify-center px-5 text-center">
        <p className="max-w-sm text-role-caption font-black uppercase tracking-widest text-text-faint">
          Shipped mode is managed from the sidebar table.
        </p>
      </div>
    );
  }

  const { weekRange, weekOffset, setWeekOffset, filteredPendingItems, boardEmptyMessage } = weekFilter;
  const { boardSelection, selectedUnits, workspaceActive, showCombineBar, handleStartCombine } =
    combine;
  const theme = stationThemeColors[stationTheme];

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-canvas">
      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-[1440px] min-w-0 flex-1 flex-col overflow-hidden">
        <FbaBoardTable
          items={filteredPendingItems}
          loading={loading && !hasBoardItems}
          stationTheme={stationTheme}
          emptyMessage={boardEmptyMessage}
          onDetailOpen={onDetailOpen}
          weekRange={weekRange}
          weekOffset={weekOffset}
          onPrevWeek={() => setWeekOffset((o) => o - 1)}
          onNextWeek={() => setWeekOffset((o) => Math.min(0, o + 1))}
          // Reserve space so the last rows clear the floating combine pill.
          contentClassName={showCombineBar ? 'pb-28' : undefined}
        />
      </div>

      {/* Same FloatingButton pattern as receiving (primary CTA + split Clear menu). */}
      {showCombineBar ? (
        <FloatingButton
          label={`Combine ${boardSelection.length} item${boardSelection.length === 1 ? '' : 's'} · ${selectedUnits} unit${selectedUnits === 1 ? '' : 's'}`}
          onClick={handleStartCombine}
          icon={<Package className="h-4 w-4 shrink-0" />}
          tone="violet"
          toneClasses={{ bg: theme.bg, hover: theme.hover }}
          maxWidth="max-w-[720px]"
          menuLabel="Selection actions"
          menuTitle="Clear or adjust selection"
          menu={[
            {
              label: 'Clear selection',
              icon: <X className="h-3.5 w-3.5 shrink-0" />,
              onClick: () =>
                window.dispatchEvent(new CustomEvent(FBA_BOARD_TOGGLE_ALL, { detail: 'none' })),
            },
          ]}
        />
      ) : null}

      {activeMode === 'combine' && (
        <motion.div
          className="absolute inset-0 z-10 bg-surface-card"
          initial={false}
          animate={
            prefersReducedMotion
              ? { opacity: workspaceActive ? 1 : 0 }
              : { opacity: workspaceActive ? 1 : 0, y: workspaceActive ? 0 : 6 }
          }
          transition={{ duration: 0.18, ease: motionBezier.easeOut }}
          style={{ pointerEvents: workspaceActive ? 'auto' : 'none' }}
          aria-hidden={!workspaceActive}
        >
          <FbaCombineWorkspace
            selectedItems={boardSelection}
            stationTheme={stationTheme}
            onClose={() => combine.setCombineOpen(false)}
          />
        </motion.div>
      )}
    </div>
  );
}
