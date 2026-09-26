import { CommandBookSheet } from '@/components/stations/CommandBookSheet';
import { SETTINGS_FLOOR_CLASS } from '@/components/settings/settings-sections';
import { cn } from '@/utils/_cn';

/** `/settings/commands` — the scan command book. */
export default function CommandBookPage() {
  return (
    <div className={cn('h-full min-h-0 w-full overflow-y-auto', SETTINGS_FLOOR_CLASS)}>
      <CommandBookSheet />
    </div>
  );
}
