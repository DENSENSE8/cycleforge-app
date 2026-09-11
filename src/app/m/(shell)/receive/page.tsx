/**
 * /m/receive — deprecated alias. Identification lives on /m/scan.
 */

import { redirect } from 'next/navigation';

/** @deprecated Prefer `/m/scan`. */
export default function MobileReceivePage() {
  redirect('/m/scan');
}
