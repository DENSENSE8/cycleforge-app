import { TASK_STATUS_FACE, type TaskStatus } from '../tokens/task-status';
import { chipLabel, microBadge } from '../tokens/typography/presets';
import { cn } from '@/utils/_cn';

/**
 * A task's status as a colour pill, glyph first (`TASK_STATUS_FACE`) — the
 * board row's line 2, the phone row, the record's combobox trigger. `sm`
 * (the micro badge face) sits on an 11px row line; `md` (the chip label
 * face) on a record line.
 */
export function TaskStatusPill({
  status,
  size = 'sm',
  className,
}: {
  status: TaskStatus;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const face = TASK_STATUS_FACE[status];
  const Icon = face.icon;
  return (
    <span
      data-task-status={status}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full ring-1 ring-inset',
        size === 'sm' ? cn(microBadge, 'h-4 gap-0.5 px-1.5 leading-none') : cn(chipLabel, 'h-6 gap-1 px-2'),
        face.pill,
        face.ring,
        className,
      )}
    >
      <Icon aria-hidden className={size === 'sm' ? 'size-2.5' : 'size-3.5'} strokeWidth={2.5} />
      {face.label}
    </span>
  );
}
