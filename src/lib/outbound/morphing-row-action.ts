/** CYC-82 roster for the left-gutter morphing action menu. */

import { PACKER_IDS } from '@/utils/staff';

const MORPHING_PACKER_NAMES = ['Tuan', 'Thuy'] as const;
const MORPHING_PICKER_NAMES = ['Sang', 'Ajax', 'Lien', 'Michael'] as const;

type MorphingActionLane = 'picker' | 'packer';

type MorphingStaffRow = {
  id: number;
  name: string;
  /** Present when the row is a live `StaffMember`; used by stage-lane faces. */
  role?: string | null;
  roles?: readonly string[] | null;
};

function normName(name: string): string {
  return name.trim().toLowerCase();
}

const PICKER_ALLOW = new Set(MORPHING_PICKER_NAMES.map((n) => n.toLowerCase()));
const PACKER_ALLOW = new Set(MORPHING_PACKER_NAMES.map((n) => n.toLowerCase()));

export function morphingRoster<T extends MorphingStaffRow>(
  staff: readonly T[],
  lane: MorphingActionLane,
): T[] {
  const allow = lane === 'packer' ? PACKER_ALLOW : PICKER_ALLOW;
  const packerIds = new Set(PACKER_IDS);
  return staff
    .filter((row) => {
      if (!Number.isFinite(row.id) || row.id <= 0) return false;
      const name = normName(row.name);
      if (!name || name === 'kai') return false;
      if (!allow.has(name)) return false;
      if (lane === 'packer' && !packerIds.has(row.id)) return false;
      return true;
    })
    .slice(0, 5);
}

export function morphingHotkeyForIndex(index: number): string | null {
  if (index < 0 || index > 4) return null;
  return String(index + 1);
}

export function morphingFilterRoster<T extends MorphingStaffRow>(
  roster: readonly T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...roster];
  return roster.filter((row) => row.name.toLowerCase().includes(q));
}

function positiveStaffId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * One listing rule writes PICK + PACK. The lane just picked is the source of
 * truth; the other slot keeps the row's assignee, or repeats this staffer so
 * the rule can exist before both faces are filled.
 */
export function morphingListingRulePair(args: {
  lane: MorphingActionLane;
  staffId: number;
  pickerId: number | null | undefined;
  packerId: number | null | undefined;
}): { techId: number; packerId: number } {
  const otherPicker = positiveStaffId(args.pickerId);
  const otherPacker = positiveStaffId(args.packerId);
  if (args.lane === 'packer') {
    return { techId: otherPicker ?? args.staffId, packerId: args.staffId };
  }
  return { techId: args.staffId, packerId: otherPacker ?? args.staffId };
}

export function pairItemNumberOnce(
  itemNumber: string | null | undefined,
): string | null {
  const value = String(itemNumber ?? '').trim();
  return value.length > 0 ? value : null;
}

/** Phone app routes (`/m`, `/m/…`). Desktop desks never count as mobile. */
export function isMorphingMobileUrl(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === '/m' || pathname.startsWith('/m/');
}

/** Count (or legacy scalar) so the Notes verb can show it already has a trail. */
export function morphingNotesHint(record: {
  note_count?: number | null;
  notes?: string | null;
}): string | null {
  const count = Number(record.note_count ?? 0);
  if (Number.isFinite(count) && count > 0) {
    return count === 1 ? '1 note' : `${count} notes`;
  }
  const legacy = String(record.notes ?? '').trim();
  return legacy.length > 0 ? 'legacy note' : null;
}

/** Current picker / packer name on the row, if one is assigned. */
export function morphingAssignedName(
  record: {
    picker_name?: string | null;
    picked_by_name?: string | null;
    packer_name?: string | null;
    packed_by_name?: string | null;
  },
  lane: MorphingActionLane,
): string | null {
  const raw =
    lane === 'packer'
      ? record.packer_name || record.packed_by_name
      : record.picker_name || record.picked_by_name;
  const name = String(raw ?? '').trim();
  return name.length > 0 ? name : null;
}

/** CYC-82 gutter click — the rule lives in the shared row plane. */
export {
  rowPlaneGutterClick as morphingGutterClick,
  applyRowPlaneGutterClick as applyMorphingGutterClick,
} from '@/lib/tables/row-plane';
