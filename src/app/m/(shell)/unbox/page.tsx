import { MobileV2UnboxNext } from '@/components/mobile/v2/receiving/MobileV2UnboxNext';

/** `/m/unbox` — the unbox-next queue: most urgent shelf first, oldest first within a shelf. */
export default function MobileUnboxNextPage() {
  return <MobileV2UnboxNext />;
}
