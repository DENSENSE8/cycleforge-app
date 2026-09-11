import { CommandBookSheet } from '@/components/stations/CommandBookSheet';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { cn } from '@/utils/_cn';

/**
 * `/settings/commands` — the scan command book.
 *
 * A read-and-print catalog of the whole `CMD-*` vocabulary. Relabel / custom
 * rows stay in Admin › Reason Codes (`flow_context = 'station_command'`), which
 * already owns reason-code CRUD; this page does not fork a second editor for
 * the same table.
 */
export default function CommandBookPage() {
  return (
    <div className={cn('min-h-full', SETTINGS_FLOOR_CLASS)}>
      <CommandBookSheet />
    </div>
  );
}
