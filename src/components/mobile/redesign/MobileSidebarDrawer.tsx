'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from '@/design-system/motion';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  PackageOpen,
  ClipboardList,
  MapPin,
  ChevronDown,
  X,
  ReceivingModeRepair,
} from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { IconButton } from '@/design-system/primitives';
import { StaffAccountFooter } from '@/components/sidebar/master-nav/StaffAccountFooter';
import { useAuth } from '@/contexts/AuthContext';
import { SPINE_ACCENT, spineRailLineClass } from '@/lib/nav/spine-section-accent';
import {
  SIDEBAR_SPINE_WIDTH,
  SPINE_LABEL_CLASS,
  SPINE_ROW_FACE_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

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
 * Below the map sits {@link StaffAccountFooter} — the desktop spine's own
 * footer, mounted verbatim.
 *
 * The "Receiving" item is a drill-down group: tapping it expands the modes
 * that have dedicated phone support for capturing/updating photos.
 *
 * Chrome law: **pages are text; modes own icons.** Top-level page rows and the
 * Receiving group header are label-only; mode children keep glyphs. Scan keeps
 * a tool icon (not a page destination).
 */

type LeafItem = {
  kind: 'leaf';
  id: string;
  label: string;
  /** Mode / tool glyph — omit for page-level destinations. */
  icon?: React.ComponentType<{ className?: string }>;
  href: string;
};

type GroupItem = {
  kind: 'group';
  id: string;
  label: string;
  /** Any of these path prefixes marks the group (and its row) active. */
  matchPrefixes: string[];
  children: LeafItem[];
};

type NavItem = LeafItem | GroupItem;

// Single source of truth for the drawer's destinations. Receiving is a
// drill-down group into its photo-capable modes; mode icons mirror the desktop
// station registry.
//
// **Scan is deliberately absent** (2026-08-21). It used to be pinned to the very
// top as the headline action, which was right when the drawer was the only way
// to reach the scanner. It now has a permanent seat in the top-right corner of
// every mobile screen ({@link MobileScanCta}), so a row here would be a second
// door to one destination — the operator learns whichever they happen to hit
// first, and the corner stops being the answer.
const NAV_ITEMS: NavItem[] = [
  { kind: 'leaf', id: 'home', label: 'Home', href: '/m/home' },
  { kind: 'leaf', id: 'picks', label: 'Picks', href: '/m/pick' },
  {
    kind: 'group',
    id: 'receiving',
    label: 'Receiving',
    matchPrefixes: ['/m/receiving', '/m/receive', '/m/triage', '/m/unbox', '/m/r/'],
    children: [
      { kind: 'leaf', id: 'triage', label: 'Arrival', icon: ClipboardList, href: '/m/triage' },
      { kind: 'leaf', id: 'unboxing', label: 'Unbox', icon: PackageOpen, href: '/m/unbox' },
      { kind: 'leaf', id: 'photos', label: 'Photo feed', icon: PackageOpen, href: '/m/receiving' },
      { kind: 'leaf', id: 'local-pickup', label: 'Walk-In', icon: MapPin, href: '/m/receiving?mode=local-pickup' },
      { kind: 'leaf', id: 'repair', label: 'Repair', icon: ReceivingModeRepair, href: '/m/receiving?mode=repair' },
    ],
  },
  { kind: 'leaf', id: 'packing', label: 'Packing', href: '/m/pack' },
  { kind: 'leaf', id: 'checklist', label: 'Checklists', href: '/m/checklist' },
];

const isLeafActive = (pathname: string | null, href: string) => {
  if (!pathname) return false;
  const base = href.split('?')[0];
  if (base === '/m/home') return pathname === base;
  // Top-level (mode-less) leaves: exact match, plus prefix-match for nested
  // detail routes. Receiving sub-modes use isChildActive (query-aware) instead.
  return pathname === base || pathname.startsWith(`${base}/`);
};

const isGroupActive = (pathname: string | null, prefixes: string[]) =>
  !!pathname && prefixes.some((p) => pathname === p || pathname.startsWith(p));

/** The `?mode=` a child href encodes (null for the bare Unboxing path). */
const hrefMode = (href: string): string | null => {
  const q = href.split('?')[1];
  return q ? new URLSearchParams(q).get('mode') : null;
};

/**
 * A receiving sub-mode child is active only when BOTH its base path AND its
 * `?mode=` match the current location — so on /m/receiving (no mode) ONLY
 * "Unboxing" lights up, not Local Pickup / Repair (which share the base path).
 * This is the fix for all three rows appearing selected at once.
 */
const isChildActive = (pathname: string | null, currentMode: string | null, href: string) => {
  if (!pathname) return false;
  const base = href.split('?')[0];
  if (pathname !== base && !pathname.startsWith(`${base}/`)) return false;
  return hrefMode(href) === currentMode;
};

export const MobileSidebarDrawer = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMode = searchParams?.get('mode') ?? null;
  const { user } = useAuth();

  // Auto-expand the Receiving group when the user is somewhere inside it.
  const receivingActive = isGroupActive(pathname, [
    '/m/receiving',
    '/m/receive',
    '/m/triage',
    '/m/unbox',
    '/m/r/',
  ]);
  const [expanded, setExpanded] = useState<string | null>(receivingActive ? 'receiving' : null);

  // Close on route change so a tap that navigates also dismisses the drawer.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Re-sync the open group whenever the drawer is re-opened on a receiving route.
  useEffect(() => {
    if (open && receivingActive) setExpanded('receiving');
  }, [open, receivingActive]);

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
            className="fixed inset-0 z-panelBackdrop bg-scrim/40 backdrop-blur-[2px]"
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
              'fixed inset-y-0 left-0 z-panel flex h-[100dvh] max-w-[86vw] flex-col border-r border-border-soft',
              SIDEBAR_SPINE_WIDTH,
              appChromeClass,
              cornerClass('flush'),
            )}
          >
            {/* Header */}
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-hairline px-2 mt-[env(safe-area-inset-top)]">
              <span className="px-1 text-role-caption font-semibold uppercase tracking-[0.18em] text-text-soft">
                Menu
              </span>
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

            {/* Nav list */}
            <nav className="flex-1 overflow-y-auto overscroll-contain px-2 py-2">
              <ul>
                {NAV_ITEMS.map((item) => {
                  if (item.kind === 'leaf') {
                    const active = isLeafActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        {/* ds-raw-button: text-left nav row (optional tool icon + label), not a standard action button */}
                        <button
                          onClick={() => navigate(item.href)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            SPINE_ROW_SHELL_CLASS,
                            SPINE_ROW_FACE_CLASS,
                            active ? SPINE_ACCENT.activePage : SPINE_ACCENT.idlePage,
                          )}
                        >
                          {Icon ? (
                            <Icon
                              className={navIconStrokeClass(
                                cn(
                                  SPINE_ROW_ICON_CLASS,
                                  active ? SPINE_ACCENT.activePageIcon : SPINE_ACCENT.idlePageIcon,
                                ),
                              )}
                            />
                          ) : null}
                          <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)}>
                            {item.label}
                          </span>
                        </button>
                      </li>
                    );
                  }

                  // Group (drill-down accordion) — page label only; children own icons.
                  const isOpen = expanded === item.id;
                  const groupActive = isGroupActive(pathname, item.matchPrefixes);
                  return (
                    <li key={item.id}>
                      {/* ds-raw-button: text-left drill-down group row (label + chevron), not a standard action button */}
                      <button
                        onClick={() => setExpanded((cur) => (cur === item.id ? null : item.id))}
                        aria-expanded={isOpen}
                        className={cn(
                          SPINE_ROW_SHELL_CLASS,
                          SPINE_ROW_FACE_CLASS,
                          // A parent that OWNS the current child gets the quieter
                          // wash, never `aria-current` — two strengths, one
                          // location, exactly as the spine resolves it.
                          groupActive ? SPINE_ACCENT.ownsActive : SPINE_ACCENT.idlePage,
                        )}
                      >
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
                            <div className="pl-2">
                              {item.children.map((child) => {
                                const ChildIcon = child.icon;
                                const childActive = isChildActive(pathname, currentMode, child.href);
                                return (
                                  <li key={child.id} className="flex items-stretch">
                                    {/* ONE rail line, always mounted, always in the
                                        same place — only its colour token changes
                                        with selection. Never a second bar. */}
                                    <span className={spineRailLineClass(childActive)} aria-hidden />
                                    {/* ds-raw-button: text-left sub-mode nav row (icon + label + active fill), not a standard action button */}
                                    <button
                                      onClick={() => navigate(child.href)}
                                      aria-current={childActive ? 'page' : undefined}
                                      className={cn(
                                        SPINE_ROW_SHELL_CLASS,
                                        SPINE_ROW_FACE_CLASS,
                                        childActive ? SPINE_ACCENT.childActive : SPINE_ACCENT.childIdle,
                                      )}
                                    >
                                      {ChildIcon ? (
                                        <ChildIcon
                                          className={cn(
                                            SPINE_ROW_ICON_CLASS,
                                            childActive
                                              ? SPINE_ACCENT.childActiveIcon
                                              : SPINE_ACCENT.childIdleIcon,
                                          )}
                                        />
                                      ) : null}
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

            {/*
              Footer — the DESKTOP spine footer component, mounted verbatim.
              Identity · ⋯ (Settings · clipboard · report an issue) · sign out.

              Notifications briefly rode along here in a `trailing` slot. They
              are a DESK surface — you triage an inbox sitting down, not with a
              carton in your hands — so mobile carries none of it, and the slot
              that existed only to hold it was removed with it.

              This is deliberately NOT a mobile-shaped rewrite. A first pass
              built one — a `MobileAccountFooter` with the same rows in a
              different face — and that is precisely the page-local twin the
              house bans: two components answering "who am I signed in as and
              what else can I reach", drifting apart the moment either changes.
              Mounting the real one means the phone inherits every row desktop
              adds, for free and forever.
            */}
            <StaffAccountFooter />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
