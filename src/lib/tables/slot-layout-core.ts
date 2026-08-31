/**
 * SlotLayout core — types, budgets, and the tolerant READ path, zod-free.
 *
 * Split from `slot-layout.ts` the same way `staff-preferences-constants` split
 * from its schema: client code (the To-ship mount, the Fields picker hook)
 * reads persisted layouts on every paint, and importing the zod schema for
 * that would pull zod into a dashboard bundle whose First Load JS is
 * budget-ratcheted. The zod module keeps the strict WRITE gate
 * (`parseSlotLayout`) for API boundaries; every read — client or server —
 * goes through {@link readStoredSlotLayout} here, so there is exactly one
 * answer to "what does a stored blob deserialize to".
 *
 * Contract: `docs/todo/slot-based-metadata-table-PLAN.md` §4.2.
 */

/** One slot binding: which catalog fact occupies the slot. */
export interface SlotBinding {
  fieldId: string;
}

/**
 * One whole layout document for one tableId. Cascades product → org → staff →
 * saved view as a WHOLE document (`resolve-effective-layout.ts`).
 */
export interface SlotLayout {
  /** `compound` = two-line WMS row; `sheet` = one-line spreadsheet row. */
  morph: 'sheet' | 'compound';
  identityFieldId: string;
  statusBindings: SlotBinding[];
  subtitleBindings: SlotBinding[];
  amountFieldId?: string | null;
}

/** Status band budget — aligned with `MAX_DEFAULT_VISIBLE_TRACKS` (10). */
export const MAX_STATUS_SLOTS = 10;

/** Subtitle band budget. */
export const MAX_SUBTITLE_SLOTS = 5;

/** Picker copy when a band is full. One sentence, one number, one verb. */
export function slotLimitMessage(kind: 'status' | 'subtitle'): string {
  const cap = kind === 'status' ? MAX_STATUS_SLOTS : MAX_SUBTITLE_SLOTS;
  const band = kind === 'status' ? 'Status' : 'Subtitle';
  return `${band} limit (${cap}) reached — remove one to add another.`;
}

function readBindings(raw: unknown, cap: number): SlotBinding[] | null {
  if (!Array.isArray(raw) || raw.length > cap) return null;
  const bindings: SlotBinding[] = [];
  for (const entry of raw) {
    const fieldId = (entry as { fieldId?: unknown } | null)?.fieldId;
    if (typeof fieldId !== 'string' || fieldId.length === 0) return null;
    bindings.push({ fieldId });
  }
  return bindings;
}

/**
 * Tolerant read of a persisted blob — the ONE read path. Returns a fresh
 * normalized document (known keys only), or `null` for anything that is not
 * structurally a SlotLayout (absent, legacy shape, hostile) — a bad org
 * override must degrade to the next cascade layer, never crash a queue.
 * Catalog staleness is NOT checked here; `resolveEffectiveLayout` drops stale
 * bindings so the layout still paints.
 */
export function readStoredSlotLayout(raw: unknown): SlotLayout | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const doc = raw as Record<string, unknown>;
  if (doc.morph !== 'sheet' && doc.morph !== 'compound') return null;
  if (typeof doc.identityFieldId !== 'string' || doc.identityFieldId.length === 0) return null;
  const statusBindings = readBindings(doc.statusBindings, MAX_STATUS_SLOTS);
  const subtitleBindings = readBindings(doc.subtitleBindings, MAX_SUBTITLE_SLOTS);
  if (!statusBindings || !subtitleBindings) return null;
  const amountFieldId =
    typeof doc.amountFieldId === 'string' && doc.amountFieldId.length > 0
      ? doc.amountFieldId
      : null;
  return {
    morph: doc.morph,
    identityFieldId: doc.identityFieldId,
    statusBindings,
    subtitleBindings,
    amountFieldId,
  };
}
