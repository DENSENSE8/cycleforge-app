import type { ReactNode } from 'react';

/** One thing a station actually read to write a stamp. */
export type MilestoneScan =
  | { kind: 'serial'; value: string }
  | { kind: 'tracking'; value: string; carrier?: string | null }
  /** No identifier on the record — name the mechanism instead of inventing one. */
  | { kind: 'note'; value: string };

export interface Milestone {
  key: string;
  /**
   * Past tense — a completed milestone is a past event. eBay says "Shipped",
   * not "Shipping".
   */
  label: string;
  /**
   * The glyph of the station this stage belongs to
   * (`lib/nav/station-nav-icons.ts`), so a stage names itself with the same
   * mark the operator clicks in the nav to get there.
   */
  icon: ReactNode;
  /** The stamp. Null ⇒ this has not happened. */
  at: string | null;
  /** The PERSON who did it. */
  actor?: { staffId: number | null; name: string } | null;
  /** Non-person qualifier for the actor line ("Shelf set", "At receive"). */
  detail?: string | null;
  /** What the station read, in order. */
  scans?: MilestoneScan[];
  /** The queue this record waits in until the stage is stamped, named the way the operator navigates to it ("Ready to pack") — never the null… */
  readyLabel: string;
}
