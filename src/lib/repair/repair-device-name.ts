/**
 * The DEVICE a repair-service listing title is about — the title with the
 * sales boilerplate cut out.
 *
 * Callers: `KioskHistoryRail` (the device line of every History row).
 * Affected API: none. Schemas: `repair_service.product_title`.
 *
 * ## Why a scan column needs this
 *
 * Measured 2026-09-23: 50 of the 68 walk-in rows History can show carry
 * `REPAIR SERVICE for` somewhere in their title, because the title IS the
 * storefront listing name. On a 320px rail the boilerplate spends the whole
 * line: `REPAIR SERVICE for Bose Wave Radio C…` — the model, the one word that
 * tells two rows apart, is the part that got truncated. The detail pane keeps
 * the full listing name on its item line; the rail prints the device.
 *
 * The phrase sits anywhere in the title, so this is a cut, not a prefix strip:
 *
 *   `REPAIR SERVICE for Bose Wave Radio CD Awrc-1G`      → `Bose Wave Radio CD Awrc-1G`
 *   `Bose Repair Service For Bose Lifestyle AV28 Media…` → `Bose Lifestyle AV28 Media…`
 *   `Bose Wave® music system REPAIR SERVICE for Model …` → `Bose Wave® music system Model …`
 *   `Bose 321 Series III Media Center  Repair Service`   → `Bose 321 Series III Media Center`
 *
 * The second case is why the seam is checked: the listing repeats the brand on
 * both sides of the phrase, and a plain cut would print `Bose Bose`.
 */

const REPAIR_SERVICE_PHRASE = /\brepair\s+service\b(?:\s+for\b)?/i;

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function repairDeviceName(title: string | null | undefined): string {
  const raw = collapse(title ?? '');
  const match = REPAIR_SERVICE_PHRASE.exec(raw);
  if (!match) return raw;

  const before = collapse(raw.slice(0, match.index));
  const after = collapse(raw.slice(match.index + match[0].length));
  if (!before || !after) return before || after || raw;

  const lastBefore = before.slice(before.lastIndexOf(' ') + 1);
  const [firstAfter = ''] = after.split(' ', 1);
  if (lastBefore.toLowerCase() === firstAfter.toLowerCase()) {
    return collapse(`${before} ${after.slice(firstAfter.length)}`);
  }
  return `${before} ${after}`;
}
