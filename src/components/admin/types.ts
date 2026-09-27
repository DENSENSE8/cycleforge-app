export interface Staff {
  id: number;
  name: string;
  role: string;
  employee_id: string | null;
  active: boolean;
  color_hex: string;
  /** Profile photo id (`staff.avatar_photo_id`); null ⇒ colour + initials. */
  avatar_photo_id?: number | null;
  default_home_path: string | null;
  created_at?: string | null;
}

export type StaffAvailabilityRuleType = 'weekday_allowed' | 'date_block' | 'date_allow';

export interface StaffAvailabilityRule {
  id: number;
  staffId: number;
  ruleType: StaffAvailabilityRuleType;
  dayOfWeek: number | null;
  isAllowed: boolean;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  priority: number;
  reason: string | null;
  createdByStaffId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}
