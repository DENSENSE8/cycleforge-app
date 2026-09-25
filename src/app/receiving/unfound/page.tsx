/**
 * /receiving/unfound — relocated.
 *
 * The Unfound queue (email-PO / unmatched triage) is no longer a receiving
 * mode. The retired PO Mailbox door falls back to the inbound ledger so old
 * links / bookmarks keep working.
 */

import { redirect } from 'next/navigation';

export default function UnfoundPage() {
  redirect('/incoming');
}
