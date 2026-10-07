/** Station terminal action — pure types for the page × mode × tab dock resolver. */

import type { ReactNode } from 'react';
import type { SurfaceKey } from '@/lib/stations/surface-keys';

/**
 * Workspace modes that own a terminal dock. Mirrors
 * `WorkspaceMode` in mode-registry (+ shipping for future scan-complete CTA).
 * Kept here so the lib layer does not import from components/.
 */
export type TerminalWorkspaceMode =
  | 'unbox'
  | 'triage'
  | 'testing'
  | 'shipping'
  | 'repair'
  | 'pickup';

/** Preset tones mirrored from SlicedActionDock — kept as a string union so the
 *  lib layer does not import the DS primitive. */
export type TerminalTone = 'accent' | 'blue' | 'emerald' | 'orange' | 'violet' | 'red' | 'gray';

export interface TerminalMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  /** Marks the active choice (e.g. selected label kind). */
  selected?: boolean;
  /** Quiet rule above this item — group outcomes below selections. */
  separatorBefore?: boolean;
  /** Keep the menu open after click (selection toggles). Default closes. */
  keepOpen?: boolean;
}

/**
 * View-model consumed by StationTerminalDock → SlicedActionDock.
 * `null` means "hide the dock" (no terminal job for this section — Uber
 * hides its sticky cart when count === 0).
 */
export interface TerminalActionVm {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  /** The CTA's key, painted inside the button (Quality control's `P`). */
  hotkey?: string;
  tone?: TerminalTone;
  /** Override tone with arbitrary Tailwind classes (e.g. per-tech theme). */
  toneClasses?: { bg: string; hover: string };
  icon?: ReactNode;
  menu?: TerminalMenuItem[];
  menuLabel?: string;
  menuTitle?: string;
  /** Bench-visible line naming WHY the primary CTA is disabled. */
  disabledReason?: string | null;
  /** In-flow dock (unbox stacks above feedback bands) vs absolute float. */
  docked?: boolean;
  maxWidth?: string;
  fullWidth?: boolean;
  /** Compact end-aligned pill (composer + CTA band). Default center. */
  align?: 'center' | 'end';
}

/**
 * Declarative tab → kind key map for one workspace mode.
 * Kind keys are resolved by mode-specific builders (`mode-default`, `po-note`, …).
 */
export interface ModeTerminalSliceDef {
  /** Tab id → kind. Modes without tabs leave this empty and use `defaultKind`. */
  tabs: Record<string, string>;
  /** Kind used when the mode has no section tabs, or tabId is null. */
  defaultKind?: string;
  hasSectionTabs: boolean;
}

export interface ResolveTerminalKindInput {
  mode: TerminalWorkspaceMode;
  /** Active SectionTabsSlider id; omit / null for modes without tabs. */
  tabId?: string | null;
}

/** Opaque bags filled by per-mode hooks — typed at the component boundary. */
export interface TerminalActionContext {
  surface: SurfaceKey;
  mode: TerminalWorkspaceMode;
  tabId: string | null;
  // Mode-specific bags — kept as unknown here so the lib stays decoupled
  // from controller shapes. Mode resolvers narrow them.
  unbox?: unknown;
  testing?: unknown;
  triage?: unknown;
  shipping?: unknown;
  pickup?: unknown;
}
