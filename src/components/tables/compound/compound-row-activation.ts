/**
 * Row ACTIVATION — the gesture that opens a row's record plane, derived ONCE
 * from the surface's capabilities.
 *
 * ## Why this is engine code
 *
 * `TableSurfaceBinding` already promised it: *"the HOST can read it at the
 * mount, which is what lets the gesture — click vs double-click — be derived
 * once from `capabilities.multiSelect` instead of hand-wired per row
 * component."* Until now `useCompoundSpreadsheet` only passed `onOpenRow`
 * down as an **Open item on the title hover menu**, so a read-only mount whose
 * declared record plane is `navigate` had a record plane an operator could not
 * reach by clicking the row. A find plane made that impossible to ignore:
 * clicking a result IS the interaction.
 *
 * Invariant 3 (`DESCRIPTOR_CARRIES_DATA_NOT_BEHAVIOR`) says that when a mount
 * needs behaviour the engine lacks, the ENGINE gains it for everyone. So this
 * is not a search-plane click handler; it is the compound row's activation
 * contract, and every family that passes `onOpenRow` gets it.
 *
 * ## The two gestures
 *
 * - `multiSelect: false` — a single CLICK activates. Nothing else on the row
 *   claims a plain click, because there is no selection to toggle.
 * - `multiSelect: true` — selection owns the single click (and shift-click
 *   owns the range walk), so activation is the DOUBLE click. Silently making
 *   one click both select and navigate is how a bulk desk sends an operator to
 *   another page mid-selection.
 *
 * ## Why a click has to be filtered
 *
 * A compound row is full of real controls: copy chips, the title link, the
 * state trail, the hover menu, the trailing verbs. Their clicks bubble, so an
 * unfiltered row handler would fire "open this record" every time somebody
 * copied a tracking number. {@link isCompoundRowActivationTarget} is the one
 * place that is decided — a predicate, not a `stopPropagation()` scattered
 * over every cell that happens to be interactive today.
 */

/** Controls whose own click must never also activate the row. */
const INTERACTIVE_SELECTOR =
  'a,button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="menuitem"],[role="checkbox"],[role="option"],[contenteditable="true"]';

/**
 * Did this event land on the row itself rather than on a control inside it?
 *
 * Takes the raw target so the caller does not have to know about `Element` vs
 * `EventTarget`, and so this stays a pure predicate a unit test can drive.
 */
export function isCompoundRowActivationTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(INTERACTIVE_SELECTOR) === null;
}

/** The keys that activate a focused row — the platform's two activation keys. */
export function isCompoundRowActivationKey(key: string): boolean {
  return key === 'Enter' || key === ' ' || key === 'Spacebar';
}

export interface CompoundRowActivation {
  onClick?: (event: { target: EventTarget | null }) => void;
  onDoubleClick?: (event: { target: EventTarget | null }) => void;
  onKeyDown?: (event: {
    key: string;
    target: EventTarget | null;
    currentTarget: EventTarget | null;
    preventDefault: () => void;
  }) => void;
  tabIndex?: number;
  'data-row-activate'?: 'click' | 'dblclick';
}

/**
 * The DOM props that make a compound row openable. Returns `{}` when the
 * family declared no `onOpenRow` — a row with no record plane stays inert and
 * stays out of the tab order, which is the honest answer for a surface that
 * has nowhere to send anybody.
 */
export function compoundRowActivationProps(opts: {
  onActivate?: () => void;
  multiSelect: boolean;
}): CompoundRowActivation {
  const { onActivate, multiSelect } = opts;
  if (!onActivate) return {};

  const fromPointer = (event: { target: EventTarget | null }) => {
    if (!isCompoundRowActivationTarget(event.target)) return;
    onActivate();
  };

  return {
    ...(multiSelect ? { onDoubleClick: fromPointer } : { onClick: fromPointer }),
    onKeyDown: (event) => {
      if (!isCompoundRowActivationKey(event.key)) return;
      // Only the ROW's own focus activates. A key pressed inside a cell's
      // control belongs to that control — Space in a search box is a space.
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      onActivate();
    },
    tabIndex: 0,
    'data-row-activate': multiSelect ? 'dblclick' : 'click',
  };
}
