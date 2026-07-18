/**
 * Near-match packout proof shape for search / order-lookup rails.
 * Hydration hook was retired when SearchWorkspace stopped mounting the packout map;
 * the type remains the shared contract for optional `packout` / `packoutById` props.
 */

export interface NearMatchPackout {
  /** Count of packer photos on the order row (0 = none). */
  photoCount: number;
  /** Dock scanner (SHIP_CONFIRM) else packer name; null when neither is known. */
  packerName: string | null;
  /** Best available packout instant — scan-out if present, else packed. */
  timeAt: string | null;
  /** Which time `timeAt` represents, for the row label. */
  timeLabel: 'Scanned out' | 'Packed' | null;
}
