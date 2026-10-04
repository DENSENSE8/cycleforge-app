/**
 * Types for Quick Access. Settings + pins hydrate from localStorage for
 * flash-free chrome; pins also sync to `staff_preferences.prefs.quickAccess`
 * (cross-device).
 */

export interface ActionToggles {
  /** Show the "My history" row linking to the durable personal history at /stations/live. */
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
  /** There is deliberately NO `hotkey` field. */
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
