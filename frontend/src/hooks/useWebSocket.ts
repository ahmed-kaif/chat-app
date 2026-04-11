import { useEffect, useRef, useCallback } from 'react';
import { tokenStorage } from '../api/client';
import { useMessageStore } from '../store/messageStore';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export function useWebSocket(roomId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldReconnectRef = useRef(true);
  const addMessage = useMessageStore((s) => s.addMessage);
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const deleteMessage = useMessageStore((s) => s.deleteMessage);
  const setTyping = useMessageStore((s) => s.setTyping);

  const connect = useCallback(() => {
    if (!roomId) return;
    const token = tokenStorage.getAccess();
    if (!token) return;

    shouldReconnectRef.current = true;
    const url = `${WS_URL}/ws/${roomId}?token=${token}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[WS] Connected to room ${roomId}`);
    };

    ws.onmessage = (e) => {
      console.log('[WS] Received data:', e.data);
      try {
        const { type, payload } = JSON.parse(e.data);
        if (payload?.room_id && payload.room_id !== roomId) {
          return;
        }
        switch (type) {
          case 'message.new':
            addMessage(roomId, {
              id: payload.id,
              room_id: payload.room_id,
              sender_id: payload.sender_id,
              content: payload.content,
              type: payload.type,
              reply_to_id: payload.reply_to_id,
              created_at: payload.created_at,
              edited_at: null,
              deleted_at: null,
              sender: {
                id: payload.sender_id,
                username: payload.sender_username,
                display_name: payload.sender_display_name,
                avatar_url: payload.sender_avatar_url,
              },
              attachments: payload.attachments || [],
              read_count: 0,
            });
            break;
          case 'message.updated':
            updateMessage(roomId, payload.id, {
              content: payload.content,
              edited_at: payload.edited_at,
            });
            break;
          case 'message.deleted':
            deleteMessage(roomId, payload.id);
            break;
          case 'typing.indicator':
            if (payload.room_id === roomId) {
              setTyping(roomId, payload.user_id, payload.is_typing);
            }
            break;
          case 'read.receipt':
            updateMessage(roomId, payload.message_id, { read_count: 1 });
            break;
          default:
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onerror = (e) => console.error('[WS] Error:', e);

    ws.onclose = () => {
      if (!shouldReconnectRef.current) {
        return;
      }
      console.log('[WS] Disconnected, reconnecting in 3s...');
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => connect(), 3000);
    };
  }, [roomId, addMessage, updateMessage, deleteMessage, setTyping]);

  useEffect(() => {
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const send = useCallback((event: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    }
  }, []);

  const sendMessage = useCallback(
    (content: string, replyToId?: string) => {
      send({
        type: 'message.send',
        payload: { content, reply_to_id: replyToId || null },
        timestamp: new Date().toISOString(),
      });
    },
    [send]
  );

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      send({
        type: isTyping ? 'typing.start' : 'typing.stop',
        payload: {},
        timestamp: new Date().toISOString(),
      });
    },
    [send]
  );

  const sendRead = useCallback(
    (messageId: string) => {
      send({
        type: 'message.read',
        payload: { message_id: messageId },
        timestamp: new Date().toISOString(),
      });
    },
    [send]
  );

  return { sendMessage, sendTyping, sendRead };
}
