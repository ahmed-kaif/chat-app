import { create } from 'zustand';
import { api } from '../api/client';

export interface RoomMember {
  user_id: string;
  room_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  user?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean;
  };
}

export interface Room {
  id: string;
  type: 'dm' | 'group' | 'channel' | 'self';
  name: string | null;
  description: string | null;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  members: RoomMember[];
}

interface RoomState {
  rooms: Room[];
  activeRoomId: string | null;
  isLoading: boolean;
  fetchRooms: () => Promise<void>;
  setActiveRoom: (id: string) => void;
  createDM: (targetUserId: string) => Promise<Room>;
  createGroup: (name: string, memberIds: string[]) => Promise<Room>;
  addRoom: (room: Room) => void;
  updateRoom: (roomId: string, updates: Partial<Room>) => void;
}

export const useRoomStore = create<RoomState>()((set) => ({
  rooms: [],
  activeRoomId: null,
  isLoading: false,

  fetchRooms: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get<Room[]>('/rooms');
      set({ rooms: data });
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveRoom: (id) => set({ activeRoomId: id }),

  createDM: async (targetUserId) => {
    const { data } = await api.post<Room>('/rooms/dm', { target_user_id: targetUserId });
    set((s) => ({
      rooms: s.rooms.some((r) => r.id === data.id) ? s.rooms : [data, ...s.rooms],
    }));
    return data;
  },

  createGroup: async (name, memberIds) => {
    const { data } = await api.post<Room>('/rooms', {
      type: 'group',
      name,
      member_ids: memberIds,
    });
    set((s) => ({ rooms: [data, ...s.rooms] }));
    return data;
  },

  addRoom: (room) =>
    set((s) => ({
      rooms: s.rooms.some((r) => r.id === room.id) ? s.rooms : [room, ...s.rooms],
    })),

  updateRoom: (roomId, updates) =>
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === roomId ? { ...r, ...updates } : r)),
    })),
}));
