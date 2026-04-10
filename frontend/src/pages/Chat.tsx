import Sidebar from '../components/Sidebar/Sidebar';
import ChatWindow from '../components/ChatWindow/ChatWindow';
import { useRoomStore } from '../store/roomStore';
import { MessageSquare } from 'lucide-react';

export default function Chat() {
  const { rooms, activeRoomId, setActiveRoom } = useRoomStore();

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || null;

  const handleRoomSelect = (id: string) => {
    setActiveRoom(id);
  };

  return (
    <div className="app-layout">
      <Sidebar activeRoomId={activeRoomId} onRoomSelect={handleRoomSelect} />

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
    </div>
  );
}
