'use client';

/**
 * MasterNav Pinned cluster — drop target + reorderable pin rows.
 * Catalog map rows are not sortable; they drag *into* this list.
 *
 * No disclosure. Pin rows are always listed. “Pinned” is a standing
 * SidebarGroupLabel with ONE trailing control: pin-this-page.
 *
 * **Unpinning is a drag, not a button (operator ruling 2026-09-05).** The
 * per-row hover X is gone: a pin leaves the shelf by being dragged off it,
 * the same gesture that put it there, and the map paints a "Let go to unpin"
 * overlay while that drag is live (`SidebarNavList`). The undo row below still
 * holds the vacated slot open — see {@link usePinUndo}.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MessageSquare, Pin } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  MASTER_NAV_PIN_DROP_ID,
  MASTER_NAV_PIN_EDGE_BOTTOM,
  MASTER_NAV_PIN_EDGE_TOP,
  isStructuralSpinePinHref,
  pinRowDragId,
  isSessionPin,
} from '@/lib/quick-access/nav-pin';
import {
  pinHotkeyLabel,
} from '@/lib/quick-access/pin-hotkeys';
import {
  resolveQuickAccessHref,
  resolveQuickAccessLabelFromLocation,
  displayQuickAccessLabel,
  masterNavFaceForPinHref,
  pinMatchesLocation,
  resolveActivePinHref,
} from '@/lib/quick-access/page-label';
import type { PinnedPage } from '@/lib/quick-access/types';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import { useChatSessions } from '@/lib/assistant/use-chat-sessions';
import { displaySessionTitle } from '@/lib/ai/session-title-text';
import {
  APP_SIDEBAR_NAV,
  getMasterNavItem,
  getSidebarNavPageId,
  getSidebarPageNav,
  type SidebarIconComponent,
} from '@/lib/sidebar-navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  SPINE_PINNED_CLUSTER_CLASS,
  SPINE_PINNED_CLUSTER_HOVER_CLASS,
  SPINE_PINNED_TRAIL_GLYPH_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_SECTION_LABEL_STICKY_CLASS,
} from '@/components/sidebar/sidebar-spine';
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { PinUndoOffer } from './use-pin-undo';
import { cn } from '@/utils/_cn';

function resolvePinIcon(pin: PinnedPage): SidebarIconComponent {
  // Ask what the pin IS before asking where it points. A session pin's href is
  // `/?session=<id>`, whose pathname resolves to the `home` face — so the href
  // lookup below dressed every bound thread in the Home glyph (Feature 3,
  // measured 2026-09-07). A thread wears a chat glyph.
  if (isSessionPin(pin)) {
    return MessageSquare;
  }
  const fromHref = masterNavFaceForPinHref(pin.href)?.icon;
  if (fromHref) return fromHref;
  if (pin.iconKey && pin.iconKey !== 'unknown') {
    const fromNav = getMasterNavItem(pin.iconKey)?.icon
      ?? getSidebarPageNav(pin.iconKey)?.icon
      ?? APP_SIDEBAR_NAV.find((item) => item.id === pin.iconKey)?.icon;
    if (fromNav) return fromNav;
  }
  return Pin;
}

/**
 * A drop strip at one end of the shelf. Paints an insertion line while the
 * pointer is over it, so the landing slot is visible before release.
 */
function PinEdgeDropStrip({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <li
      ref={setNodeRef}
      aria-label={label}
      className="relative -my-1 h-2 list-none"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-2 top-1/2 h-px -translate-y-1/2 transition-colors',
          isOver ? 'bg-text-default' : 'bg-transparent',
        )}
      />
    </li>
  );
}

function SortablePinRow({
  pin,
  slot,
  count,
  active,
  onNavigate,
  onMove,
  onUnpin,
  sessionTitle,
}: {
  pin: PinnedPage;
  slot: number;
  count: number;
  active: boolean;
  onNavigate: () => void;
  /** Keyboard reorder within the shelf: -1 up, +1 down. */
  onMove: (dir: -1 | 1) => void;
  /** Keyboard unpin (with the same undo the drag path offers). */
  onUnpin: () => void;
  /** Bound session's AI title (Feature 3) — the hover-revealed subtitle. */
  sessionTitle?: string;
}) {
  const RowIcon = resolvePinIcon(pin);
  const label = displayQuickAccessLabel(pin.href, pin.label);
  // A session pin's own row already reads as the thread, so the LIVE title is
  // only worth a second line when it has moved on from the pinned snapshot
  // (a rename) or when the pin names a page instead — "Shipping" + the thread
  // you were working there.
  const boundSession = sessionTitle && sessionTitle !== label ? sessionTitle : undefined;
  const {
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: pinRowDragId(pin.id),
    data: { type: 'pin', id: pin.id },
  });
  const hint = pinHotkeyLabel(slot);

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={{
        // Siblings shift to open the slot; the dragged row itself stays put and
        // dims, because the portalled <DragOverlay> is what follows the pointer
        // (a transform here would be clipped by the scrollport).
        transform: isDragging ? undefined : CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('group/pinrow relative flex flex-col', isDragging && 'opacity-40')}
    >
      {/* The chord is carried in the tooltip, not painted on the row. The
          shortcut-display cohort refuses standing keycaps, and the spine has no
          CTA strip to paint a HotkeyGlyph on — a tooltip is the one channel
          that law leaves open for teaching ⌘1–9. */}
      <HoverTooltip label={hint ? `${label} · ${hint}` : label} asChild>
        <SidebarMenuButton
          // `listeners` only — see the note in SidebarNavList: dnd-kit's
          // `attributes` announce a space-bar pickup that no longer exists.
          // The KeyboardSensor is deliberately absent (it would hijack Space/
          // Enter on every row), so keyboard reorder/unpin is bound HERE — the
          // WCAG 2.1.1 path the drag gesture cannot provide. Alt is the
          // modifier so plain arrows still move focus between rows.
          {...listeners}
          isActive={active}
          onClick={onNavigate}
          onKeyDown={(e) => {
            if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
            if (e.key === 'ArrowUp' && slot > 1) {
              e.preventDefault();
              onMove(-1);
            } else if (e.key === 'ArrowDown' && slot < count) {
              e.preventDefault();
              onMove(1);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
              e.preventDefault();
              onUnpin();
            }
          }}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Alt+Delete"
          // The bound session is part of the row's MEANING, not decoration:
          // "Shipping" and "Shipping — session: Packing pace" are different
          // destinations. The visual subtitle is hover-only and `aria-hidden`,
          // so AT heard nothing about it until it moved into the name here.
          aria-label={
            [
              `Go to ${label}`,
              boundSession ? ` — session: ${boundSession}` : '',
              hint ? ` (${hint})` : '',
              '. Alt+Arrow reorders, Alt+Delete unpins.',
            ].join('')
          }
          aria-current={active ? 'page' : undefined}
          className="touch-none"
        >
          <RowIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
          <span>{label}</span>
        </SidebarMenuButton>
      </HoverTooltip>
      {/* Feature 3: a pin bound to a session says WHERE (the page label) and,
          on hover/focus, WHAT you were doing there (the session's AI title).
          Collapsed to zero height at rest (`max-h-0`), so the resting row stays
          single-line and the fold budget is untouched; it expands only on
          hover. `aria-hidden` — the button's aria-label already carries it. */}
      {boundSession ? (
        <span
          aria-hidden
          className={cn(
            'block max-h-0 overflow-hidden pl-8 pr-2 opacity-0 transition-all duration-150',
            'group-hover/pinrow:max-h-4 group-hover/pinrow:opacity-100',
            'group-focus-within/pinrow:max-h-4 group-focus-within/pinrow:opacity-100',
          )}
        >
          <span className="block truncate text-role-micro text-text-faint">{boundSession}</span>
        </span>
      ) : null}
      {/* No trailing X: unpin is the drag OUT of this cluster (pointer) or
          Alt+Delete on a focused row (keyboard) — one meaning, two inputs, and
          the row keeps its whole width for the destination it names. */}
    </SidebarMenuItem>
  );
}

export function MasterNavPinnedCluster({
  pinIds,
  undo,
  shelfRef,
  onKeyboardUnpin,
}: {
  pinIds: readonly string[];
  /**
   * The last drag-off-the-shelf, still takeable back. Resolved by the drag
   * host ({@link usePinUndo} in `SidebarNavList`) because that is where the
   * drop lands; painted here because the slot it vacated is here. Inline, in
   * that slot — not a toast, and not a second surface to look at.
   */
  undo: PinUndoOffer | null;
  /**
   * Receives the shelf's own element so the drag host can measure it: the
   * unpin decision is GEOMETRY (pointer outside the shelf = unpin), not
   * dnd-kit collision diplomacy — see `handleDragEnd` in `SidebarNavList`.
   */
  shelfRef?: (el: HTMLElement | null) => void;
  /** Keyboard unpin from a focused row — routed through the drag path's undo. */
  onKeyboardUnpin?: (pin: PinnedPage, index: number) => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { settings, pinAt, reorder } = useQuickAccess();
  const { setNodeRef, isOver } = useDroppable({ id: MASTER_NAV_PIN_DROP_ID });
  const pinned = settings.pinned;
  // Feature 3 session pins carry a sessionId; resolve each to its AI title for
  // the hover subtitle. Only fetch when a pin actually needs it.
  const { sessions } = useChatSessions({ enabled: pinned.some((p) => Boolean(p.sessionId)) });
  const sessionTitleById = useMemo(
    () => new Map((sessions ?? []).map((s) => [s.id, displaySessionTitle(s.title, '')])),
    [sessions],
  );
  const currentHref = resolveQuickAccessHref(pathname, searchParams);
  const locationPinned = pinned.some((p) =>
    pinMatchesLocation(p.href, pathname, searchParams),
  );
  const activePinHref = resolveActivePinHref(
    pinned,
    currentHref,
    pathname,
    searchParams,
  );
  const canPinCurrent =
    Boolean(currentHref) &&
    !isStructuralSpinePinHref(currentHref) &&
    !locationPinned;

  const handlePinCurrent = useCallback(() => {
    if (!currentHref || isStructuralSpinePinHref(currentHref)) return;
    const face = getMasterNavItem(getSidebarNavPageId(pathname, searchParams));
    pinAt({
      kind: 'page',
      label: resolveQuickAccessLabelFromLocation(
        pathname,
        searchParams,
        user?.organizationName,
      ),
      href: face?.href ?? currentHref,
      iconKey: face?.id,
    });
  }, [currentHref, pathname, searchParams, pinAt, user?.organizationName]);

  const movePin = useCallback(
    (index: number, dir: -1 | 1) => {
      const ids = pinned.map((p) => p.id);
      const target = index + dir;
      if (target < 0 || target >= ids.length) return;
      const moved = ids[index]!;
      ids[index] = ids[target]!;
      ids[target] = moved;
      reorder(ids);
    },
    [pinned, reorder],
  );

  return (
    <SidebarGroup
      ref={(el) => {
        setNodeRef(el);
        shelfRef?.(el);
      }}
      id="spine-section-pinned"
      role="group"
      aria-label="Pinned"
      className={cn(SPINE_PINNED_CLUSTER_CLASS, isOver && 'bg-surface-hover')}
    >
      <SidebarGroupLabel className={SPINE_SECTION_LABEL_STICKY_CLASS}>
        Pinned
      </SidebarGroupLabel>
      {canPinCurrent ? (
        <HoverTooltip label="Pin this page" asChild>
          <SidebarGroupAction
            aria-label="Pin this page"
            className={SPINE_PINNED_CLUSTER_HOVER_CLASS}
            onClick={handlePinCurrent}
          >
            <Pin className={SPINE_PINNED_TRAIL_GLYPH_CLASS} />
          </SidebarGroupAction>
        </HoverTooltip>
      ) : null}
      <SidebarGroupContent id="spine-pinned-rows">
        <SidebarMenu>
          <SortableContext
            items={pinIds.map((id) => pinRowDragId(id))}
            strategy={verticalListSortingStrategy}
          >
            {pinned.length > 0 ? (
              <PinEdgeDropStrip
                id={MASTER_NAV_PIN_EDGE_TOP}
                label="Move to the top of Pinned"
              />
            ) : null}
            {pinned.length === 0 ? (
              // NOT hover-gated. An empty state that only appears once you are
              // already hovering the thing you do not know exists teaches
              // nobody — it is the one row in this cluster that has to speak
              // first. (Pin-this-page stays on hover: it acts on the page you
              // are already looking at.)
              <p className="px-2 py-1.5 text-role-caption text-text-soft">
                Drag any page here to pin it. Drag it back out to unpin.
              </p>
            ) : (
              pinned.map((p, index) => (
                <SortablePinRow
                  key={p.id}
                  pin={p}
                  slot={index + 1}
                  count={pinned.length}
                  active={p.href === activePinHref}
                  onNavigate={() => {
                    router.push(p.href);
                  }}
                  onMove={(dir) => movePin(index, dir)}
                  onUnpin={() => onKeyboardUnpin?.(p, index)}
                  sessionTitle={
                    p.sessionId ? sessionTitleById.get(p.sessionId) || undefined : undefined
                  }
                />
              ))
            )}
            {pinned.length > 0 ? (
              <PinEdgeDropStrip
                id={MASTER_NAV_PIN_EDGE_BOTTOM}
                label="Move to the bottom of Pinned"
              />
            ) : null}
          </SortableContext>
          {undo ? (
            <SidebarMenuItem>
              <div className="flex w-full items-center gap-2 px-2 py-1">
                <span className="min-w-0 flex-1 truncate text-role-caption text-text-soft">
                  Unpinned {undo.label}
                </span>
                <button
                  type="button"
                  onClick={undo.onUndo}
                  className="ds-raw-button shrink-0 text-role-caption font-medium text-text-default underline-offset-2 hover:underline"
                >
                  Undo
                </button>
              </div>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
