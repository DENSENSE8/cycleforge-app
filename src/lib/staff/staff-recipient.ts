/** A staffer as `GET /api/auth/staff-picker` returns them — the shape every "who should this go to" control reads. */
export interface StaffRecipient {
  id: number;
  name: string;
  role: string;
  color_hex: string;
}
