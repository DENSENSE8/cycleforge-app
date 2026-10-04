'use client';

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { GO_IDLE, GO_TIMEOUT_MS, goReduce, type GoState } from '@/lib/keyboard/go-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { navGoDestinations } from '@/lib/nav/go-keys';
import { applyChildTarget, filterPageChildren, getSidebarPageNav } from '@/lib/sidebar-navigation';
import { KeyboardKey } from '@/design-system/primitives';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { aiTransition } from '@/design-system/ai';
import { motionDuration, motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { elevationClass } from '@/design-system/tokens/shadows';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';
import { useLaneDoorHref } from './useLaneDoorHref';
import { NAV_VIEW_ICONS } from './nav-view-icons';
import {
  publishGoArmed,
  publishGoTargets,
  publishKeyPressed,
  useGoKeys,
  type GoTarget,
} from './go-keys-store';

/**
 * `G` then a letter opens one of the CURRENT lane's modes: on Shipping's lane
 * `G S` Shipping, `G F` FBA, `G L` Label intake; on Inbound's `G D`
 * Deliveries, `G S` Sourcing (`NAV_GO_KEYS`, per lane — a letter never
 * reaches another lane's page). A page may add letters for its own CHILDREN
 * (`NAV_PAGE_GO_KEYS`: Exceptions' `G F` Fulfillment · `G I` Inventory ·
 * `G R` Receiving). Targets come straight from the static registry — label,
 * icon and href from `getSidebarPageNav` (a child: its `to()` from the page
 * root, and its view glyph), gated by the same permission the resolver
 * applies (build.ts `pipelinePage` / `filterPageChildren`) — so no page state
 * is needed. Shipping opens the staffer's last view (`useLaneDoorHref`).
 *
 * The sequence is published (`go-keys-store`) so it is taught where the eye
 * already is: a desk or Scan Stations parent switcher teaches the same
 * destinations, and a desk header's key strip (`NavKeyStrip`) swaps to the next
 * keys while `G` is armed, top-middle between title and verbs. With no strip
 * on screen (fullscreen, Chat, or a station) the same hint card sits top-centre
 * under the app header instead. Nothing shades or outlines the list (owner
 * 2026-09-27).
 */
export function NavGoKeys({
  currentPageId,
  currentItemId,
}: {
  currentPageId: string | undefined;
  /** The panel's lit item (a child id) — the child target that is already here. */
  currentItemId: string | undefined;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const doorHref = useLaneDoorHref();
  const permissions = user?.permissions;
  const targets = useMemo<GoTarget[]>(() => {
    const granted = new Set(permissions ?? []);
    return navGoDestinations(currentPageId).flatMap(({ letter, pageId, childId }): GoTarget[] => {
      const page = getSidebarPageNav(pageId);
      if (!page || (page.requires && !granted.has(page.requires))) return [];
      if (childId === undefined) {
        const href = doorHref(pageId) ?? page.href;
        return [{ letter, id: pageId, label: page.label, href, current: pageId === currentPageId, icon: page.icon, tone: page.tone }];
      }
      const child = filterPageChildren(page, granted).children?.find((entry) => entry.id === childId);
      if (!child) return [];
      const target = applyChildTarget({ pathname: page.href, params: new URLSearchParams() }, child.to());
      const glyph = NAV_VIEW_ICONS[`${pageId}.${childId}`];
      return [{
        letter,
        id: childId,
        label: child.label,
        href: target.search ? `${target.pathname}?${target.search}` : target.pathname,
        current: childId === currentItemId,
        icon: glyph?.icon ?? child.icon,
        tone: glyph?.tone,
      }];
    });
  }, [permissions, doorHref, currentPageId, currentItemId]);
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const state = useRef<GoState>(GO_IDLE);
  const lastKeyAt = useRef(0);
  const { armed, strips } = useGoKeys();

  useEffect(() => {
    publishGoTargets(targets);
  }, [targets]);

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
    let timer: number | undefined;
    const disarm = () => {
      window.clearTimeout(timer);
      state.current = GO_IDLE;
      publishGoArmed(false);
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
        publishGoArmed(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(disarm, GO_TIMEOUT_MS);
      } else if (step.action.type !== 'none') {
        disarm();
        if (step.action.type === 'go') {
          const letter = step.action.letter;
          const target = targetsRef.current.find((entry) => entry.letter === letter);
          publishKeyPressed(`go:${letter}`);
          if (target && !target.current) router.push(target.href);
        }
      }
    };
    // Capture: once `G` is armed, its letter belongs to the sequence even when
    // that letter is also a bare key elsewhere (`F` Find, `B` paste list).
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', disarm);
    return () => {
      disarm();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', disarm);
    };
  }, [router]);

  return <GoHud targets={targets} on={armed && strips === 0 && targets.length > 0} />;
}

/**
 * Fallback while armed with no header strip (fullscreen, Chat, a station):
 * the same parent-level hint, top-centre over the content under the app
 * header — never an overlay on the list (owner 2026-09-27).
 */
function GoHud({ targets, on }: { targets: readonly GoTarget[]; on: boolean }) {
  const [at, setAt] = useState<KeyHintAt | null>(null);
  // Measured each time `G` arms, so collapse / resize never leave it stale.
  useEffect(() => {
    if (!on) {
      setAt(null);
      return;
    }
    const column = document.querySelector('[data-contextual-sidebar]')?.getBoundingClientRect();
    const header = document.querySelector('header')?.getBoundingClientRect();
    const left = column ? column.right : 0;
    setAt({ centerX: left + (window.innerWidth - left) / 2, top: (header?.bottom ?? 48) + 8 });
  }, [on]);
  // No `[G] then` lead: the staffer just pressed it (the mode card's hover hint keeps it — that one teaches).
  return <KeyHintPopover id="go" at={at} rows={goHintRows(targets)} />;
}

/** One row of a key hint: its caps, then what they open. */
export type KeyHintRow = {
  id: string;
  keys: readonly string[];
  /** `go-keys-store` `pressed` id of the row's last key, so it presses in when fired. */
  pressedId: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  iconTone?: string;
  current?: boolean;
  /** Optional category label ("Outbound", "Inbound"): painted once, muted, above the first row of each run. */
  group?: string;
  /** A live count the row's verb holds (the pasted list's size) — ticks with AnimatedStat. */
  count?: number;
};

/**
 * The `G` destinations as hint rows: `[S] Shipping` under a `[G] then` lead
 * (`GO_HINT_LEAD`) — the `G` is said once, never repeated per row.
 */
export function goHintRows(targets: readonly GoTarget[]): KeyHintRow[] {
  return targets.map((target) => ({
    id: target.id,
    keys: [target.letter.toUpperCase()],
    pressedId: `go:${target.letter}`,
    label: target.label,
    icon: target.icon,
    iconTone: target.tone,
    current: target.current,
  }));
}

/** The lead line over `goHintRows`: `[G] then`. */
export const GO_HINT_LEAD = (
  <>
    <KeyboardKey size="xs">G</KeyboardKey>
    then
  </>
);

/**
 * The key hint card — HOTKEY FIRST: each row's key sits at the far left,
 * flush against its icon (`[S]⌂ Shipping`, `[4]⌂ To ship`), one row per
 * choice. It teaches, it is never pressed: the sidebar switchers paint it on
 * hover, the go HUD while `G` is armed with no header strip. `cascade`: the
 * rows settle top → bottom, each row as ONE unit (the search well's card).
 */
export function KeyHintCard({
  rows,
  lead,
  cascade = false,
}: {
  rows: readonly KeyHintRow[];
  lead?: ReactNode;
  cascade?: boolean;
}) {
  const { pressed } = useGoKeys();
  const rowPresence = useMotionPresence(motionPresence.findKeyRow);
  const rowTransition = useMotionTransition(motionTransition.findKeyRow);
  const reduce = useReducedMotion();
  return (
    <div className={cn('min-w-56 border border-border-soft bg-surface-card p-1 text-text-default', DROPDOWN_SHELL_CORNER, elevationClass('overlay'))}>
      {lead ? <p className="flex items-center gap-1.5 px-2 pb-1 pt-0.5 text-role-caption text-text-muted">{lead}</p> : null}
      {rows.map((row, rowIndex) => {
        const Icon = row.icon;
        const groupStarts = row.group !== undefined && row.group !== rows[rowIndex - 1]?.group;
        return (
          <Fragment key={row.id}>
          {groupStarts ? (
            <p
              data-nav-key-hint-group={row.group}
              className={cn('select-none px-2 pb-0.5 text-left text-role-micro text-text-muted', rowIndex > 0 ? 'mt-1 border-t border-border-soft pt-1.5' : 'pt-0.5')}
            >
              {row.group}
            </p>
          ) : null}
          <motion.div
            data-nav-key-hint-row={row.id}
            {...(cascade
              ? {
                  initial: rowPresence.initial,
                  animate: rowPresence.animate,
                  transition: reduce
                    ? rowTransition
                    : { ...rowTransition, delay: (rowIndex + 1) * motionDuration.findKeyRowStagger },
                }
              : {})}
            className={cn('flex items-center gap-2 px-2 py-1.5 text-role-body', row.current && 'bg-surface-sunken font-medium', DROPDOWN_SHELL_CORNER)}
          >
            <span className="flex shrink-0 items-center gap-1">
              {row.keys.map((key, index) => (
                <KeyboardKey
                  key={index}
                  size="xs"
                  className={cn(index === row.keys.length - 1 && pressed === row.pressedId && KEY_PRESSED_CLASS)}
                >
                  {key}
                </KeyboardKey>
              ))}
              {Icon ? <Icon aria-hidden className={navIconStrokeClass(cn('size-4 shrink-0', row.iconTone ?? 'text-text-default'))} /> : null}
            </span>
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {row.count !== undefined ? <AnimatedStat value={row.count} className="shrink-0 text-role-caption text-text-muted" /> : null}
          </motion.div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** A cap the keyboard just pressed: sinks 1px and loses its lip for one beat. */
export const KEY_PRESSED_CLASS = 'translate-y-px bg-surface-sunken shadow-none transition-[transform,box-shadow,background-color] duration-75';

/** The AI context ring's card pop: fade + 0.96 → 1 scale on the `morph` spring. */
const KEY_HINT_POP = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

/**
 * Where a key hint hangs: the sidebar column's right edge, level with its
 * trigger (`left`); under a top-right header control, flush with its right
 * edge (`right`, px from the viewport's right) — it then grows from
 * top-right; or centred on `centerX` (the `G` fallback), growing from top-centre.
 */
export type KeyHintAt = { top: number } & ({ left: number } | { right: number } | { centerX: number });

/**
 * The hover half of a sidebar switcher: pointer (mouse only) on the trigger
 * → the hint hangs beside the column at the trigger's top, instantly;
 * pointer off → it leaves. Measured at hover time, so collapse and resize
 * never leave it stale.
 */
export function useKeyHintAnchor(enabled: boolean) {
  const [at, setAt] = useState<KeyHintAt | null>(null);
  return {
    at,
    hide: () => setAt(null),
    onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse' || !enabled) return;
      const column = event.currentTarget.closest('[data-contextual-sidebar]')?.getBoundingClientRect();
      const rect = event.currentTarget.getBoundingClientRect();
      setAt({ left: (column?.right ?? rect.right) + 4, top: rect.top });
    },
    onPointerLeave: () => setAt(null),
  };
}

/**
 * A key hint beside the sidebar: `KeyHintCard` at `at` (fixed), popping in
 * and out exactly like the AI chat's context ring card (`KEY_HINT_POP` ·
 * `aiTransition.morph`), growing from its top-left corner — the edge it
 * hangs from. `at = null` plays the exit. Never pressed.
 *
 * `enter="drop"` (the search well's card, hung under the well): it drops
 * out of a soft blur instead (`motionPresence.findKeyCard`, ease-in-out,
 * leaving faster than it came) and its rows cascade top → bottom.
 */
export function KeyHintPopover({
  at,
  rows,
  lead,
  id,
  enter = 'pop',
}: {
  at: KeyHintAt | null;
  rows: readonly KeyHintRow[];
  lead?: ReactNode;
  /** `data-nav-key-hint` value, for probes. */
  id: string;
  enter?: 'pop' | 'drop';
}) {
  const drop = enter === 'drop';
  const pop = useMotionPresence(KEY_HINT_POP);
  const dropped = useMotionPresence(motionPresence.findKeyCard);
  const popTransition = useMotionTransition(aiTransition.morph);
  const dropIn = useMotionTransition(motionTransition.findKeyCardIn);
  const dropOut = useMotionTransition(motionTransition.findKeyCardOut);
  const presence = drop ? dropped : pop;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {at ? (
        <motion.div
          key={id}
          role="tooltip"
          data-nav-key-hint={id}
          initial={presence.initial}
          animate={presence.animate}
          exit={drop ? { ...presence.exit, transition: dropOut } : presence.exit}
          transition={drop ? dropIn : popTransition}
          style={
            'right' in at
              ? { position: 'fixed', right: at.right, top: at.top, transformOrigin: 'right top' }
              : 'centerX' in at
                ? { position: 'fixed', left: at.centerX, top: at.top, x: '-50%', transformOrigin: 'center top' }
                : { position: 'fixed', left: at.left, top: at.top, transformOrigin: 'left top' }
          }
          className="pointer-events-none z-panelPopover"
        >
          <KeyHintCard rows={rows} lead={lead} cascade={drop} />
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
