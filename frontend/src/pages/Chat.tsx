import Sidebar from '../components/Sidebar/Sidebar';
import ChatWindow from '../components/ChatWindow/ChatWindow';
import ErrorBoundary from '../components/ErrorBoundary';
import { useRoomStore } from '../store/roomStore';
import { MessageSquare } from 'lucide-react';

export default function Chat() {
  const { rooms, activeRoomId, setActiveRoom } = useRoomStore();
  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  return (
    <div className="app-layout">
      <ErrorBoundary fallback="Sidebar failed to load">
        <Sidebar activeRoomId={activeRoomId} onRoomSelect={setActiveRoom} />
      </ErrorBoundary>

      <ErrorBoundary fallback="Chat failed to load — please select another conversation">
        {activeRoom ? (
          <ChatWindow room={activeRoom} />
        ) : (
          <div className="empty-chat">
            <div className="empty-chat-icon">
              <MessageSquare size={36} />
            </div>
            <h2>SecureChat</h2>
            <p>Select a conversation from the sidebar, or search for a user to start chatting.</p>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}
