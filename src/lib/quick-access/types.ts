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
  hotkey: 'cmdk' | 'off';
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
/** Always-visible pin icons in GlobalHeader; extras go behind the overflow menu. */
export const MAX_HEADER_PIN_ICONS = 5;
