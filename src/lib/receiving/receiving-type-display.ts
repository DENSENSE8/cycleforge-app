/**
 * Human label for a receiving type code (PO / RETURN / TRADE_IN / PICKUP).
 * Mirrors `RECEIVING_TYPE_OPTS`' labels; returns '' for an empty/unknown code.
 *
 * Lives here — not in `lib/print/printReceivingLabel` where it originated —
 * because it is a pure presentation-kind mapper with zero print dependencies.
 * Importing it from the print module dragged the whole label-print stack
 * (incl. the ~250 KB bwip-js barcode engine) into every consumer's client
 * bundle (useCatalog reaches most workbench surfaces).
 */
export function receivingLabelTypeDisplay(code: string | null | undefined): string {
  const c = String(code ?? '').trim().toUpperCase();
  switch (c) {
    case 'PO':
      return 'PO';
    case 'RETURN':
      return 'Return';
    case 'TRADE_IN':
      return 'Trade In';
    case 'PICKUP':
      return 'Pick Up';
    case '':
      return '';
    default:
      return c.replace(/_/g, ' ');
  }
}
