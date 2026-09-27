/**
 * Composer access mode — what the assistant may DO this turn.
 *
 *  - `full`: today's behaviour. Read tools, UI tools and the session write
 *    tools, each write under its own gating (propose_mutation's trust classes,
 *    link_manual_to_sku's confirmation).
 *  - `ask`: read-only. Only the GREEN read registry and the non-effecting UI
 *    verbs are advertised, and the dispatch chokepoint REFUSES every other
 *    name — hiding a tool is a hint to the model, the refusal is the gate.
 *
 * The mode is the operator's per-request choice (`accessMode` in the chat
 * body); it can only narrow what permissions already allow, never widen it.
 */

export const ASSISTANT_ACCESS_MODES = ['full', 'ask'] as const;
export type AssistantAccessMode = (typeof ASSISTANT_ACCESS_MODES)[number];

/** UI verbs with a side effect beyond the screen — a physical label print. */
const ASK_ONLY_BLOCKED_UI_TOOLS: Record<string, true> = { print_handling_unit_labels: true };

/** A browser-side UI verb the mode lets the model call. */
export function accessModeAllowsUiTool(mode: AssistantAccessMode | null | undefined, name: string): boolean {
  return mode !== 'ask' || !Object.hasOwn(ASK_ONLY_BLOCKED_UI_TOOLS, name);
}

/** The refusal a blocked call returns — worded for the model to relay verbatim. */
export function askOnlyRefusal(name: string): string {
  return `Refused: "${name}" makes a change, and this conversation is in Ask only mode (read-only). Nothing was changed. Tell the user plainly that the change was not made because Ask only is on, and that they can switch the composer to Full access to do it.`;
}

/** The system-prompt line for the mode; empty in full access. */
export function accessModeFragment(mode: AssistantAccessMode | null | undefined): string {
  if (mode !== 'ask') return '';
  return 'ACCESS MODE: Ask only. You can read and show data, but you cannot make any change — no writes, links, mutations or prints; those tools are not available and are refused if called. When the user asks for a change, say plainly that it was not made because the composer is in Ask only mode, and that switching to Full access lets you do it.';
}
