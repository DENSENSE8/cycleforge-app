/**
 * Unbox Middle region — carton-open declared nav keys (`⌘;` → `m` → letter).
 *
 * Mode-split from Band 3 browse (`UNBOX_BAND3_NAV_KEY` = `f` find · `r` refine):
 * when a carton line workspace is open, Middle targets are the scan focus, the
 * PO ledger capture steps, the dock step CTA, and (when settled) Print · Receive.
 * Only ONE Middle registration is live at a time — Band 3 nulls while the carton
 * is open; this map owns Middle in that mode.
 *
 * TELEMETRY IS NOT A TARGET — procedure-% / KPI carry no key.
 *
 * Spec: `docs/todo/nav-keys-selection-keyboard-HANDOFF.md` § P2.
 */

export const UNBOX_MIDDLE_CARTON_NAV_KEY = {
  /** Focus the dock / serial wedge field (`receiving-focus-scan`). */
  scan: 's',
  /** Ledger → focus Serial step in the dock. */
  serial: 'n',
  /** Ledger → focus Condition step in the dock. */
  condition: 'c',
  /** Ledger → focus Photos step in the dock. */
  photos: 'h',
  /**
   * Fire the active step's primary dock control (same as clicking the leading
   * CTA — today: re-focus scan / step surface). When settled with no active
   * step, fires the terminal primary (Print·Receive).
   */
  cta: 'a',
  /** Print barcode / label (settled Resolution Terminal only). */
  print: 'p',
  /** Receive / inventory confirm (settled Resolution Terminal only). */
  receive: 'e',
} as const;

export type UnboxMiddleCartonNavId = keyof typeof UNBOX_MIDDLE_CARTON_NAV_KEY;
