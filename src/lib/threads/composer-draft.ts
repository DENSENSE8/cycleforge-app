/**
 * The overwrite rule for `ThreadComposerBridge.setDraft`.
 *
 * ## The decision, and why it is EXPLICIT CONFIRM
 *
 * A support agent who has typed three sentences and then asks for a draft must
 * not lose them — there is no undo on a composer. Three rules were on the table:
 *
 * | Rule | Loses text | Gives what was asked for | Cost |
 * |---|---|---|---|
 * | refuse-and-tell | no | **no** — agent must clear the box and ask again | a dead-end |
 * | append below a rule | no | partly — leaves a spliced draft to edit | silent surprise |
 * | **explicit confirm** | **no** | **yes** | one click, and only when text exists |
 *
 * Explicit confirm is the only one that satisfies both columns, and it costs
 * nothing on the common path: an EMPTY composer applies straight through with
 * no dialog. The prompt is the house `requestConfirm` (`ConfirmDialogHost`) —
 * never a hand-rolled scrim.
 *
 * ## It never sends
 *
 * This seeds the editor and, optionally, the visibility toggle. It has no
 * access to submit and must never gain one. Setting the mode is not a
 * convenience: a draft addressed to the customer arriving with `Internal`
 * selected would be silently withheld from them, and the same draft the other
 * way round would email a note that was meant to be private.
 *
 * ## Whitespace-only is EMPTY
 *
 * `hasDraft` on the bridge is already `body.trim().length > 0`; using the same
 * test here keeps a composer holding a stray newline from raising a dialog
 * about text that is not there.
 */

export type ComposerDraftMode = 'public' | 'internal';

type SeedDraftOutcome = 'applied' | 'declined' | 'noop';

interface SeedComposerDraftInput {
  /** What the composer holds right now. */
  currentBody: string;
  /** The drafted text to insert. */
  text: string;
  /** Sets the public/internal toggle so a draft cannot land in the wrong lane. */
  mode?: ComposerDraftMode;
  applyBody: (text: string) => void;
  /** Omitted by a composer with no visibility toggle (entity threads have one). */
  applyMode?: (isPublic: boolean) => void;
  /**
   * Asks the operator before replacing their own text. Injected so this is
   * unit-testable with zero UI; production passes `requestConfirm`.
   */
  confirm: (message: { title: string; description: string; confirmLabel: string; cancelLabel: string }) => Promise<boolean>;
  /** Called only after the draft actually lands. */
  onApplied?: () => void;
}

export async function seedComposerDraft({
  currentBody,
  text,
  mode,
  applyBody,
  applyMode,
  confirm,
  onApplied,
}: SeedComposerDraftInput): Promise<SeedDraftOutcome> {
  const next = text.trim();
  // Nothing to insert. Silently doing nothing beats clearing the agent's box.
  if (!next) return 'noop';

  const hasDraft = currentBody.trim().length > 0;
  if (hasDraft && currentBody.trim() !== next) {
    const ok = await confirm({
      title: 'Replace your draft?',
      description:
        'Your composer already has text in it. Inserting this draft will replace what you typed.',
      confirmLabel: 'Replace',
      cancelLabel: 'Keep mine',
    });
    if (!ok) return 'declined';
  }

  applyBody(next);
  if (mode && applyMode) applyMode(mode === 'public');
  onApplied?.();
  return 'applied';
}
