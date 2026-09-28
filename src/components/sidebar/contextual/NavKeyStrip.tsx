'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import type { NavItem } from '@/lib/nav/context/schema';
import { getSidebarPageNav } from '@/lib/sidebar-navigation';
import { AnimatePresence, motion } from '@/design-system/motion';
import { aiTransition } from '@/design-system/ai';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { KeyboardKey } from '@/design-system/primitives';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { ChevronRight } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { SIDEBAR_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { NAV_BLOCK_CLASS, NAV_CHOICE_SELECTED_CLASS } from './nav-block';
import { navRowGlyph } from './NavSectionList';
import { KEY_PRESSED_CLASS } from './NavGoKeys';
import { isNavModeSection } from './NavModeSwitcher';
import { useCurrentNavPath, useNavContext } from './useNavContext';
import { closeViewsPeek, openViewsPeek, registerKeyStrip, useGoKeys } from './go-keys-store';

const PILL_CLASS = cn(
  NAV_BLOCK_CLASS,
  'h-8 w-auto shrink-0 gap-2 bg-surface-card text-role-body shadow-sm ring-1 ring-border-soft',
);

/** Pills unfold left → right from the title, like a hand of cards. */
const STRIP_UNFOLD = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -8 },
};

/**
 * A contextual-sidebar desk's header, from the page's `NavContext` — THE one
 * place a page's header learns its views, so every `bare` desk gets the same
 * behaviour by declaration alone (`DeskPageLayout bare`):
 * - `title`: the active view's label (the page's label on a view-less page);
 * - `titleSlot`: `To ship ›` with hover-to-unfold pills, only when the page
 *   binds its digits (`viewKeys`) and has two views or more;
 * - `headerCenter`: the key strip (the pills; the `G` step while armed).
 * Before the context loads, or while the page is not a contextual panel
 * (`legacy` rollout, or the lane map), it returns no title so the frame
 * keeps its own.
 *
 * Hydration: the context paints from a localStorage snapshot the server
 * cannot see, so until the client has hydrated this answers exactly what the
 * server rendered (no title of its own) — the first client frame matches the
 * HTML and React never throws the tree away.
 */
export function useNavDeskHeader(): { title?: string; titleSlot?: ReactNode; headerCenter: ReactNode } {
  const nav = useNavContext(useCurrentNavPath()).data;
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  // The same test the sidebar host uses for "this page paints its own panel":
  // a legacy page's views (and digit bindings) live elsewhere, so its header
  // must not paint keys it cannot honour.
  const panel = hydrated && nav?.rollout === 'contextual' && nav.scope === 'section';
  const views = panel ? nav.sections.filter((section) => !isNavModeSection(section)).flatMap((section) => section.items) : [];
  const view = views.find((item) => item.active);
  const keyed = panel && nav.viewKeys === true && views.length > 1;
  return {
    title: view?.label ?? (panel ? nav.page.label : undefined),
    titleSlot: keyed && view ? <NavViewTitle label={view.label} /> : undefined,
    headerCenter: <NavKeyStrip views={keyed ? views : []} pageId={panel ? nav.page.id : ''} />,
  };
}

/** `useSyncExternalStore` needs a subscribe; hydration is the only change it reports. */
const subscribeNever = () => () => undefined;

/**
 * The desk header title — the view you are on, then a `›` that says "hover
 * me". On hover it sits in a grey bubble (held while the views are
 * unfolded), and every view unfolds as pills right beside it
 * (`NavKeyStrip`), each led by its digit, so the keys are memorised where
 * the eye already is.
 */
export function NavViewTitle({ label }: { label: string }) {
  const { peek } = useGoKeys();
  return (
    <span
      data-nav-view-title
      data-peek={peek ? '' : undefined}
      onPointerEnter={openViewsPeek}
      className={cn(
        '-ml-2 inline-flex items-center gap-1 px-2 py-0.5 transition-colors duration-100',
        SIDEBAR_CONTROL_CORNER,
        peek ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
      )}
    >
      <span className="truncate">{label}</span>
      <ChevronRight
        aria-hidden
        className={cn('size-4 shrink-0 transition-colors duration-100', peek ? 'text-text-default' : 'text-text-faint')}
      />
    </span>
  );
}

/**
 * The desk header's KEY STRIP — the slot between the title (top left) and
 * the page's verbs (top right). Empty at rest: nothing to read until you ask.
 *
 * - title hovered (`peek`): the views unfold as pills starting right beside
 *   the title — `[1]⌂ Exceptions  [2]⌂ PO paired …`, key flush left against
 *   the icon — the shortest pointer trip from the title to a choice. They
 *   STICK: hovering off never folds them; Esc, a press outside the title and
 *   pills, or choosing a pill does.
 * - `G` armed: the current lane's modes — `[S]⌂ Shipping [F]⌂ FBA
 *   [L]⌂ Label intake`, icons in their mode tones, no `[G] then` lead (the
 *   staffer just pressed it) — centred. Nothing shades or outlines the list
 *   below (owner 2026-09-27). Esc, a click or the 1.5s window folds it.
 *
 * A key that fires presses in for a beat. The slot is `flex-1`, so the title
 * and the verbs never move.
 */
export function NavKeyStrip({ views, pageId }: { views: readonly NavItem[]; pageId: string }) {
  const { armed, targets, pressed, peek } = useGoKeys();
  const presence = useMotionPresence(STRIP_UNFOLD);
  const transition = useMotionTransition(aiTransition.morph);

  useEffect(() => registerKeyStrip(), []);

  const showGo = armed && targets.length > 0;
  const showViews = !showGo && peek && views.length > 1;
  // Unfolded views stick until Esc or a press outside the title and pills.
  useEffect(() => {
    if (!peek) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      // Esc always folds them, even when an open record also takes the key.
      if (event.key === 'Escape') closeViewsPeek();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-nav-key-strip],[data-nav-view-title]')) closeViewsPeek();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [peek]);

  return (
    <div
      data-nav-key-strip={showGo ? 'go' : showViews ? 'views' : 'rest'}
      className="grid min-h-8 min-w-0 flex-1 self-stretch [&>*]:col-start-1 [&>*]:row-start-1"
    >
      <AnimatePresence initial={false}>
        {showGo ? (
          <motion.div
            key="go"
            role="status"
            aria-live="polite"
            aria-label={`G then: ${targets.map((target) => `${target.letter.toUpperCase()} ${target.label}`).join(', ')}`}
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            className="flex min-w-0 items-center gap-1 justify-self-center"
          >
            {/* No `[G] then` lead: the staffer just pressed it. Each mode's icon
                wears its mode tone, the way the view pills wear theirs. */}
            {targets.map((target) => {
              const page = getSidebarPageNav(target.id);
              const Icon = page?.icon;
              return (
                <Link
                  key={target.id}
                  href={target.href}
                  prefetch={false}
                  data-nav-key-strip-go={target.id}
                  aria-current={target.current ? 'page' : undefined}
                  className={cn(PILL_CLASS, target.current && NAV_CHOICE_SELECTED_CLASS)}
                >
                  <span className="flex shrink-0 items-center gap-1">
                    <KeyboardKey size="xs" className={cn(pressed === `go:${target.letter}` && KEY_PRESSED_CLASS)}>
                      {target.letter.toUpperCase()}
                    </KeyboardKey>
                    {Icon ? <Icon aria-hidden className={navIconStrokeClass(cn('size-4 shrink-0', page?.tone ?? 'text-text-default'))} /> : null}
                  </span>
                  <span className="truncate">{target.label}</span>
                </Link>
              );
            })}
          </motion.div>
        ) : showViews ? (
          <motion.nav
            key="views"
            aria-label="Views"
            initial={presence.initial}
            animate={presence.animate}
            exit={presence.exit}
            transition={transition}
            // The scroller clips: its padding (cancelled by the negative
            // margin) leaves room for each pill's ring and shadow.
            className="-m-1.5 flex min-w-0 max-w-full items-center gap-1 self-center justify-self-start overflow-x-auto p-1.5 [scrollbar-width:none]"
          >
            {views.slice(0, 9).map((item, index) => {
              const glyph = navRowGlyph(item, pageId);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  prefetch={false}
                  data-nav-key-strip-view={item.id}
                  aria-current={item.active ? 'page' : undefined}
                  aria-keyshortcuts={String(index + 1)}
                  onClick={closeViewsPeek}
                  className={cn(PILL_CLASS, item.active && NAV_CHOICE_SELECTED_CLASS)}
                >
                  <span className="flex shrink-0 items-center gap-1">
                    <KeyboardKey size="xs" className={cn(pressed === `view:${item.id}` && KEY_PRESSED_CLASS)}>
                      {index + 1}
                    </KeyboardKey>
                    {glyph ? <glyph.icon aria-hidden className={navIconStrokeClass(cn('size-4 shrink-0', glyph.tone))} /> : null}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
