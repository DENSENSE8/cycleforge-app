/** The printable one-letter warehouse zones, in automatic assignment order. */
export const ROOM_ZONE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') as readonly string[];

/** First unused zone letter; null means the one-letter namespace is exhausted. */
export function nextAvailableRoomZoneLetter(used: Iterable<string | null | undefined>): string | null {
  const occupied = new Set(
    [...used]
      .map((letter) => String(letter ?? '').trim().toUpperCase())
      .filter((letter) => /^[A-Z]$/.test(letter)),
  );
  return ROOM_ZONE_LETTERS.find((letter) => !occupied.has(letter)) ?? null;
}
