'use client';

/**
 * A tool's chord, wired from its descriptor into the keybinding registry.
 *
 * Two things live here and nothing else:
 *
 *  - {@link toolOpenKeybindingId} — the one place the id is spelled. The
 *    palette reads the chord face by this id and the registration writes it by
 *    the same id, so the hint and the listener cannot drift. That is the
 *    generalization of `CLIPBOARD_HISTORY_HOTKEY_LABEL` / `THROW_TASK_HOTKEY_LABEL`,
 *    which exist because there was nowhere else to put the pairing.
 *  - {@link registerToolKeybindings} — bind every descriptor that declared a
 *    `keybinding`, and return one disposer for the lot.
 *
 * The chord TOGGLES: pressing it with the tool open closes it. An operator who
 * pressed a chord to look something up presses the same chord to put it away,
 * and both quick-access precedents (`setOpen((v) => !v)`) already do exactly
 * this.
 */

import { registerKeybinding } from '@/lib/keybindings/registry';
import { listTools } from '@/lib/tools/registry';
import { closeToolsOf, getToolPaletteSnapshot, openTool } from '@/lib/tools/store';

/** The binding id for "open/close this tool". One speller, no drift. */
export function toolOpenKeybindingId(toolKey: string): string {
  return `tool.${toolKey}.open`;
}

/**
 * Register the open chord for every tool that declared one. Call once, from
 * the runtime mount, after the descriptor modules have been imported.
 */
export function registerToolKeybindings(): () => void {
  const disposers: Array<() => void> = [];
  for (const descriptor of listTools()) {
    if (!descriptor.keybinding) continue;
    disposers.push(
      registerKeybinding({
        id: toolOpenKeybindingId(descriptor.toolKey),
        chord: descriptor.keybinding,
        label: `Open ${descriptor.title}`,
        scope: 'global',
        run: () => {
          const open = getToolPaletteSnapshot().openTools.some(
            (t) => t.toolKey === descriptor.toolKey,
          );
          if (open) closeToolsOf(descriptor.toolKey);
          else openTool({ toolKey: descriptor.toolKey, openedBy: 'keybinding' });
        },
      }),
    );
  }
  return () => {
    for (const dispose of disposers) dispose();
  };
}
