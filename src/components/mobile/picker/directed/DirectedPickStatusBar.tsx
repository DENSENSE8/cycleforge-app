'use client';

import { useRouter } from 'next/navigation';
import { X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { ProgressBar } from '@/design-system/primitives/ProgressBar';

/** Past this many units the segmented face turns to hairlines — draw a plain fill instead. */
const MAX_SEGMENTS = 24;

/** The pick board: every open pick nobody owns, and who holds the rest. */
export const PICK_UNASSIGNED_HREF = '/m/pick/unassigned';

/** The directed picker's top band, one row: */
export function DirectedPickStatusBar({
  done,
  total,
  unassignedCount,
  onExit,
}: {
  done: number;
  total: number;
  unassignedCount: number;
  onExit: () => void;
}) {
  const router = useRouter();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-card pr-3">
      <IconButton icon={<X className="h-5 w-5" aria-hidden />} ariaLabel="End picking" size="touch" onClick={onExit} />
      <div className="min-w-0 flex-1">
        {total > 0 && total <= MAX_SEGMENTS ? (
          <ProgressBar current={done} goal={total} segments={total} label="Picking progress" />
        ) : (
          <div role="progressbar" aria-label="Picking progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <ProgressBar current={done} goal={Math.max(total, 1)} showPercentage={false} showRemaining={false} />
          </div>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        radius="flush"
        className="shrink-0 font-mono tabular-nums"
        aria-label={`${unassignedCount} unassigned picks`}
        onClick={() => router.push(PICK_UNASSIGNED_HREF)}
      >
        Unassigned · {unassignedCount}
      </Button>
      <span className="shrink-0 font-mono text-role-title tabular-nums text-text-default" aria-label={`${done} of ${total} picked`}>
        {done} / {total}
      </span>
    </header>
  );
}
