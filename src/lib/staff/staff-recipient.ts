/**
 * A staffer as `GET /api/auth/staff-picker` returns them — the shape every
 * "who should this go to" control reads.
 *
 * In `src/lib` and not beside the list component because it is DATA, and two
 * surfaces plus a headless hook consume it. A type that lives in a surface
 * component makes every other consumer import that component to name its own
 * payload, which the boundary law counts as a crossing.
 */
export interface StaffRecipient {
  id: number;
  name: string;
  role: string;
  color_hex: string;
}
