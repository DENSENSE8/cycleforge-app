import AiChatWorkspace from '@/components/ai/AiChatWorkspace';
import { PRODUCT_NAME } from '@/lib/branding/constants';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

export const metadata = { title: `Chat · ${PRODUCT_NAME}` };

/**
 * /ai-chat workspace. The live streaming assistant is docked in this main pane
 * (right side); the capabilities and example prompts live in the contextual
 * sidebar (AiChatSidebarPanel). Light theme throughout.
 */
export default function AiChatPage() {
  return (
    <ModeRegion mode="assistant" className="h-full w-full overflow-hidden bg-surface-card">
      <AiChatWorkspace />
    </ModeRegion>
  );
}
