import { format, isToday, isYesterday } from 'date-fns';
import type { Message } from '../../store/messageStore';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showAvatar: boolean;
  showSenderName: boolean;
}

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `avatar-${Math.abs(hash) % 6}`;
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
  return format(d, 'MMM d, HH:mm');
}

export default function MessageBubble({
  message,
  isMine,
  showAvatar,
  showSenderName,
}: MessageBubbleProps) {
  const isDeleted = !!message.deleted_at;
  const senderName =
    message.sender?.display_name || message.sender?.username || message.sender_username || 'Unknown';
  const avatarClass = getAvatarColor(message.sender_id || 'x');

  return (
    <div className={`msg-row ${isMine ? 'outgoing' : ''}`}>
      <div className={`msg-avatar ${avatarClass} ${(!showAvatar || isMine) ? 'hidden' : ''}`}>
        {message.sender?.avatar_url ? (
          <img src={message.sender.avatar_url} alt={senderName} className="room-avatar-img" />
        ) : (
          getInitials(senderName)
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '65%', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
        {showSenderName && !isMine && (
          <span className="sender-name" style={{ paddingLeft: '4px' }}>
            {senderName}
          </span>
        )}

        <div className={`bubble ${isMine ? 'outgoing' : 'incoming'} ${isDeleted ? 'bubble-deleted' : ''}`}>
          {isDeleted ? (
            <span>🚫 This message was deleted</span>
          ) : (
            <>
              {message.content}
              {message.edited_at && (
                <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '6px' }}>(edited)</span>
              )}
            </>
          )}

          <div className="bubble-time">
            {formatTime(message.created_at)}
            {isMine && (
              <span className="read-ticks">
                {message.read_count > 0 ? '✓✓' : '✓'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
