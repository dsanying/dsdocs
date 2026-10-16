import { create } from 'zustand';

export interface AppUser {
  name: string;
  avatar?: string;
  userid?: string;
  email?: string;
  access?: string;
}
interface AppState {
  currentUser: AppUser | null;
  setCurrentUser: (user: AppUser | null) => void;
}
/** 由目标应用在认证成功后注入真实身份；本模板不请求或模拟用户。 */
export const useAppStore = create<AppState>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
}));
