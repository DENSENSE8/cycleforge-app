import { SessionSurface } from '@/components/session/SessionSurface';
import { PRODUCT_NAME } from '@/lib/branding/constants';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export const metadata = { title: `Chat · ${PRODUCT_NAME}` };

/**
 * /ai-chat — the ONE assistant surface (sidebar "Chat"), built on the AI design
 * system: a centred fixed-width conversation column, and a right panel only
 * when something in it is opened. Streams from `/api/assistant/chat`.
 */
export default function AiChatPage() {
  return (
    <ModeRegion mode="assistant" className="h-full w-full overflow-hidden">
      <SessionSurface />
    </ModeRegion>
  );
}
