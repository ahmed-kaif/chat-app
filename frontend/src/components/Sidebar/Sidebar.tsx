import { useState, useEffect } from 'react';
import { useRoomStore, type Room } from '../../store/roomStore';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import {
  MessageSquare,
  Search,
  LogOut,
  Users,
  User as UserIcon,
  X,
} from 'lucide-react';
import { format, isToday } from 'date-fns';

interface SidebarProps {
  activeRoomId: string | null;
  onRoomSelect: (id: string) => void;
}

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return `avatar-${Math.abs(hash) % 6}`;
}

function getRoomDisplayName(room: Room, myId: string): string {
  if (room.name) return room.name;
  if (room.type === 'dm') {
    const other = room.members.find((m) => m.user_id !== myId);
    return other?.user?.display_name || other?.user?.username || 'Unknown';
  }
  if (room.type === 'self') return '📌 Saved Notes';
  return 'Unnamed Room';
}

function getRoomIcon(type: Room['type']): string {
  switch (type) {
    case 'group': return '👥';
    case 'channel': return '📢';
    case 'self': return '📌';
    default: return '💬';
  }
}

interface SearchUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_online: boolean;
}

export default function Sidebar({ activeRoomId, onRoomSelect }: SidebarProps) {
  const { rooms, fetchRooms, createDM } = useRoomStore();
  const { user, logout } = useAuthStore();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);

  useEffect(() => {
    fetchRooms();
  }, []);

  useEffect(() => {
    if (query.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<SearchUser[]>(`/users/search?q=${encodeURIComponent(query)}`);
        setSearchResults(data);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleStartDM = async (targetId: string) => {
    const room = await createDM(targetId);
    onRoomSelect(room.id);
    setQuery('');
    setSearchResults([]);
  };

  const filteredRooms = query.length >= 2
    ? rooms.filter((r) => {
        const name = getRoomDisplayName(r, user?.id || '');
        return name.toLowerCase().includes(query.toLowerCase());
      })
    : rooms;

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo" style={{ width: 32, height: 32 }}>
          <MessageSquare size={16} color="white" />
        </div>
        <span className="sidebar-title">SecureChat</span>
        <button className="btn-icon" onClick={() => setShowNewGroup(true)} title="New Group">
          <Users size={18} />
        </button>
        <button className="btn-icon" onClick={logout} title="Sign Out">
          <LogOut size={18} />
        </button>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <div className="search-field">
          <Search size={14} className="search-icon" />
          <input
            className="search-input"
            type="text"
            placeholder="Search or start new chat"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              onClick={() => { setQuery(''); setSearchResults([]); }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="search-results" style={{ marginTop: 8 }}>
            {searchResults.map((u) => (
              <div key={u.id} className="search-result-item" onClick={() => handleStartDM(u.id)}>
                <div className={`msg-avatar ${getAvatarColor(u.id)}`} style={{ width: 34, height: 34, fontSize: 12, borderRadius: '50%' }}>
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.username} className="room-avatar-img" />
                  ) : (
                    (u.display_name || u.username).slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.display_name || u.username}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>@{u.username}</div>
                </div>
                {u.is_online && <div className="online-dot" style={{ position: 'static', width: 8, height: 8 }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User profile strip */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className={`msg-avatar ${getAvatarColor(user?.id || '')}`} style={{ width: 30, height: 30, fontSize: 11, borderRadius: '50%', flexShrink: 0 }}>
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.username} className="room-avatar-img" />
          ) : (
            (user?.display_name || user?.username || '?').slice(0, 2).toUpperCase()
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.display_name || user?.username}
          </div>
          <div style={{ fontSize: 11, color: 'var(--success)' }}>● Online</div>
        </div>
      </div>

      {/* Room list */}
      <div className="sidebar-rooms">
        {filteredRooms.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {query ? 'No chats found' : 'No conversations yet'}
          </div>
        ) : (
          filteredRooms.map((room) => {
            const name = getRoomDisplayName(room, user?.id || '');
            const avatarClass = getAvatarColor(room.id);
            const avatarUrl = room.type === 'dm'
              ? room.members.find((m) => m.user_id !== user?.id)?.user?.avatar_url
              : room.avatar_url;
            const isOnline = room.type === 'dm'
              ? room.members.find((m) => m.user_id !== user?.id)?.user?.is_online
              : false;
            const updatedAt = new Date(room.updated_at);
            const timeLabel = isToday(updatedAt)
              ? format(updatedAt, 'HH:mm')
              : format(updatedAt, 'MMM d');

            return (
              <div
                key={room.id}
                className={`room-item ${activeRoomId === room.id ? 'active' : ''}`}
                onClick={() => onRoomSelect(room.id)}
              >
                <div className={`room-avatar ${avatarClass}`} style={{ position: 'relative' }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} className="room-avatar-img" />
                  ) : (
                    room.type === 'self' || room.type === 'group' || room.type === 'channel'
                      ? getRoomIcon(room.type)
                      : name.slice(0, 2).toUpperCase()
                  )}
                  {isOnline && <div className="online-dot" />}
                </div>
                <div className="room-item-info">
                  <div className="room-item-top">
                    <span className="room-item-name">{name}</span>
                    <span className="room-item-time">{timeLabel}</span>
                  </div>
                  <div className="room-item-preview">
                    {room.type === 'group' ? `${room.members.length} members` : 'Click to open chat'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* New Group Modal */}
      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreated={(id) => { onRoomSelect(id); setShowNewGroup(false); }}
        />
      )}
    </div>
  );
}

function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [selected, setSelected] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const { createGroup } = useRoomStore();

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await api.get<SearchUser[]>(`/users/search?q=${encodeURIComponent(search)}`);
      setResults(data.filter((u) => !selected.find((s) => s.id === u.id)));
    }, 300);
    return () => clearTimeout(t);
  }, [search, selected]);

  const toggle = (u: SearchUser) => {
    setSelected((prev) => prev.find((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u]);
  };

  const handleCreate = async () => {
    if (!name.trim() || selected.length === 0) return;
    setLoading(true);
    try {
      const room = await createGroup(name.trim(), selected.map((u) => u.id));
      onCreated(room.id);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">New Group</div>
        <div className="form-group">
          <label className="form-label">Group Name</label>
          <input className="form-input" placeholder="e.g. Team Chat" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Add Members</label>
          <input className="form-input" placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {selected.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {selected.map((u) => (
              <span key={u.id} onClick={() => toggle(u)} style={{ background: 'var(--accent)', color: 'white', borderRadius: 'var(--radius-full)', padding: '2px 10px', fontSize: 12, cursor: 'pointer' }}>
                {u.display_name || u.username} ×
              </span>
            ))}
          </div>
        )}
        {results.map((u) => (
          <div key={u.id} className="search-result-item" onClick={() => toggle(u)} style={{ borderRadius: 'var(--radius-sm)' }}>
            <UserIcon size={16} />
            <span>{u.display_name || u.username}</span>
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name.trim() || selected.length === 0}>
            {loading ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
