/**
 * Types for Quick Access. Settings + pins hydrate from localStorage for
 * flash-free chrome; pins also sync to `staff_preferences.prefs.quickAccess`
 * (cross-device).
 */

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
}

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
