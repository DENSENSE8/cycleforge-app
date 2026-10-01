/** Closed vocabulary for why physical stock left a location. */
export const TAKE_REASONS = [
  { code: 'TAKE_ORDER', label: 'Customer order' },
  { code: 'TAKE_FBA', label: 'FBA' },
  { code: 'TAKE_MOVE', label: 'Move' },
  { code: 'TAKE_DAMAGED', label: 'Damaged' },
  { code: 'TAKE_MISSING', label: 'Missing' },
  { code: 'TAKE_VENDOR', label: 'Return to vendor' },
  { code: 'TAKE_COUNT', label: 'Count correction' },
  { code: 'TAKE_CUSTOM', label: 'Custom…' },
] as const;

export type TakeReasonCode = (typeof TAKE_REASONS)[number]['code'];

export type TakeReasonChoice = { code: TakeReasonCode; custom: string } | null;

type TakeReasonPayload =
  | { ok: true; reason: string; notes: string | null }
  | { ok: false; error: string };

export function takeReasonPayload(choice: TakeReasonChoice): TakeReasonPayload {
  if (!choice) return { ok: false, error: 'Choose why this stock is leaving' };
  const text = choice.custom.trim();
  if (choice.code === 'TAKE_CUSTOM') {
    if (!text) return { ok: false, error: 'Type the reason for this take' };
    return { ok: true, reason: 'TAKE_CUSTOM', notes: text.slice(0, 2_000) };
  }
  return { ok: true, reason: choice.code, notes: null };
}

const LEDGER_LABELS: Readonly<Record<string, string>> = {
  TAKE_ORDER: 'Taken · Customer order',
  TAKE_FBA: 'Taken · FBA',
  TAKE_MOVE: 'Taken · Move',
  TAKE_DAMAGED: 'Taken · Damaged',
  TAKE_MISSING: 'Taken · Missing',
  TAKE_VENDOR: 'Taken · Return to vendor',
  TAKE_COUNT: 'Taken · Count correction',
  TAKE_CUSTOM: 'Taken',
};

/** Human label for a take code; other reasons pass through unchanged. */
export function takeReasonLedgerLabel(reason: string): string {
  return LEDGER_LABELS[reason] ?? reason;
}
