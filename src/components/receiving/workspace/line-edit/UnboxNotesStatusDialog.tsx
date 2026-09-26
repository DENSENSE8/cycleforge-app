'use client';

/** @domain-job Unbox notes Info overlay — line receive/print/stage exacts in a center dialog. */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { CompactActivityRow } from '@/components/ui/CompactActivityRow';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { cn } from '@/utils/_cn';
import {
  buildLineStatusExacts,
  type LineStatusExactSource,
} from '@/lib/receiving/unbox-notes-status';

const STAMP_DOT: Record<string, string> = {
  'door-scan': 'bg-blue-500',
  opened: 'bg-violet-500',
  unboxed: 'bg-violet-500',
  received: 'bg-emerald-500',
  printed: 'bg-amber-500',
  staged: 'bg-emerald-500',
};

export function UnboxNotesStatusDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: LineStatusExactSource;
}) {
  const stamps = buildLineStatusExacts(row);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Item status</DialogTitle>
          <DialogDescription>
            Receive, print, and putaway stamps for this line.
          </DialogDescription>
        </DialogHeader>
        {stamps.length === 0 ? (
          <p className="text-role-caption text-text-soft">
            No receive stamps on this line yet.
          </p>
        ) : (
          <ul className="divide-y divide-border-hairline" data-unbox-notes-status>
            {stamps.map((stamp) => (
              <li key={stamp.key} className="py-2">
                <CompactActivityRow
                  leading={
                    <span
                      className={cn(
                        'block h-2 w-2 shrink-0 rounded-full',
                        STAMP_DOT[stamp.key] ?? 'bg-surface-strong',
                      )}
                      aria-hidden
                    />
                  }
                  activityAt={stamp.at}
                >
                  <RailRowBody
                    vm={{
                      title: stamp.title,
                      titleAttr: stamp.title,
                      meta: (
                        <span className="truncate text-text-soft">{stamp.meta}</span>
                      ),
                    }}
                  />
                </CompactActivityRow>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
