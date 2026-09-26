/** Escape user input destined for a LIKE / ILIKE pattern. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
