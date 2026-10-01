import { scannedUnitKey, type ScanRoute } from '@/lib/barcode-routing';

/**
 * One route contract for every label accepted by the QC scan station.
 * Identity routes (`/m/u`, `/m/r`, `/m/h`) remain stable; this helper chooses
 * the job route that performs QC on that identity.
 */
export function qcWorkHref(route: ScanRoute): string | null {
  if (route.type === 'serial-unit') {
    const key = scannedUnitKey(route.value);
    return key ? `/m/u/${encodeURIComponent(key)}/qc` : null;
  }
  if (route.type === 'receiving-line') {
    const id = /^\/m\/l\/(\d+)$/.exec(route.redirect || '')?.[1];
    return id ? `/m/qc/line/${id}` : null;
  }
  if (route.type === 'receiving') {
    const id = /^\/m\/r\/(\d+)$/.exec(route.redirect || '')?.[1];
    return id ? `/m/r/${id}/qc` : null;
  }
  if (route.type === 'handling-unit' || route.type === 'sscc') {
    const id = /^\/m\/h\/([^/?#]+)$/.exec(route.redirect || '')?.[1];
    const ref = id ? decodeURIComponent(id) : route.value.trim();
    return ref ? `/m/qc/lpn/${encodeURIComponent(ref)}` : null;
  }
  return null;
}
