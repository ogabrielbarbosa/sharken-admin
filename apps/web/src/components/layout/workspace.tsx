'use client';

import { createContext, useContext, type ReactNode } from 'react';

const WorkspaceContext = createContext<string | null>(null);

/** Workspace em uso, para o Realtime filtrar só as linhas dele. */
export function WorkspaceProvider({ id, children }: { id: string; children: ReactNode }) {
  return <WorkspaceContext.Provider value={id}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceId(): string | null {
  return useContext(WorkspaceContext);
}
