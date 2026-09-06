'use client';

/**
 * The spine's HEAD — the New chat verb and the session you are in.
 *
 * ```
 *   ✦ New chat              ⌘N
 *   ▌ Packing pace for tuan   (the session you are in)
 * ```
 *
 * Industry shape, adopted deliberately (operator rulings 2026-09-05: "add a
 * new session to the top of the sidebar so it follows industry standards" and
 * "remove home button and it should just display the current session that you
 * are on"). Every agent surface an operator already uses opens its navigator
 * with the same two controls in the same order, then names the thread they are
 * in — because those are the things you cannot reach by pointing at the map.
 *
 * ## Why there is no Home row
 *
 * `/` IS the session surface. A row labelled "Home" and a row naming the
 * session you are in pointed at the same URL, and the generic label held the
 * premium slot. Home is parked in the registry (`spineBand: false`) — still a
 * ⌘K destination, still a route, no longer a painted row.
 *
 * ## New chat is a verb, not a destination
 *
 * It is not a `SidebarMenuButton` row off the registry and is not draggable
 * onto Pinned: a pin is a shortcut to a PLACE, and a verb has no place to point
 * at. `New chat` starts one and lands on `/`.
 *
 * ## One verb, one implementation
 *
 * **New chat** dispatches {@link AI_CHAT_NEW_EVENT} and routes through the
 * nav's own `navigate`, which is what the header `SessionSwitcher` does and
 * what `AgentSessionPanel` binds ⌘N to. Four doors, one verb.
 *
 * Search is NOT a spine row: it duplicated the header Find / ⌘K palette, so the
 * head keeps only the verb the map cannot otherwise reach. The current-session
 * row carries `aria-current="page"` while the surface is on screen, so the one
 * row that says where you are is the one naming your thread — its title is the
 * AI summary of the first message (session-title-store), never a placeholder.
 * Recent threads live in the header switcher and ⌘K, not a spine section.
 */

import { MessageSquare, Sparkles } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  SPINE_ROW_DENSITY,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { SPINE_ACCENT } from '@/lib/nav/spine-section-accent';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/**
 * The head rows take the map's own shell, density and idle treatment, so a
 * verb and a destination are the same object at rest. The only difference is
 * the one that matters: they carry no `aria-current` and never light as the
 * current page, because you are never "on" a verb.
 */
const HEAD_ROW_CLASS = cn(
  SPINE_ROW_SHELL_CLASS,
  SPINE_ROW_DENSITY.pointer.face,
  SPINE_ROW_DENSITY.pointer.label,
  SPINE_ACCENT.idlePage,
  focusRing('control', 'accent'),
);

/**
 * Faint trailing shortcut hint. This is the menu-trailing `<kbd>` the
 * shortcut-display cohort PERMITS (HeaderPinsSwitcher paints the same face for
 * the ⌘1–9 pin chords) — a low-contrast reminder, NOT a standing keycap face
 * on a CTA (which the cohort bans). Decorative only: `aria-hidden`, with the
 * real chord carried on the row's own `aria-keyshortcuts` for assistive tech.
 */
function SpineHeadKbd({ chord }: { chord: string }) {
  return (
    <kbd
      aria-hidden
      className="shrink-0 rounded px-1 font-mono text-role-micro text-text-faint"
    >
      {chord}
    </kbd>
  );
}

export function SpineSessionHead({
  onNewSession,
  currentTitle,
  currentActive,
  onOpenCurrent,
}: {
  onNewSession: () => void;
  /** The live thread's name, or the replayed session's title. */
  currentTitle: string;
  /** True while the session surface itself is on screen. */
  currentActive: boolean;
  onOpenCurrent: () => void;
}) {
  return (
    <div data-spine-head className="flex flex-col">
      <div className="flex flex-col gap-1 px-2 py-1">
        <button
          type="button"
          data-spine-new-session
          // Routing is the caller's: it owns the nav's own `navigate`, which is
          // also what closes the mobile drawer. This button owns the VERB.
          onClick={onNewSession}
          // The chord is bound in AgentSessionPanel (⌘N / Ctrl+N); this row is
          // one of its doors, so it advertises the chord for assistive tech and
          // paints the faint reminder on the right.
          aria-keyshortcuts="Meta+N Control+N"
          className={HEAD_ROW_CLASS}
        >
          <Sparkles className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
          <span className="min-w-0 flex-1 truncate text-left">New chat</span>
          <SpineHeadKbd chord="⌘N" />
        </button>
      </div>
      {/* The session you are in — the current thread, named by the AI summary
          of its first message. `aria-current` marks it while `/` is the live
          surface; Search and Recent moved to the header + ⌘K to keep the head
          to one verb plus this row. */}
      <div
        role="group"
        aria-label="Current session"
        id="spine-section-current-session"
        className="flex flex-col px-2 pb-1"
      >
        <button
          type="button"
          data-spine-current-session
          onClick={onOpenCurrent}
          aria-current={currentActive ? 'page' : undefined}
          title={currentTitle}
          className={cn(
            SPINE_ROW_SHELL_CLASS,
            SPINE_ROW_DENSITY.pointer.face,
            SPINE_ROW_DENSITY.pointer.label,
            currentActive ? SPINE_ACCENT.activePage : SPINE_ACCENT.idlePage,
            focusRing('control', 'accent'),
          )}
        >
          <MessageSquare className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
          <span className="min-w-0 flex-1 truncate text-left">{currentTitle}</span>
        </button>
      </div>
    </div>
  );
}
