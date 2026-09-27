'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { GO_IDLE, GO_TIMEOUT_MS, goReduce, type GoState } from '@/lib/keyboard/go-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { NAV_GO_PAGES } from '@/lib/nav/go-keys';
import { getSidebarPageNav } from '@/lib/sidebar-navigation';
import { KeyboardKey } from '@/design-system/primitives';
import { elevationClass } from '@/design-system/tokens/shadows';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';
import { useLaneDoorHref } from './useLaneDoorHref';

type GoTarget = { letter: string; id: string; label: string; href: string; current: boolean };

/**
 * `G` then a letter opens a parent-level page from anywhere on the desk:
 * `G S` Shipping, `G F` FBA, `G L` Label intake (`NAV_GO_PAGES`). Targets
 * come straight from the static registry — label, icon and href from
 * `getSidebarPageNav`, gated by the same `requires` permission the resolver
 * applies (build.ts `pipelinePage`) — so no page state is needed and the keys
 * work on every page. Shipping opens the staffer's last view (`useLaneDoorHref`).
 * While `G` is armed a card to the RIGHT of the sidebar lists every letter.
 */
export function NavGoKeys({ currentPageId }: { currentPageId: string | undefined }) {
  const router = useRouter();
  const { user } = useAuth();
  const doorHref = useLaneDoorHref();
  const permissions = user?.permissions;
  const targets = useMemo<GoTarget[]>(
    () =>
      Object.entries(NAV_GO_PAGES).flatMap(([letter, pageId]) => {
        const page = getSidebarPageNav(pageId);
        if (!page || (page.requires && !permissions?.includes(page.requires))) return [];
        return [{ letter, id: pageId, label: page.label, href: doorHref(pageId) ?? page.href, current: pageId === currentPageId }];
      }),
    [permissions, doorHref, currentPageId],
  );
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const state = useRef<GoState>(GO_IDLE);
  const lastKeyAt = useRef(0);
  const [armed, setArmed] = useState(false);

  // The `?` / ⌘⇧? sheet lists the go keys while this lane is on screen.
  useEffect(() => {
    if (targets.length === 0) return undefined;
    return registerShortcutOverviewGroup({
      id: 'sidebar-go',
      title: 'Go to (G then letter)',
      rows: targets.map((target) => ({ keys: ['G', target.letter.toUpperCase()], label: target.label })),
    });
  }, [targets]);

  useEffect(() => {
    let timer: number | null = null;
    const disarmLater = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        state.current = GO_IDLE;
        setArmed(false);
      }, GO_TIMEOUT_MS);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const at = event.timeStamp;
      const previousAt = lastKeyAt.current;
      lastKeyAt.current = at;
      if (event.defaultPrevented || event.isComposing || hasOpenOverlay()) return;
      const step = goReduce(
        state.current,
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
          editable: isEditableKeyTarget(event.target),
          at,
          previousAt,
        },
        (letter) => targetsRef.current.some((target) => target.letter === letter),
      );
      state.current = step.state;
      if (step.consumed) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (step.action.type === 'arm') {
        setArmed(true);
        disarmLater();
      } else if (step.action.type !== 'none') {
        setArmed(false);
        if (step.action.type === 'go') {
          const letter = step.action.letter;
          const target = targetsRef.current.find((entry) => entry.letter === letter);
          if (target && !target.current) router.push(target.href);
        }
      }
    };
    const onPointerDown = () => {
      state.current = GO_IDLE;
      setArmed(false);
    };
    // Capture: once `G` is armed, its letter belongs to the sequence even when
    // that letter is also a bare key elsewhere (`F` Find, `B` paste list).
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [router]);

  if (!armed || targets.length === 0 || typeof document === 'undefined') return null;
  return createPortal(<GoHud targets={targets} />, document.body);
}

/** The armed card: flush to the sidebar's right edge, level with the mode switcher. */
function GoHud({ targets }: { targets: readonly GoTarget[] }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const column = document.querySelector('[data-contextual-sidebar]')?.getBoundingClientRect();
    const anchor = document.querySelector('[data-nav-switcher="mode"]')?.getBoundingClientRect();
    if (column) setAt({ left: column.right, top: anchor?.top ?? column.top + 96 });
  }, []);
  if (!at) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Go to: ${targets.map((target) => `${target.letter.toUpperCase()} ${target.label}`).join(', ')}`}
      data-nav-go-hud
      style={{ position: 'fixed', left: at.left, top: at.top }}
      className={cn('z-popover min-w-56 border border-border-soft bg-surface-card p-1 text-text-default', DROPDOWN_SHELL_CORNER, elevationClass('overlay'))}
    >
      <p className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-role-caption text-text-muted">
        <KeyboardKey size="xs">G</KeyboardKey>
        then
      </p>
      {targets.map((target) => {
        const Icon = getSidebarPageNav(target.id)?.icon;
        return (
          <div
            key={target.id}
            data-nav-go-target={target.id}
            className={cn('flex items-center gap-2 px-2 py-1.5 text-role-body', target.current && 'font-medium')}
          >
            {Icon ? (
              <span aria-hidden className="flex shrink-0">
                <Icon className={navIconStrokeClass('size-4 text-text-default')} />
              </span>
            ) : null}
            <KeyboardKey size="xs">{target.letter.toUpperCase()}</KeyboardKey>
            <span className="min-w-0 flex-1 truncate">{target.label}</span>
          </div>
        );
      })}
    </div>
  );
}
