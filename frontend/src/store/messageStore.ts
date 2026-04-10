import { create } from 'zustand';
import { api } from '../api/client';

export interface Attachment {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  thumbnail_url: string | null;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string | null;
  content: string | null;
  type: 'text' | 'image' | 'file' | 'system';
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender?: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  attachments: Attachment[];
  read_count: number;
  // Real-time fields added by WS
  sender_username?: string;
  sender_display_name?: string | null;
  sender_avatar_url?: string | null;
}

interface MessageState {
  // room_id -> messages
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>; // room_id -> user_ids
  isLoading: Record<string, boolean>;

  fetchMessages: (roomId: string, before?: string) => Promise<void>;
  addMessage: (roomId: string, message: Message) => void;
  updateMessage: (roomId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (roomId: string, messageId: string) => void;
  setTyping: (roomId: string, userId: string, isTyping: boolean) => void;
  markRead: (roomId: string, messageId: string) => Promise<void>;
}

export const useMessageStore = create<MessageState>()((set) => ({
  messages: {},
  typingUsers: {},
  isLoading: {},

  fetchMessages: async (roomId, before) => {
    set((s) => ({ isLoading: { ...s.isLoading, [roomId]: true } }));
    try {
      const params: Record<string, string> = { limit: '50' };
      if (before) params.before = before;
      const { data } = await api.get<Message[]>(`/rooms/${roomId}/messages`, { params });
      set((s) => ({
        messages: {
          ...s.messages,
          [roomId]: before
            ? [...data, ...(s.messages[roomId] || [])]
            : data,
        },
      }));
    } finally {
      set((s) => ({ isLoading: { ...s.isLoading, [roomId]: false } }));
    }
  },

  addMessage: (roomId, message) =>
    set((s) => {
      const existing = s.messages[roomId] || [];
      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) return s;
      return { messages: { ...s.messages, [roomId]: [...existing, message] } };
    }),

  updateMessage: (roomId, messageId, updates) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: (s.messages[roomId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    })),

  deleteMessage: (roomId, messageId) =>
    set((s) => ({
      messages: {
        ...s.messages,
        [roomId]: (s.messages[roomId] || []).map((m) =>
          m.id === messageId ? { ...m, deleted_at: new Date().toISOString() } : m
        ),
      },
    })),

  setTyping: (roomId, userId, isTyping) =>
    set((s) => {
      const current = s.typingUsers[roomId] || [];
      const updated = isTyping
        ? [...new Set([...current, userId])]
        : current.filter((id) => id !== userId);
      return { typingUsers: { ...s.typingUsers, [roomId]: updated } };
    }),

  markRead: async (_roomId, messageId) => {
    try {
      await api.post(`/messages/${messageId}/read`);
    } catch {
      // Ignore errors silently
    }
  },
}));
