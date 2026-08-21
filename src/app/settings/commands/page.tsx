import { CommandBookSheet } from '@/components/stations/CommandBookSheet';

/**
 * `/settings/commands` — the scan command book.
 *
 * A read-and-print catalog of the whole `CMD-*` vocabulary. Relabel / custom
 * rows stay in Admin › Reason Codes (`flow_context = 'station_command'`), which
 * already owns reason-code CRUD; this page does not fork a second editor for
 * the same table.
 */
export default function CommandBookPage() {
  return <CommandBookSheet />;
}
