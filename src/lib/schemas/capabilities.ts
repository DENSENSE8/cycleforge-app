/** Request bodies for `/api/capabilities` (SIMPLE-FIRST). */

import { z } from 'zod';

export const CapabilitySwitchBody = z.object({
  capabilityId: z.string().trim().min(1).max(60),
  enable: z.boolean(),
});
