'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

export interface HeaderCenterTask {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  /** Icon colour class. */
  tone?: string;
  /** Word colour class; defaults to the default ink. */
  labelTone?: string;
}

export interface HeaderCenterTaskRegistration {
  owner: string;
  ariaLabel: string;
  activeId: string;
  tasks: readonly HeaderCenterTask[];
  onSelect: (id: string) => void;
}

interface HeaderContextType {
  centerTasks: HeaderCenterTaskRegistration | null;
  registerCenterTasks: (registration: HeaderCenterTaskRegistration) => () => void;
}

const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [centerTasks, setCenterTasks] =
    useState<HeaderCenterTaskRegistration | null>(null);

  const registerCenterTasks = useCallback(
    (registration: HeaderCenterTaskRegistration) => {
      setCenterTasks(registration);
      return () => {
        setCenterTasks((current) =>
          current?.owner === registration.owner ? null : current,
        );
      };
    },
    [],
  );

  const value = useMemo(
    () => ({ centerTasks, registerCenterTasks }),
    [centerTasks, registerCenterTasks],
  );

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}

export function useHeader() {
  const context = useContext(HeaderContext);
  if (context === undefined) {
    throw new Error('useHeader must be used within a HeaderProvider');
  }
  return context;
}

/** Register record-local tasks in the global header for this mounted surface. */
export function useHeaderCenterTasks(
  registration: HeaderCenterTaskRegistration | null,
): void {
  const { registerCenterTasks } = useHeader();
  useEffect(() => {
    if (!registration) return undefined;
    return registerCenterTasks(registration);
  }, [registerCenterTasks, registration]);
}
