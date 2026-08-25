/**
 * Tool model — the data half of the Warehouse OS tool palette.
 *
 * ## The one structural change
 *
 * Today a tool registration stores a **live React element owned by a mounted
 * page**:
 *
 * ```ts
 * useRegisterRightPanel({ id, priority, node: <PhotoInspectorPanel/> })
 * ```
 *
 * That element only exists while its owning page is mounted, so a tool
 * structurally *cannot* open from anywhere else. There are 43 such registration
 * sites across the repo and 42 of them sit at the same priority rank
 * (`RIGHT_RAIL_PRIORITY.detail`), simply stealing the slot from each other.
 *
 * A {@link ToolDescriptor} is **data**: a title, an icon, a group, and a lazy
 * `load()` factory. It is registered at module scope, so a tool is registered
 * whether or not any page is mounted — which is the entire point. The host
 * mounts the component when an instance opens, from any tile, any keybinding,
 * or the agent loop.
 *
 * ## No permission field — ruled 2026-08-22
 *
 * Descriptors carry no `permission`. The 969 API routes stay gated by
 * `withAuth`, and that is the real boundary; a client-side field would be a
 * second, weaker, drifting copy of it. Do not add one.
 *
 * ## Params reuse the tab vocabulary on purpose
 *
 * {@link ToolInstance.params} is `TabParams` from `@/lib/workspace/types` —
 * flat, JSON scalars, never nested. A tool instance is a tab of kind `'tool'`
 * waiting to happen, and reusing the type means an open tool round-trips
 * through `staff_preferences` (JSONB, shallow merge) and the address bar with
 * no codec of its own. Nested bags are exactly the shape that loses half of
 * itself when two panes write at once.
 */

import type { ComponentType } from 'react';
import type { TabParams } from '@/lib/workspace/types';

/**
 * Palette grouping. Groups are the palette's only ordering axis — there is no
 * priority number, deliberately: 42 of the 43 legacy registrations shared one
 * rank, which proved a per-registrant number carries no information anybody
 * maintained.
 */
export type ToolGroup = 'session' | 'capture' | 'reference' | 'output' | 'utility';

/**
 * Group paint order in the palette, and the order {@link listToolsByGroup}
 * returns. `session` leads because a tool bound to the work in front of the
 * operator (the Process ledger for THIS session) is the one they reach for
 * without looking; a Calculator is the one they hunt for.
 */
export const TOOL_GROUP_ORDER: readonly ToolGroup[] = Object.freeze([
  'session',
  'capture',
  'reference',
  'output',
  'utility',
]);

export const TOOL_GROUP_LABEL: Readonly<Record<ToolGroup, string>> = Object.freeze({
  session: 'Session',
  capture: 'Capture',
  reference: 'Reference',
  output: 'Output',
  utility: 'Utility',
});

/**
 * The repo's glyphs are `({ className }) => <svg/>` (see `@/lib/icons`),
 * so that is the contract — not a name string that a second module has to map
 * back to a component.
 *
 * Written as a FUNCTION type rather than `ComponentType<…>` on purpose. It is
 * structurally identical to `SidebarIconComponent` (`@/lib/sidebar-navigation`),
 * which is what every icon consumer in the shell already takes — the nav rows,
 * the command bar, the rail's launch index. `ComponentType` additionally admits
 * a CLASS component, and that one extra member is enough to make a tool icon
 * un-assignable to every one of those consumers, for a shape no glyph in this
 * repo has ever had. Structural equality is stated here rather than imported so
 * this module keeps its empty dependency graph.
 */
export type ToolIcon = (props: { className?: string }) => JSX.Element;

/** How an instance came to be open. See {@link toolMayAutoInvokeDevicePicker}. */
export type ToolOpenSource = 'click' | 'keybinding' | 'agent' | 'restore';

/**
 * What the palette hands a drop target when a tool icon is dragged onto a tile.
 * Descriptor-level, not per-instance: the drag starts from the palette, where
 * no instance exists yet.
 */
export interface ToolDragPayload {
  /** `DataTransfer` type. Defaults to {@link TOOL_DRAG_MIME}. */
  readonly mime?: string;
  /** Params seeded into the instance the drop creates. */
  readonly params?: TabParams;
  /** `text/plain` fallback, so a drop onto a text field is not JSON garbage. */
  readonly text?: string;
}

/** The house drag type for a tool. One constant so a drop handler can match it. */
export const TOOL_DRAG_MIME = 'application/x-cycleforge-tool';

/** Everything a mounted tool body is given. Uniform across every tool. */
export interface ToolProps {
  /** This open instance. Two instances of one tool have different ids. */
  readonly instanceId: string;
  /** This instance's own view state — never a sibling's. */
  readonly params: TabParams;
  /** Persist a params patch. `undefined` removes a key. */
  readonly setParams: (patch: Readonly<Record<string, string | number | boolean | null | undefined>>) => void;
  /** Ask the host to close this instance (runs the full close, not half of it). */
  readonly requestClose: () => void;
  /** How this instance was opened — the WebUSB activation question. */
  readonly openedBy: ToolOpenSource;
  /**
   * The host's answer to "may I call a device chooser without an operator
   * click?". Always `false` for a `requiresUserActivation` tool — see
   * {@link toolMayAutoInvokeDevicePicker}. A tool that pairs hardware reads
   * this and renders a **pair button** instead of calling `requestDevice()`.
   */
  readonly mayAutoInvokeDevicePicker: boolean;
}

export interface ToolDescriptor {
  /** Stable identity. Kebab-case, no prefix: `photo-library`, `label-printer`. */
  readonly toolKey: string;
  /** Palette label and the tile's identity value. */
  readonly title: string;
  readonly icon: ToolIcon;
  readonly group: ToolGroup;
  /**
   * Lazy factory. `() => import('...')` and nothing else — a static import here
   * would pull every tool's graph into the shell bundle and undo the reason the
   * registry is data in the first place.
   */
  readonly load: () => Promise<{ default: ComponentType<ToolProps> }>;
  /** Palette drag source payload. Omit for tools that are not drag sources. */
  readonly dragPayload?: ToolDragPayload;
  /**
   * Default chord spec (`'Mod+Shift+P'`). Parsed by `@/lib/keybindings/chord`;
   * an unparseable spec is dropped with a warn rather than silently binding
   * nothing.
   */
  readonly keybinding?: string;
  /**
   * At most ONE instance may be open. Use for tools whose state is inherently
   * global (a paired printer, a device chooser); leave off for tools an
   * operator legitimately wants two of (two manuals side by side).
   */
  readonly singleton?: boolean;
  /**
   * **WebUSB / Web Serial.** `navigator.usb.requestDevice()` throws
   * `SecurityError` without *transient user activation*, and activation is
   * spent by the time an async `import()` resolves — so a tool that pairs a
   * device can never auto-invoke the chooser, not even when a click opened it.
   *
   * The host honours this by rendering a **pair button** inside the tile
   * instead of calling the chooser on mount. The operator's click on that
   * button is the activation. See {@link toolMayAutoInvokeDevicePicker}.
   */
  readonly requiresUserActivation?: boolean;
  /** Accessible name for the tile. Falls back to {@link title}. */
  readonly ariaLabel?: string;
}

/**
 * Whether the host may call a device chooser without an operator click.
 *
 * **Always false for `requiresUserActivation` tools**, and the reason is not
 * caution — it is the platform: the transient activation granted by the click
 * that opened the tool is already consumed by the dynamic `import()` and the
 * React commit that follow it, so `requestDevice()` rejects with a
 * `SecurityError` regardless of {@link ToolProps.openedBy}. A hotkey- or
 * agent-opened tool never had activation at all. One predicate so no tool has
 * to re-derive the rule and get it wrong on the bench.
 */
export function toolMayAutoInvokeDevicePicker(descriptor: ToolDescriptor): boolean {
  return descriptor.requiresUserActivation !== true;
}

/** One OPEN tool. Serializable — holds no React node, by construction. */
export interface ToolInstance {
  /** Instance identity, unique per open tool. */
  readonly instanceId: string;
  /** Which descriptor this instance mounts. */
  readonly toolKey: string;
  /** This instance's own view state. */
  readonly params: TabParams;
  /** `Date.now()` at open — the palette's stable ordering key. */
  readonly openedAt: number;
  readonly openedBy: ToolOpenSource;
}

/**
 * The immutable snapshot `useSyncExternalStore` hands React. Recomputed only on
 * mutation: a fresh object per `getSnapshot()` call is an infinite render loop,
 * which is the single failure mode this house pattern exists to avoid.
 */
export interface ToolPaletteSnapshot {
  /** Open instances, oldest first — the tile paint order down the rail. */
  readonly openTools: readonly ToolInstance[];
  /** The instance whose tile is highlighted / receives tool-scoped keys. */
  readonly focusedInstanceId: string | null;
  /** Tool keys the operator pinned to the palette. A PERSON fact, not a device one. */
  readonly pinnedToolKeys: readonly string[];
}

/**
 * Hard cap on simultaneously open tools.
 *
 * Six, because the right edge is one column: `DETAIL_STACK_RESIZE.minWidthPx`
 * is the width floor and a tile needs a readable height floor too, so past six
 * the rail stops being a tiling of tools and becomes a scrolling list of
 * collapsed headers — a different product. Opening past the cap closes the
 * oldest unfocused instance, exactly as the tab strip evicts leftmost-first.
 */
export const MAX_OPEN_TOOLS = 6;
