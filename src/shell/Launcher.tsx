'use client';

/**
 * THE LAUNCHER — the one index. There is no second "+".
 *
 * `Ctrl+K` (S12 gave ⌘N to the session block); the scan field also opens it
 * in place once two characters are typed, without parking the session.
 *
 * ON SHADCN `CommandDialog` (cmdk) SINCE 2026-08-24. The hand-rolled
 * version kept a `flat` array, an `index` integer, modulo arithmetic for
 * ↑/↓, a `scrollIntoView` ref on the selected row, and a substring filter
 * — every one of those is cmdk's job and cmdk does them better. It also
 * had two real defects this removes: the results list was a pile of
 * `<button>`s with no listbox semantics (a screen reader was told nothing
 * about position or count), and `index` was reset to 0 on each keystroke
 * while `flat` changed underneath it, so the highlight could land on a
 * different row than the one Enter would run.
 *
 * The work QUEUES live here now, not in a rail. A queue is a table: it wants
 * width, columns, sort and virtualization, none of which a 208px strip can
 * give it. Every entry in the Tables group was a sidebar rail.
 *
 * NO EXACT MATCH IS NOT A DEAD END — it is the orchestration case. The
 * launcher is already the one "tell me what you want" surface, so natural
 * language belongs HERE, not behind a second input.
 */

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Icon, type IconName } from '@/shell/icons';
import type { ShellApi } from '@/shell/useShell';

interface LauncherItem {
  readonly title: string;
  readonly meta: string;
  readonly icon: IconName;
  readonly run: () => void;
}

interface LauncherGroup {
  readonly label: string;
  readonly items: readonly LauncherItem[];
}

function buildGroups(shell: ShellApi): readonly LauncherGroup[] {
  const t = (ref: string, title: string) => () => shell.openTile(ref, title, 'table');
  const s = (ref: string, title: string) => () => shell.openTile(ref, title, 'session');

  return [
    {
      label: 'Sessions',
      items: [
        { title: 'Unbox session', meta: 'Start receiving cartons', icon: 'box', run: s('unbox', 'Unbox') },
        { title: 'Packing session', meta: 'Pack graded units', icon: 'box', run: s('packing', 'Packing') },
        { title: 'QC session', meta: 'Quality control', icon: 'box', run: s('qc', 'QC') },
        {
          title: 'FBA shipment build',
          meta: 'Task session · the unit of work is the BATCH',
          icon: 'box',
          run: s('fba-build', 'FBA shipment'),
        },
      ],
    },
    {
      label: 'Tables',
      items: [
        { title: 'Triage queue', meta: 'Was: receiving triage rail', icon: 'table', run: t('triage', 'Triage') },
        { title: 'Receiving feed', meta: 'Was: unbox recent rail', icon: 'table', run: t('receiving', 'Receiving') },
        { title: 'Pickup queue', meta: 'Was: pickup sidebar rail', icon: 'table', run: t('pickup', 'Pickup') },
        { title: 'Label prints', meta: 'Was: product-labels rail', icon: 'table', run: t('labels', 'Labels') },
        {
          title: 'Settings',
          meta: 'A tile like everything else · arrangement · comfort · meaning',
          icon: 'settings',
          run: t('settings', 'Settings'),
        },
        { title: 'Units', meta: 'All inventory units', icon: 'table', run: t('units', 'Units') },
        { title: 'Orders', meta: 'Open orders', icon: 'table', run: t('orders', 'Orders') },
        { title: 'Returns', meta: 'Return merchandise', icon: 'table', run: t('returns', 'Returns') },
        {
          title: 'Boxes packed',
          meta: "Today's count by packer — PACK_COMPLETED",
          icon: 'box',
          run: t('packed-today', 'Packed'),
        },
      ],
    },
    {
      label: 'Tools',
      items: [
        { title: 'Pairing', meta: 'TRK# to serial', icon: 'split', run: () => shell.toggleTool('pairing') },
        { title: 'Timer', meta: 'Session elapsed time', icon: 'timer', run: () => shell.toggleTool('timer') },
        { title: 'Stopwatch', meta: 'Lap timing', icon: 'stopwatch', run: () => shell.toggleTool('stopwatch') },
        { title: 'Photo library', meta: 'Unit photos', icon: 'image', run: () => shell.toggleTool('photos') },
        { title: 'Manuals', meta: 'Product documentation', icon: 'book', run: () => shell.toggleTool('manuals') },
        { title: 'Label printer', meta: 'Print shipping labels', icon: 'printer', run: () => shell.toggleTool('printer') },
        { title: 'Calculator', meta: 'Quick math', icon: 'calc', run: () => shell.toggleTool('calc') },
      ],
    },
    {
      label: 'Admin',
      items: [
        { title: 'Toggle theme', meta: 'Light / dark', icon: 'palette', run: shell.toggleTheme },
        { title: 'Header readout — pace', meta: 'Elapsed + target, coloured', icon: 'timer', run: () => shell.setFaceMode('pace') },
        { title: 'Header readout — elapsed only', meta: 'The clock, never a verdict', icon: 'timer', run: () => shell.setFaceMode('elapsed') },
        { title: 'Header readout — off', meta: 'Hide it. Work is still recorded', icon: 'timer', run: () => shell.setFaceMode('off') },
        { title: 'Simulate offline', meta: 'Show the queued-changes banner', icon: 'wifi-off', run: shell.toggleOffline },
      ],
    },
  ];
}

export function Launcher({ shell }: { shell: ShellApi }) {
  const groups = buildGroups(shell);
  const open = shell.launcherQuery !== null;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => { if (!next) shell.closeLauncher(); }}
      className="max-w-xl"
      title="Launcher"
      description="Search sessions, tables and tools"
    >
      {/* No `value`/`onValueChange`: cmdk owns the query. `shell.launcherQuery`
          is still the OPEN signal and still carries the prefill the scan
          field hands over, but the keystroke-by-keystroke state does not
          need to round-trip through the shell store to filter a static list. */}
      <CommandInput
        placeholder="Search sessions, tables, tools…"
        defaultValue={shell.launcherQuery ?? ''}
      />
      <CommandList>
        <CommandEmpty>No match. Try a session, a table or a tool.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.items.map((item) => (
              <CommandItem
                key={`${group.label}:${item.title}`}
                /* `value` is what cmdk scores against. Title alone would
                   miss "Was: pickup sidebar rail" — the meta line is how an
                   operator who knows the OLD navigation finds the new one. */
                value={`${item.title} ${item.meta}`}
                onSelect={() => { item.run(); shell.closeLauncher(); }}
              >
                <Icon name={item.icon} size={14} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.meta}</span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
