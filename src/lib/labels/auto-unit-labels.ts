export const MAX_AUTO_UNIT_LABELS = 100;

export type LabelPrintClass = 'print' | 'auto-unit' | 'sn-to-sku';

type ResolveLabelSerialsResult =
  | { ok: true; serials: string[]; synthetic: boolean }
  | { ok: false; error: string };

/**
 * Expands the auto-unit quantity into stable hidden serial keys. The key is
 * deterministic for a client event so a retried request resolves the same
 * serial_units rows and cannot burn a second set of unit_uid values.
 */
export function resolveLabelIssueSerials(args: {
  printClass: LabelPrintClass;
  serialNumbers: string[];
  quantity: unknown;
  clientEventId: string | null;
}): ResolveLabelSerialsResult {
  if (args.printClass !== 'auto-unit') {
    if (args.serialNumbers.length > MAX_AUTO_UNIT_LABELS) {
      return {
        ok: false,
        error: `serialNumbers[] cannot contain more than ${MAX_AUTO_UNIT_LABELS} entries`,
      };
    }
    return args.serialNumbers.length > 0
      ? { ok: true, serials: args.serialNumbers, synthetic: false }
      : { ok: false, error: 'Missing required field: serialNumbers[]' };
  }

  const quantity = Number(args.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_AUTO_UNIT_LABELS) {
    return {
      ok: false,
      error: `quantity must be an integer from 1 to ${MAX_AUTO_UNIT_LABELS}`,
    };
  }

  const eventId = args.clientEventId?.trim() ?? '';
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(eventId)) {
    return { ok: false, error: 'clientEventId is required for auto-unit label issuance' };
  }

  return {
    ok: true,
    synthetic: true,
    serials: Array.from(
      { length: quantity },
      (_, index) => `AUTO-${eventId}-${String(index + 1).padStart(3, '0')}`,
    ),
  };
}
