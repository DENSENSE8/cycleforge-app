/** Canonical decimal text for a money input backed by integer cents. */
export function centsToInputText(cents: number | null | undefined): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

/** Integer cents from money-input text; blank, negative, or non-numeric text reads as null. */
export function inputTextToCents(text: string): number | null {
  const trimmed = text.trim();
  const amount = Number(trimmed);
  return trimmed && Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}
