import { SessionSurface } from '@/components/session/SessionSurface';
import { PRODUCT_NAME } from '@/lib/branding/constants';
import { AiChatNavBridge } from './AiChatNavBridge';

export const metadata = { title: `Chat · ${PRODUCT_NAME}` };

/**
 * /ai-chat — the ONE assistant surface (sidebar "Chat"), built on the AI design
 * system: a centred fixed-width conversation column, and a right panel only
 * when something in it is opened. Streams from `/api/assistant/chat`. Its
 * sidebar panel (threads · New chat) is declared in `NAV_PAGE_DECLS['ai-chat']`;
 * `AiChatNavBridge` feeds it the New chat verb and the live thread.
 */
export default function AiChatPage() {
  return (
    <div className="h-full w-full overflow-hidden">
      <AiChatNavBridge />
      <SessionSurface />
    </div>
  );
}
