import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, tokenStorage } from '../api/client';

export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_online: boolean;
  last_seen: string | null;
  created_at: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      login: async (username, password) => {
        const { data } = await api.post('/auth/login', { username, password });
        tokenStorage.set(data.access_token, data.refresh_token);
        set({ accessToken: data.access_token, isAuthenticated: true });
        await get().fetchMe();
      },

      register: async (username, email, password) => {
        const { data } = await api.post('/auth/register', { username, email, password });
        tokenStorage.set(data.access_token, data.refresh_token);
        set({ accessToken: data.access_token, isAuthenticated: true });
        await get().fetchMe();
      },

      logout: () => {
        tokenStorage.clear();
        set({ user: null, accessToken: null, isAuthenticated: false });
      },

      fetchMe: async () => {
        const { data } = await api.get('/auth/me');
        set({ user: data, isAuthenticated: true });
      },

      updateProfile: async (updates) => {
        const { data } = await api.patch('/users/me', updates);
        set({ user: data });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
