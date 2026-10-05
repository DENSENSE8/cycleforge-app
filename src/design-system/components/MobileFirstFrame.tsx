import type { ReactNode } from 'react';

/**
 * The desk's mount for a mobile-first job (SURFACE_LAW §4 frame law): the
 * SAME tree the phone runs. Most jobs use one centred phone-width column;
 * `workspace` lets a composition progressively disclose a wider desktop
 * arrangement without forking the tree; `column` fills a host grid column
 * edge to edge (the host's neighbouring panes draw the 1px rules), so a
 * three-pane desk has no canvas gap around the job. The frame owns the scroll,
 * so the tree's floating dock (`DetailDock placement="float"`) stays on the
 * column's floor — nothing between them may clip (no overflow on the column).
 * Never a second desktop layout: no `lg:hidden` / `hidden lg:block` pair inside it.
 */
export function MobileFirstFrame({
  children,
  testId,
  width = 'phone',
}: {
  children: ReactNode;
  testId?: string;
  width?: 'phone' | 'workspace' | 'column';
}) {
  if (width === 'column') {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-mode-panel" data-testid={testId}>
        <div className="flex min-h-full w-full flex-col">{children}</div>
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-surface-canvas px-4 sm:px-6" data-testid={testId}>
      <div className={`flex min-h-full w-full flex-col border-x border-border-soft ${width === 'workspace' ? 'max-w-7xl' : 'max-w-md'}`}>
        {children}
      </div>
    </div>
  );
}
