/** A room's zone letter in its row's icon well, or an amber "?" when the room has no letter yet. */
export function ZoneLetterTile({ letter }: { letter: string | undefined }) {
  return letter ? (
    <span className="font-mono text-base font-semibold text-blue-700 group-active:text-mode-ink">{letter}</span>
  ) : (
    <span aria-label="No zone letter" className="font-mono text-base font-semibold text-amber-700 group-active:text-mode-ink">
      ?
    </span>
  );
}
