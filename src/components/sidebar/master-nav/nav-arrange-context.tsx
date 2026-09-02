'use client';

/**
 * Org nav arrange — MasterNav publishes child (desk-tab) order + catalog icons
 * through `/api/nav`. Gated `studio.manage` (same as PUT). Not a second tab
 * strip: daily navigation stays DeskPageChrome; this is the authoring mode.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { fetchWithStepUp } from '@/components/auth/StepUpModal';
import { useStepUp } from '@/components/providers/StepUpProvider';
import { orgNavQuery, useOrgNavDefinition } from '@/hooks/useOrgNavItems';
import {
  upsertChildIcon,
  upsertChildOrder,
  type NavDefinition,
} from '@/lib/nav/org-nav';
import { toast } from '@/lib/toast';

interface NavArrangeContextValue {
  canArrange: boolean;
  arranging: boolean;
  setArranging: (next: boolean) => void;
  definition: NavDefinition | null;
  publishChildOrder: (pageId: string, orderedIds: readonly string[]) => Promise<void>;
  publishChildIcon: (pageId: string, childId: string, icon: string) => Promise<void>;
}

const NavArrangeContext = createContext<NavArrangeContextValue | null>(null);

export function NavArrangeProvider({
  canArrange,
  children,
}: {
  canArrange: boolean;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const requestStepUp = useStepUp();
  const definition = useOrgNavDefinition();
  const [arranging, setArranging] = useState(false);

  const currentDefinition = useCallback((): NavDefinition | null => {
    return queryClient.getQueryData(orgNavQuery().queryKey) ?? definition;
  }, [definition, queryClient]);

  const write = useCallback(
    async (next: NavDefinition) => {
      queryClient.setQueryData(orgNavQuery().queryKey, next);
      const res = await fetchWithStepUp(
        '/api/nav',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        },
        requestStepUp,
      );
      if (!res.ok) {
        await queryClient.invalidateQueries({ queryKey: orgNavQuery().queryKey });
        toast.error('Could not publish nav. Studio access is required.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: orgNavQuery().queryKey });
    },
    [queryClient, requestStepUp],
  );

  const publishChildOrder = useCallback(
    async (pageId: string, orderedIds: readonly string[]) => {
      await write(upsertChildOrder(currentDefinition(), pageId, orderedIds));
    },
    [currentDefinition, write],
  );

  const publishChildIcon = useCallback(
    async (pageId: string, childId: string, icon: string) => {
      await write(upsertChildIcon(currentDefinition(), pageId, childId, icon));
    },
    [currentDefinition, write],
  );

  const value = useMemo<NavArrangeContextValue>(
    () => ({
      canArrange,
      arranging: canArrange && arranging,
      setArranging,
      definition,
      publishChildOrder,
      publishChildIcon,
    }),
    [canArrange, arranging, definition, publishChildOrder, publishChildIcon],
  );

  return <NavArrangeContext.Provider value={value}>{children}</NavArrangeContext.Provider>;
}

export function useNavArrange(): NavArrangeContextValue {
  const ctx = useContext(NavArrangeContext);
  if (!ctx) {
    return {
      canArrange: false,
      arranging: false,
      setArranging: () => undefined,
      definition: null,
      publishChildOrder: async () => undefined,
      publishChildIcon: async () => undefined,
    };
  }
  return ctx;
}
