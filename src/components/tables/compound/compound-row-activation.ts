/** Row ACTIVATION — the gesture that opens a row's record plane, derived ONCE from the surface's capabilities. */

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

/** The DOM props that make a compound row openable. */
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
