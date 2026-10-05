import { MobileV2UnboxNext } from '@/components/mobile/v2/receiving/MobileV2UnboxNext';

/** `/m/unbox` — the unbox-next queue: urgent first, then oldest door time first. */
export default function MobileUnboxNextPage() {
  return <MobileV2UnboxNext />;
}
