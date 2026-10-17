import type { Account } from '@/services';
import { createContext, useContext } from 'react';
export type ManagementRuntime = {
  current: Account | null;
  siteName: string;
  onSaved: (value: { siteName: string }) => void;
};
export const ManagementContext = createContext<ManagementRuntime | null>(null);
export function useManagement() {
  const context = useContext(ManagementContext);
  if (!context) throw new Error('ManagementProvider is required');
  return context;
}
