import { MobileOrderExceptions } from '@/components/mobile/outbound/MobileOrderExceptions';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export default function MobileOrderExceptionsPage() {
  return (
    <ModeRegion mode="triage" className="contents">
      <MobileOrderExceptions />
    </ModeRegion>
  );
}
