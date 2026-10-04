import type { ReactNode } from 'react';

/**
 * The desk's mount for a mobile-first job (SURFACE_LAW §4 frame law): the
 * SAME tree the phone runs, in one centred phone-width column with thick
 * empty gutters. The frame owns the scroll, so the tree's floating dock
 * (`DetailDock placement="float"`) stays on the column's floor — nothing
 * between them may clip (no overflow on the column). Never a second desktop
 * layout: no `lg:hidden` / `hidden lg:block` pair inside it.
 */
export function MobileFirstFrame({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-surface-canvas px-4 sm:px-6" data-testid={testId}>
      <div className="flex min-h-full w-full max-w-md flex-col border-x border-border-soft">{children}</div>
    </div>
  );
}
