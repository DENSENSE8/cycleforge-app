'use client';

/**
 * The first four tools, as descriptors.
 *
 * Importing this module registers them. That is the whole point: a tool is data
 * at module scope, so it is registered whether or not any page is mounted, and
 * the palette can open it from a receiving bench, a shipping station, or the
 * agent loop. Under the old model each of these could only be opened from the
 * one page that happened to render it.
 *
 * ## Every `load` is a dynamic `import()`, and that is load-bearing
 *
 * A static import here would pull the media library, the manuals API and the
 * whole `browserPrint` profile store into the shell bundle — on every route,
 * for every operator, whether or not a tool is ever opened. Splitting the
 * sidebar panels into per-route chunks was already measured as this repo's
 * single largest bundle lever (~1MB gz); a tool registry that eagerly imports
 * its tools would hand that back.
 *
 * ## Chords
 *
 * All four are `Mod+Shift+<letter>`, following the two chords the app already
 * has (⌘⇧V clipboard, ⌘⇧U throw) so operators learn one shape rather than four.
 * Every one is registered through `@/lib/keybindings`, so
 * `findKeybindingConflicts()` can see a collision the moment one is added —
 * which is exactly what 56 hand-rolled `keydown` listeners could never do.
 *
 * Letters were chosen away from the existing two and away from browser chords
 * that matter on a bench (⌘⇧T reopens a closed tab, ⌘⇧N a window, ⌘⇧P is
 * Firefox private browsing but free in Chrome/Edge, which is what the warehouse
 * runs):
 *
 * | Tool          | Chord | Why that letter |
 * |---------------|-------|-----------------|
 * | Photo Library | ⌘⇧L   | **L**ibrary — ⌘⇧P is Firefox private browsing |
 * | Manuals       | ⌘⇧M   | **M**anuals |
 * | Label Printer | ⌘⇧K   | ⌘⇧L and ⌘⇧P are taken; **K** is the free neighbour |
 * | Calculator    | ⌘⇧C   | **C**alculator — ⌘⇧C is devtools inspect, which no operator uses |
 */

import { FileText, Hash, Images, Printer } from '@/lib/icons';
import { processToolDescriptor } from '@/lib/workspace/process-descriptor';
import { registerTool } from '@/lib/tools/registry';

/**
 * The Process tool — one session's ledger, with Undo on whatever captured an
 * inverse. It is built in `src/components/workspace/process/` (roadmap phase 8)
 * and its descriptor is registered HERE rather than at its own module scope so
 * that importing this one file is still the whole of "populate the registry".
 */
registerTool(processToolDescriptor);

registerTool({
  toolKey: 'photo-library',
  title: 'Photo Library',
  icon: Images,
  group: 'reference',
  keybinding: 'Mod+Shift+L',
  load: () => import('@/components/workspace/tools/library/PhotoLibraryTool'),
  // Dragging the icon onto a carton tile will open the library already scoped
  // to that carton; the drop target fills in the id. Scalars only — `TabParams`
  // is flat by contract.
  dragPayload: { text: 'Photo Library' },
});

registerTool({
  toolKey: 'manuals',
  title: 'Manuals',
  icon: FileText,
  group: 'reference',
  keybinding: 'Mod+Shift+M',
  // NOT a singleton, deliberately: two manuals side by side (a wiring diagram
  // and a parts list) is the actual bench task.
  load: () => import('@/components/workspace/tools/library/ManualsTool'),
  dragPayload: { text: 'Manuals' },
});

registerTool({
  toolKey: 'label-printer',
  title: 'Label Printer',
  icon: Printer,
  group: 'output',
  keybinding: 'Mod+Shift+K',
  // ONE instance. The paired-device list and the role routing are workstation
  // globals, so two tiles would be two views of one store racing each other's
  // writes — and each would offer its own Pair button onto one chooser.
  singleton: true,
  /**
   * WebUSB / Web Serial. See `LabelPrinterTool`'s docblock: `requestDevice()`
   * throws without transient user activation, and a dynamic `import()` spends
   * it — so the chooser is only ever reached from a real click on the tool's
   * own Pair button, never from mount, a hotkey, or the agent.
   */
  requiresUserActivation: true,
  load: () => import('@/components/workspace/tools/library/LabelPrinterTool'),
});

registerTool({
  toolKey: 'calculator',
  title: 'Calculator',
  // No calculator glyph exists in `@/lib/icons`, and adding one is an
  // edit to the icon SoT that this change does not need. `Hash` is the closest
  // numeric mark already in the set.
  icon: Hash,
  group: 'utility',
  keybinding: 'Mod+Shift+C',
  load: () => import('@/components/workspace/tools/library/CalculatorTool'),
  dragPayload: { text: 'Calculator' },
});
