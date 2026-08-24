/**
 * The Process tool as DATA.
 *
 * A tool descriptor, not a live `ReactNode` — that is the structural change
 * 02-target-architecture §1 names as the one that "unblocks everything". A
 * registration that carries an element only exists while its owning page is
 * mounted, which is precisely why tools cannot be opened from anywhere today.
 * A descriptor is inert: the host mounts it lazily, from any tile, and the
 * registry can be read (searched, pinned, keybound) without instantiating
 * anything.
 *
 * `icon` is the icon COMPONENT, not an element. Same reasoning as `load`: an
 * element is a value that has already been built, and a registry entry that
 * holds one has already paid for a tool nobody opened.
 *
 * ── WHY THE LOCAL DESCRIPTOR INTERFACE IS GONE ──────────────────────────────
 *
 * This file used to declare its own `WorkspaceToolDescriptor` so it could
 * compile while `src/lib/tools/registry.ts` was being built in a parallel lane.
 * Both lanes have landed, so the stand-in is deleted and the real
 * {@link ToolDescriptor} is imported — which is the whole point of having
 * matched the field names up front. Registration happens in
 * `@/lib/tools/descriptors`, beside the other four tools, so there is exactly
 * one module whose import causes the registry to be populated.
 */

import type { ToolDescriptor } from '@/lib/tools/types';
import { RotateCcw } from '@/lib/icons';

export const processToolDescriptor: ToolDescriptor = {
  toolKey: 'process',
  // Named for what it shows, not for what it does to it. "Undo" would be a
  // promise this tool deliberately does not make about every row it lists.
  title: 'Process',
  icon: RotateCcw,
  // `session` leads the palette because the ledger for the work in front of the
  // operator is the one they reach for without looking.
  group: 'session',
  load: () => import('./ProcessToolPanel'),
};
