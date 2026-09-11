/**
 * /kiosk first-paint — catalog trail (toggle + All products), not welcome copy.
 *
 * Callers: Next.js loading UI for `/kiosk`. Affected API: none. Schemas: none.
 * User: "Remove the welcome, how can we help you?"
 */

import { KioskCatalogFirstPaint } from './KioskCatalogFirstPaint';

export default function Loading() {
  return <KioskCatalogFirstPaint className="min-h-dvh" />;
}
