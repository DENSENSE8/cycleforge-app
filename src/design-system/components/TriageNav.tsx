'use client';

import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

export type TriageNavItem = {
  id: string;
  label: string;
};

export function TriageNav({
  items,
  activeId,
  onJump,
}: {
  items: readonly TriageNavItem[];
  activeId: string;
  onJump: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Section jump"
      className="sticky top-0 flex h-full w-48 flex-col gap-0.5 self-start border-r border-border-hairline bg-surface-card px-2 py-3"
      data-testid="triage-scroll-nav"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            aria-current={active ? 'location' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onJump(item.id);
            }}
            className={cn(
              'px-2 py-1.5 text-left text-role-caption',
              focusRing('control'),
              active
                ? 'bg-surface-sunken font-semibold text-text-default'
                : 'text-text-soft hover:bg-surface-hover',
            )}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
