import { create } from "zustand";

interface AuthState {
  isInitialized: boolean;
  isAuthenticated: boolean;
  userId: string | null;
  accessToken: string | null;
  permissions: string[];
  roles: string[];
  setInitialized: () => void;
  setAuthenticated: (userId: string, accessToken?: string) => void;
  setUnauthenticated: () => void;
  setAccessToken: (token: string | null) => void;
  setPermissionsAndRoles: (permissions: string[], roles: string[]) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isInitialized: false,
  isAuthenticated: false,
  userId: null,
  accessToken: null,
  permissions: [],
  roles: [],
  setInitialized: () => set({ isInitialized: true }),
  setAuthenticated: (userId: string, accessToken?: string) =>
    set({ isAuthenticated: true, userId, accessToken: accessToken || null }),
  setUnauthenticated: () =>
    set({ isAuthenticated: false, userId: null, accessToken: null, permissions: [], roles: [] }),
  setAccessToken: (token: string | null) => set({ accessToken: token }),
  setPermissionsAndRoles: (permissions: string[], roles: string[]) =>
    set({ permissions, roles }),
  clear: () =>
    set({ isAuthenticated: false, userId: null, accessToken: null, permissions: [], roles: [] }),
}));
