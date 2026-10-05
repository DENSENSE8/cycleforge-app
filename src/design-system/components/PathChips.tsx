'use client';

/**
 * PathChips — an ordered physical path as chips (SURFACE_LAW §5: an ordered
 * path is path chips, never TabSwitch): `Rooms › Zone 3 › Aisle 03 › Bay 10`.
 * The current chip is solid; a finished chip jumps back (a link or a press);
 * a chip with neither is not reached yet. Every chip is a ≥44 px Button; the
 * row scrolls sideways and keeps the current chip in view.
 */

import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useRef } from 'react';
import { Button } from '@/design-system/primitives/Button';

export interface PathChip {
  id: string;
  /** What the step is (`Aisle`); omitted for a chip that is only a name (`Rooms`). */
  label?: string;
  /** What was picked (`03`); '—' paints when a labelled chip has none yet. */
  value?: string;
  /** Jump target — a route … */
  href?: string;
  /** … or a press. A chip with neither (and not current) is disabled. */
  onSelect?: () => void;
  testId?: string;
}

export function PathChips({
  chips,
  currentId,
  ariaLabel,
  testId,
  density = 'default',
}: {
  chips: readonly PathChip[];
  currentId: string;
  ariaLabel: string;
  testId?: string;
  /** Compact is the small pill face used by dense address builders. */
  density?: 'default' | 'compact';
}) {
  const router = useRouter();
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>('[aria-current]');
    if (nav && chip) nav.scrollLeft = chip.offsetLeft - (nav.clientWidth - chip.offsetWidth) / 2;
  }, [currentId]);

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className="relative shrink-0 overflow-x-auto px-mode-page py-2 [scrollbar-width:none]"
      data-testid={testId}
    >
      <ol className="flex w-max items-center gap-1">
        {chips.map((chip, index) => {
          const current = chip.id === currentId;
          const reached = current || chip.value != null || chip.label == null;
          const text = (
            <>
              {chip.label ? <span className="text-role-caption opacity-80">{chip.label}</span> : null}
              {chip.label ? (
                <span className="font-mono text-role-caption tabular-nums">{chip.value ?? '—'}</span>
              ) : (
                <span className="text-role-caption">{chip.value}</span>
              )}
            </>
          );
          return (
            <Fragment key={chip.id}>
              <li>
                <Button
                  variant={current ? 'primary' : reached ? 'primarySoft' : 'secondary'}
                  size={density === 'compact' ? 'sm' : 'lg'}
                  radius={density === 'compact' ? 'pill' : 'surface'}
                  className={density === 'compact' ? 'h-8 min-h-8 gap-1 px-2' : 'min-h-11 gap-1.5 px-3'}
                  // Button's `href` is an external link (new tab); a path chip is an in-app jump.
                  onClick={current ? undefined : chip.onSelect ?? (chip.href ? () => router.push(chip.href!) : undefined)}
                  disabled={!current && !chip.href && !chip.onSelect}
                  aria-current={current ? 'step' : undefined}
                  data-testid={chip.testId}
                >
                  {text}
                </Button>
              </li>
              {index < chips.length - 1 ? (
                <li aria-hidden className="px-0.5 text-role-caption text-text-faint">
                  ›
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
