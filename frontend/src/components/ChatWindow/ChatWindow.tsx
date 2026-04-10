import { useEffect, useRef, useState, useCallback } from 'react';
import { useMessageStore } from '../../store/messageStore';
import { useAuthStore } from '../../store/authStore';
import type { Room } from '../../store/roomStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import MessageBubble from '../MessageBubble/MessageBubble';
import { Send, MoreVertical } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChatWindowProps {
  room: Room;
}

function getRoomDisplayName(room: Room, myId: string): string {
  if (room.name) return room.name;
  if (room.type === 'dm') {
    const other = room.members?.find((m) => m.user_id !== myId);
    return other?.user?.display_name || other?.user?.username || 'Unknown';
  }
  if (room.type === 'self') return '📌 Saved Notes';
  return 'Unnamed Room';
}

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return `avatar-${Math.abs(hash) % 6}`;
}

function getInitials(name: string): string {
  return (name || '?').slice(0, 2).toUpperCase();
}

export default function ChatWindow({ room }: ChatWindowProps) {
  const user = useAuthStore((s) => s.user);
  const messages = useMessageStore((s) => s.messages[room.id] || []);
  const typingUsers = useMessageStore((s) => s.typingUsers[room.id] || []);
  const isLoading = useMessageStore((s) => s.isLoading[room.id] ?? false);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);

  const [inputText, setInputText] = useState('');
  const [typingSent, setTypingSent] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { sendMessage, sendTyping } = useWebSocket(room.id);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchMessages(room.id).catch((err) => {
      console.error('[ChatWindow] fetchMessages failed:', err);
      toast.error('Could not load messages. Please try again.');
    });
  }, [room.id, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';

    if (!typingSent) {
      sendTyping(true);
      setTypingSent(true);
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTyping(false);
      setTypingSent(false);
    }, 2000);
  };

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    sendMessage(text);
    setInputText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sendTyping(false);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setTypingSent(false);
  }, [inputText, sendMessage, sendTyping]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const displayName = getRoomDisplayName(room, user?.id || '');
  const avatarClass = getAvatarColor(room.id);

  const dmPartner = room.type === 'dm'
    ? room.members?.find((m) => m.user_id !== user?.id)
    : null;
  const avatarUrl = dmPartner?.user?.avatar_url || room.avatar_url || null;
  const isOnline = dmPartner?.user?.is_online ?? false;

  const otherTypingIds = typingUsers.filter((id) => id !== user?.id);
  const typingText = otherTypingIds.length > 0
    ? otherTypingIds.length === 1
      ? `${room.members?.find((m) => m.user_id === otherTypingIds[0])?.user?.username || 'Someone'} is typing...`
      : 'Several people are typing...'
    : '';

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-header">
        <div className={`room-avatar ${avatarClass}`} style={{ width: 38, height: 38, fontSize: 14, position: 'relative' }}>
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName} className="room-avatar-img" />
            : getInitials(displayName)}
          {isOnline && <div className="online-dot" />}
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{displayName}</div>
          <div className="chat-header-status">
            {room.type === 'dm'
              ? isOnline ? '🟢 Online' : 'Offline'
              : `${room.members?.length ?? 0} members`}
          </div>
        </div>
        <button className="btn-icon"><MoreVertical size={18} /></button>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {isLoading ? (
          <div className="loader"><div className="spinner" /></div>
        ) : messages.length === 0 ? (
          <div className="messages-empty">
            <span className="messages-empty-icon">💬</span>
            <p>No messages yet. Say hello!</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMine = msg.sender_id === user?.id;
            const prevMsg = messages[i - 1];
            const sameSender = prevMsg && prevMsg.sender_id === msg.sender_id;
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                isMine={isMine}
                showAvatar={!sameSender}
                showSenderName={!isMine && !sameSender && room.type === 'group'}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {typingText && (
        <div className="typing-indicator">
          <div className="typing-dots">
            <div className="typing-dot" />
            <div className="typing-dot" />
            <div className="typing-dot" />
          </div>
          <span>{typingText}</span>
        </div>
      )}

      {/* Input */}
      <div className="message-input-area">
        <div className="message-input-row">
          <textarea
            ref={textareaRef}
            className="message-textarea"
            placeholder={`Message ${displayName}...`}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!inputText.trim()}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
