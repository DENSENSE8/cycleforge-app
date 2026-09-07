/**
 * Types for Quick Access. Settings + pins hydrate from localStorage for
 * flash-free chrome; pins also sync to `staff_preferences.prefs.quickAccess`
 * (cross-device).
 */

import type { DisplayTitle } from '@/lib/ai/session-title-text';

export interface ActionToggles {
  /** Open the phone-history popover (recent packed orders, tap to resume). */
  phoneHistory: boolean;
  /** Show "Switch staff" in the popover action list. Default true. */
  switchStaff?: boolean;
}

export interface PinnedPage {
  /** Stable client-generated id (crypto.randomUUID). */
  id: string;
  /** User-editable display name. */
  label: string;
  /** Path + search params, e.g. '/receiving?warehouse=SAL'. */
  href: string;
  /** Optional icon hint (route key, looked up at render). */
  iconKey?: string;
  /** Epoch ms when added. Used for sort + diagnostics. */
  addedAt: number;
  /**
   * Optional AI session this pin is working within (Feature 3, binding model
   * B). When set, the pin renders the page label as its title and the bound
   * session's AI summary as a hover-revealed subtitle — "where" + "what am I
   * doing there." Additive and back-compatible: pins without it render as
   * before. Looked up against {@link ChatSessionRow} by id at render.
   */
  sessionId?: string;
}

/**
 * The input a pin WRITE takes — discriminated, because the two kinds of pin
 * carry different load-bearing facts and the compiler is the only reliable
 * guard against dropping one.
 *
 * A session pin's `sessionId` is its provenance: the thread it names. Before
 * this union, the shelf's undo path re-pinned a dragged-out pin as
 * `{ href, label, iconKey }` — structurally a valid pin, so it type-checked,
 * and a session pin came back as a nameless Home row with its binding gone
 * (measured 2026-09-07). Taking back an accidental unpin destroyed the exact
 * fact the undo existed to protect.
 *
 * `kind` makes that shape unrepresentable: a partial copy of a `PinnedPage` no
 * longer satisfies the input, so every re-pin path goes through
 * {@link pinInputFromPinned}, which is total.
 */
export type PagePinInput = {
  kind: 'page';
  label: string;
  href: string;
  iconKey?: string;
};

export type SessionPinInput = {
  kind: 'session';
  /** Sanitized at the boundary — a pin label outlives the row it was copied from. */
  label: DisplayTitle;
  href: string;
  sessionId: string;
  iconKey?: typeof SESSION_PIN_ICON_KEY;
};

export type PinInput = PagePinInput | SessionPinInput;

/** Icon hint every session pin carries. One spelling, both pin surfaces. */
export const SESSION_PIN_ICON_KEY = 'ai-chat';

export interface QuickAccessSettings {
  version: 1;
  enabled: boolean;
  /**
   * There is deliberately NO `hotkey` field. Quick Access used to bind ⌘K/Ctrl+K
   * itself (default ON), which put a SECOND `window` keydown listener on the
   * same chord as {@link CommandBar} — both called `preventDefault()` and both
   * toggled, so one press opened the palette AND this menu. ⌘K now has exactly
   * one owner (the palette). A stored `hotkey` from before this is stripped in
   * `getSettings`. Guard: `src/components/layout/cmdk-owner.guard.test.ts`.
   */
  /**
   * When true (default), the FAB shows the signed-in staff's initials in their
   * theme colour. When false, the FAB always renders the Zap icon — useful for
   * users who prefer the original look. Only meaningful while signed in.
   */
  showStaffChipOnFab?: boolean;
  actions: ActionToggles;
  pinned: PinnedPage[];
}

export const MAX_PINS = 30;
/**
 * First N pins in list order bind ⌘/Ctrl+1…N in GlobalHeader.
 * Order owns the slot — there is no per-pin `hotkey` field.
 */
export const MAX_PIN_HOTKEY_SLOTS = 9;
