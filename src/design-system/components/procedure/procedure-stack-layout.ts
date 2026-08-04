/**
 * Procedure deck rem constants — face height + gap between full rows.
 *
 * Flat foundation: every step is a full face at a fixed height; selection is
 * outline-only. Evidence mounts in a band under the list — faces never grow.
 * No peek pull-up, no space budget.
 *
 * Law: `.claude/rules/display/station-workbench.md` → Procedure Focus Deck.
 */

/** Face row height — 40px at default root (matches checklist row). */
export const PROCEDURE_STACK_FACE_REM = 2.5;
/** Gap between adjacent full faces. Maps to `mt-3`. */
export const PROCEDURE_STACK_GAP_REM = 0.75;
