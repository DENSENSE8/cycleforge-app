/** Editable-focus predicate — SoT for wedge-safe / Esc / chord handlers. */

export function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"]'),
  );
}

/**
 * Same predicate against `document.activeElement` when the event target is
 * missing (leader-chord / capture listeners that read focus, not the event).
 */
export function isEditableActiveElement(
  node: EventTarget | null = null,
): boolean {
  if (node instanceof HTMLElement) return isEditableKeyTarget(node);
  if (typeof document === 'undefined') return false;
  return isEditableKeyTarget(document.activeElement);
}
