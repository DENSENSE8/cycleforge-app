/**
 * The route a press takes NOW on this workstation — read at press time, never
 * from a stale render. Printer profiles, routing and the silent switch live in
 * the workstation's storage, so this is browser-only.
 */

import { getRouting, listProfiles } from '@/lib/print/browserPrint';
import { desktopPrintHost } from '@/lib/print/desktop-print-host';
import { isSilentPrintEnabled } from '@/lib/print/printMode';
import { resolvePrintRoute, type LabelPrintRoute, type PrintStock } from './print-route';

export function currentPrintRoute(stock: PrintStock): LabelPrintRoute {
  const routing = getRouting();
  return resolvePrintRoute({
    stock,
    silent: isSilentPrintEnabled(),
    profiles: listProfiles(),
    routedProfileId: (stock === 'label' ? routing.label : routing.paper) ?? null,
    host: desktopPrintHost(),
  });
}
