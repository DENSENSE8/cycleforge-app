'use client';

/**
 * Mobile receiving feed — `/m/receiving`. THE phone inbound surface.
 *
 * This is the shared {@link MobileReceivingList} — the same feed the desktop
 * `/receiving` "Unboxing" rail uses — and nothing else.
 *
 * It used to branch on `?mode=`: `local-pickup` and `repair` each rendered a
 * "starter" card whose whole content was an instruction to go and use a
 * desktop station ("Log a repair from the desktop walk-in station"). That is
 * the refusal `docs/mobile-first/SURFACE_LAW.md` §10 names outright — a phone
 * surface that cannot complete its verb is not a surface, it is a sign — and
 * operator 2026-09-15 removed the rows that reached them: *"remove the inbound
 * walk-in, consult, repair and unbox — just keep the photo feed only."*
 *
 * So there is no `mode` prop. If local pickup or repair earn a phone surface,
 * they get a real one under `/m` with a completable job, not a branch here.
 *
 * The header lives in the shell; the body runs to the bottom (shell `pb-safe`).
 */

import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { MobileReceivingList } from '@/components/mobile/receiving/MobileReceivingList';

export default function RedesignedMobileReceivingLive() {
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden ${TOKENS.colors.background}`}>
      <div className="min-h-0 flex-1 overflow-hidden">
        <MobileReceivingList limit={25} />
      </div>
    </div>
  );
}
