/**
 * /m/scan — retired 2026-09-06 (workstation pivot).
 *
 * The universal three-mode pager duplicated the door loop the workstation
 * already owns and carried desk-style scan chrome. This route now forwards to
 * the workstation; its two real modes live under their own routes:
 * /m/testing (PO testing) and /m/prepacked (verify / put-away), reachable from
 * the Stack's Queues band and Find. Old links and QR stickers keep working.
 */

import { redirect } from 'next/navigation';

export default function MobileScanRedirectPage() {
  redirect('/m/triage');
}
