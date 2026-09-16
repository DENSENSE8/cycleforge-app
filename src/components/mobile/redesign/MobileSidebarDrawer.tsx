'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, X } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { IconButton } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { SPINE_ACCENT, spineRailLineClass } from '@/lib/nav/spine-section-accent';
import {
  SIDEBAR_SPINE_WIDTH,
  SPINE_CHILD_RAIL_INSET_CLASS,
  SPINE_CHILD_RAIL_TRUNK_CLASS,
  SPINE_LABEL_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { MobileAccountFooter } from './MobileAccountFooter';
import { cn } from '@/utils/_cn';
import {
  MOBILE_NAV_DESTINATIONS as NAV_ITEMS,
  isGroupActive,
  isLeafActive,
} from '@/lib/mobile/nav-registry';

/**
 * Left slide-over navigation drawer for the mobile shell (2026 redesign).
 *
 * Replaces the fixed bottom nav (RedesignedBottomNav): every destination that
 * used to live in the thumb-zone bar now lives here, opened by the top-left menu
 * button in {@link MobileTopBar}. Moving navigation off the bottom edge stops the
 * accidental taps that plagued the bar and frees the very bottom of each page for
 * the page's own contextual content/actions.
 *
 * ## It renders the DESKTOP spine row, not a phone-shaped approximation
 *
 * Rows compose `SPINE_ROW_SHELL_CLASS` + `SPINE_ROW_FACE_CLASS` +
 * `SPINE_ACCENT` — the same three tokens `SidebarNavList` paints with, at the
 * same 40px height, the same 16px glyph, the same `role-body` label. Until
 * 2026-08-21 this drawer hand-rolled `rounded-2xl` rows with a `bg-blue-50` /
 * `ring-blue-200` active state, which broke three rulings at once: ops chrome
 * is flush-square, the spine treatment is monochrome ("No hue, anywhere"), and
 * selection carries no ring or shadow. Nesting uses the same ONE-line,
 * two-token rail (`spineRailLineClass`) rather than a static hairline.
 *
 * ## Why the DESTINATIONS are still local
 *
 * The rows are the spine's; the list is not. `MasterNav` resolves `/receiving`,
 * `/unbox`, `/pack` — the desktop shell's routes — while this drawer navigates
 * the `/m/*` app, a separate shell with its own scan-first surfaces. Mounting
 * `MasterNav` here would walk operators out of the mobile app. Shared face,
 * different map, and that difference is the reason this component exists.
 *
 * Below the map sits {@link MobileAccountFooter}: a single identity icon that
 * opens `/m/settings`. It intentionally does not reuse the desktop account footer.
 *
 * The "Receiving" item is a drill-down group: tapping it expands the modes
 * that have dedicated phone support for capturing/updating photos.
 *
 * Chrome law: **pages are text; modes own icons.** Top-level page rows and the
 * Receiving group header are label-only; mode children keep glyphs. Scan keeps
 * a tool icon (not a page destination).
 */

// Destinations, LANE faces, PARENT icons and active-route identification all
// live in `@/lib/mobile/nav-registry` — the routing SoT. The drawer used to
// keep its own `NAV_ITEM_ICONS` map keyed by destination id under the old
// chrome law (*"pages are text; modes own icons"*), which put glyphs on the
// CHILDREN and none on the parents.
//
// **Operator ruling 2026-09-14 — "icon at the parent level only"** inverts
// that, and the map is deleted rather than re-keyed: a renderer-side icon
// table is a second source, and it is how the phone and the desk spine came to
// disagree about which altitude wears a glyph. The registry's types now carry
// the law (`MobileNavChild` has no `icon` field at all), so this file only
// paints what it is given.

export const MobileSidebarDrawer = ({
  open,
  onClose,
  presentation = 'overlay',
}: {
  open: boolean;
  onClose: () => void;
  /** Phone: an on-demand drawer. Tablet: a persistent L1 rail. */
  presentation?: 'overlay' | 'rail';
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, has } = useAuth();

  /**
   * A row the viewer cannot use is ABSENT, not disabled (registry rule: a nav
   * row that 403s is worse than an absent one). The gate reads the registry's
   * own `requires`, so a new destination declares its permission beside its
   * href instead of being special-cased here.
   */
  const visibleItems = NAV_ITEMS.filter((item) =>
    item.kind === 'leaf' && item.requires ? has(item.requires) : true,
  );

  // Auto-expand the lane the operator is already inside. Derived from the
  // registry rather than a second copy of the prefixes — the old version
  // hard-coded the five receiving paths AND the group id here, so adding a
  // lane meant editing two files to keep one behaviour.
  const activeGroupId =
    visibleItems.find(
      (item) => item.kind === 'group' && isGroupActive(pathname, item.matchPrefixes),
    )?.id ?? null;
  const [expanded, setExpanded] = useState<string | null>(activeGroupId);

  // Close on route change so a tap that navigates also dismisses the drawer.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Re-sync the open group whenever the drawer is re-opened on a receiving route.
  useEffect(() => {
    if (open && activeGroupId) setExpanded(activeGroupId);
  }, [open, activeGroupId]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  const navigation = (
    <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
      <ul>
        {visibleItems.map((item) => {
          if (item.kind === 'leaf') {
            const active = isLeafActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.id}>
                {/* ds-raw-button: text-left L0 nav row (parent glyph + label), not a standard action button */}
                <button
                  onClick={() => navigate(item.href)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    SPINE_ROW_SHELL_CLASS,
                    SPINE_ROW_FACE_CLASS,
                    focusRing('control'),
                    active ? SPINE_ACCENT.activePage : SPINE_ACCENT.idlePage,
                  )}
                >
                  <Icon
                    className={navIconStrokeClass(
                      cn(
                        SPINE_ROW_ICON_CLASS,
                        active ? SPINE_ACCENT.activePageIcon : SPINE_ACCENT.idlePageIcon,
                      ),
                    )}
                  />
                  <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)}>
                    {item.label}
                  </span>
                </button>
              </li>
            );
          }

          const isOpen = expanded === item.id;
          const groupActive = isGroupActive(pathname, item.matchPrefixes);
          const GroupIcon = item.icon;
          return (
            <li key={item.id}>
              {/* ds-raw-button: text-left LANE header (parent glyph + label + chevron), not a standard action button */}
              <button
                onClick={() => setExpanded((cur) => (cur === item.id ? null : item.id))}
                aria-expanded={isOpen}
                className={cn(
                  SPINE_ROW_SHELL_CLASS,
                  SPINE_ROW_FACE_CLASS,
                  focusRing('control'),
                  groupActive ? SPINE_ACCENT.ownsActive : SPINE_ACCENT.idlePage,
                )}
              >
                <GroupIcon
                  className={navIconStrokeClass(
                    cn(
                      SPINE_ROW_ICON_CLASS,
                      groupActive ? SPINE_ACCENT.activePageIcon : SPINE_ACCENT.idlePageIcon,
                    ),
                  )}
                />
                <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)}>
                  {item.label}
                </span>
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className={cn(SPINE_ROW_ICON_CLASS, 'text-text-default')} />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                    className="overflow-hidden"
                  >
                    {/* The rail's COLUMN, shared with the desk: the inset lands
                        it under the parent glyph, not under the parent's left
                        pad (operator 2026-09-14: "aligned with the icon of the
                        parent"). The drawer's own `<nav>` pad shifts glyph and
                        rail together, so the same token is correct here. */}
                    <div className={cn('relative', SPINE_CHILD_RAIL_INSET_CLASS)}>
                      {/* The continuous trunk — same token, same column as the
                          desk. Child segments paint over it to mark the row. */}
                      <span className={SPINE_CHILD_RAIL_TRUNK_CLASS} aria-hidden />
                      {item.children.map((child) => {
                        const childActive = isLeafActive(pathname, child.href);
                        return (
                          <li key={child.id} className="flex items-stretch">
                            {/* The child mark: the rail LINE — one physical line,
                                two colour tokens. Since 2026-09-14 the DESK spine
                                paints the same hairline (operator: "a hairline on
                                the left of all the child components"), so this is
                                one law with one paint rather than a per-surface
                                affordance. Never stack an indent on top of it. */}
                            <span className={spineRailLineClass(childActive)} aria-hidden />
                            {/* ds-raw-button: text-left child nav row (label only — no glyph, by the icon law) */}
                            <button
                              onClick={() => navigate(child.href)}
                              aria-current={childActive ? 'page' : undefined}
                              className={cn(
                                SPINE_ROW_SHELL_CLASS,
                                SPINE_ROW_FACE_CLASS,
                                focusRing('control'),
                                childActive ? SPINE_ACCENT.childActive : SPINE_ACCENT.childIdle,
                              )}
                            >
                              <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)}>
                                {child.label}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </div>
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  if (presentation === 'rail') {
    if (!user) return null;
    return (
      <aside
        aria-label="Navigation"
        className={cn(
          'hidden h-full shrink-0 flex-col border-r border-border-soft md:flex',
          SIDEBAR_SPINE_WIDTH,
          appChromeClass,
          cornerClass('flush'),
        )}
      >
        {/* No header strip — the operator removed the "Menu" eyebrow (2026-09-14);
            the nav list starts at the top of the rail. */}
        {navigation}
        <MobileAccountFooter />
      </aside>
    );
  }

  return (
    <AnimatePresence>
      {open && user && (
        <>
          {/* Scrim */}
          {/* ds-raw-button: full-bleed animated dismiss scrim (motion.button), not a DS action control */}
          <motion.button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-panelBackdrop bg-scrim/40 backdrop-blur-[2px] md:hidden"
          />

          {/* Panel */}
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0.4, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80 || info.velocity.x < -500) onClose();
            }}
            className={cn(
              // Flush-square, spine-width, chrome ground — the desktop push column
              // in a slide-over. The old panel carried an arbitrary rgba shadow;
              // depth here is the border + the scrim behind it, per the accent
              // module's "no ring, no shadow, no bevel".
              'fixed inset-y-0 left-0 z-panel flex h-[100dvh] max-w-[86vw] flex-col border-r border-border-soft md:hidden',
              SIDEBAR_SPINE_WIDTH,
              appChromeClass,
              cornerClass('flush'),
            )}
          >
            {/* Header */}
            <div className="flex h-10 shrink-0 items-center justify-end border-b border-border-hairline px-2 mt-[env(safe-area-inset-top)]">
              <IconButton
                icon={<X className={SPINE_ROW_ICON_CLASS} />}
                onClick={onClose}
                ariaLabel="Close menu"
                size="md"
                className={cn(
                  'flex items-center justify-center text-text-soft transition-colors hover:bg-surface-hover',
                  cornerClass('flush'),
                )}
              />
            </div>

            {navigation}

            <MobileAccountFooter onNavigate={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
