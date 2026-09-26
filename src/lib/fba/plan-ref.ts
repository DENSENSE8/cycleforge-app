/** Human-facing FBA **plan** code stored in `fba_shipments.shipment_ref`. */
export function buildFbaPlanRefFromIsoDate(isoYmd: string): string {
  const raw = String(isoYmd || '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return 'FBA-00/00/00';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return 'FBA-00/00/00';
  const yy = String(year % 100).padStart(2, '0');
  return `FBA-${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${yy}`;
}
