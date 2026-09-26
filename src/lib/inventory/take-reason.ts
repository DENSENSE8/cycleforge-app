/** Why stock left a location on the phone take flow — FBA, Orders, or the operator's own words. */
export const TAKE_REASONS = [
  { code: 'TAKE_FBA', label: 'FBA' },
  { code: 'TAKE_ORDER', label: 'Orders' },
  { code: 'TAKE_CUSTOM', label: 'Custom…' },
] as const;

export type TakeReasonCode = (typeof TAKE_REASONS)[number]['code'];

/** No choice made: the take keeps the location default. */
export const TAKE_DEFAULT_REASON = 'BIN_PULL';

export type TakeReasonChoice = { code: TakeReasonCode; custom: string } | null;

export type TakeReasonPayload =
  | { ok: true; reason: string; notes: string | null }
  | { ok: false; error: string };

export function takeReasonPayload(choice: TakeReasonChoice): TakeReasonPayload {
  if (!choice) return { ok: true, reason: TAKE_DEFAULT_REASON, notes: null };
  const text = choice.custom.trim();
  if (choice.code === 'TAKE_CUSTOM') {
    if (!text) return { ok: false, error: 'Type the reason for this take' };
    return { ok: true, reason: 'TAKE_CUSTOM', notes: text.slice(0, 2_000) };
  }
  return { ok: true, reason: choice.code, notes: null };
}

const LEDGER_LABELS: Readonly<Record<string, string>> = {
  TAKE_FBA: 'Taken · FBA',
  TAKE_ORDER: 'Taken · Orders',
  TAKE_CUSTOM: 'Taken',
};

/** Human label for a take code; other reasons pass through unchanged. */
export function takeReasonLedgerLabel(reason: string): string {
  return LEDGER_LABELS[reason] ?? reason;
}
