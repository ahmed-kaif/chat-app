Here's a comprehensive technical plan for your WhatsApp-like chat application, with FastAPI + React frontend and a path to Android mobile:

**FastAPI + React is an excellent choice.** FastAPI gives you native WebSocket support, async performance, automatic OpenAPI docs, and Python's mature ecosystem for security/crypto. React pairs naturally with real-time WebSocket clients.

Let me visualize the full system architecture first:Now here's your full plan — structured as a Claude Code project brief you can paste directly:

---

## Project: SecureChat — Full Stack Plan

### Tech Stack

**Backend:** FastAPI (Python 3.11+), SQLAlchemy (async), Alembic migrations, WebSockets via `websockets` / Starlette
**Frontend:** React 18, TypeScript, Zustand (state), TailwindCSS, Socket client via native WebSocket API
**Database:** PostgreSQL (primary data), Redis (pub/sub for scaling WebSocket connections across workers)
**Storage:** MinIO (self-hosted S3-compatible) for file uploads
**Auth:** JWT access tokens (15 min) + refresh tokens (30 days), bcrypt password hashing
**Security:** End-to-end encryption using the Signal Protocol (via `libsignal` or `python-doubleratchet`)

---

### Database Schema

```
users              → id, username, email, password_hash, avatar_url, public_key, created_at, last_seen
rooms              → id, type (dm/group/channel/self), name, description, avatar_url, created_by, created_at
room_members       → room_id, user_id, role (owner/admin/member), joined_at, muted_until
messages           → id, room_id, sender_id, content (encrypted blob), type (text/image/file/system), reply_to_id, created_at, edited_at, deleted_at
message_reads      → message_id, user_id, read_at  (for read receipts ✓✓)
attachments        → id, message_id, file_url, file_type, file_size, thumbnail_url
user_keys          → user_id, device_id, identity_key, signed_prekey, one_time_prekeys[]
```

---

### Backend Structure (FastAPI)

```
backend/
├── app/
│   ├── main.py                  # FastAPI app, startup, CORS
│   ├── core/
│   │   ├── config.py            # Settings via pydantic-settings
│   │   ├── security.py          # JWT, bcrypt, token utils
│   │   └── database.py          # Async SQLAlchemy engine + session
│   ├── models/                  # SQLAlchemy ORM models
│   ├── schemas/                 # Pydantic request/response schemas
│   ├── api/
│   │   ├── auth.py              # /register, /login, /refresh, /logout
│   │   ├── users.py             # profile, search, online status
│   │   ├── rooms.py             # create/join/leave rooms
│   │   ├── messages.py          # send, edit, delete, history
│   │   └── files.py             # upload, download attachments
│   ├── websocket/
│   │   ├── manager.py           # ConnectionManager (Redis pub/sub)
│   │   └── handlers.py          # WS event handlers
│   └── services/
│       ├── encryption.py        # E2E key management
│       └── notifications.py     # FCM push for offline users
├── alembic/                     # DB migrations
├── requirements.txt
└── Dockerfile
```

---

### WebSocket Event Protocol

All WebSocket messages are JSON with this shape:
```json
{ "type": "event_name", "payload": { ... }, "timestamp": "ISO8601" }
```

**Client → Server events:**
- `message.send` — send a new message
- `message.edit` — edit own message
- `message.delete` — soft-delete a message
- `typing.start` / `typing.stop` — typing indicators
- `message.read` — mark messages as read (delivers ✓✓)
- `presence.update` — online/away/offline

**Server → Client events:**
- `message.new` — new message arrived
- `message.updated` / `message.deleted`
- `typing.indicator` — show "User is typing..."
- `read.receipt` — update tick marks
- `presence.changed` — user came online/went offline
- `room.updated` — group name/avatar changed

---

### Room Types

| Type | Description | Members |
|---|---|---|
| `dm` | 1-on-1 private chat | Exactly 2 users |
| `self` | Message yourself (Saved Notes) | 1 user |
| `group` | Group chat | Many users, any can send |
| `channel` | Broadcast channel | Owners/admins send, members read |

---

### Frontend Structure (React + TypeScript)

```
frontend/
├── src/
│   ├── App.tsx
│   ├── pages/
│   │   ├── Login.tsx / Register.tsx
│   │   └── Chat.tsx              # main layout
│   ├── components/
│   │   ├── Sidebar/              # room list, search, new chat
│   │   ├── ChatWindow/           # message list, input bar
│   │   ├── MessageBubble/        # text, image, file, reply
│   │   └── RoomInfo/             # group info panel
│   ├── store/
│   │   ├── authStore.ts          # user session (Zustand)
│   │   ├── roomStore.ts          # rooms list
│   │   └── messageStore.ts       # per-room message cache
│   ├── hooks/
│   │   ├── useWebSocket.ts       # WS connection + reconnect logic
│   │   └── usePresence.ts        # online status
│   └── api/
│       └── client.ts             # axios instance with JWT interceptors
```

---

### Security Implementation

**Phase 1 (launch):** TLS everywhere, JWT auth, bcrypt passwords, input sanitization, rate limiting via `slowapi`.

**Phase 2 (E2E encryption — your personal secure chat):**
- Use the **Signal Protocol** (Double Ratchet + X3DH key exchange)
- Each device generates an identity key pair on first run
- Public keys are uploaded to the server; private keys never leave the device
- Messages are encrypted on the client before sending — the server stores ciphertext only
- Python library: `python-doubleratchet` or port to the JS side with `@signalapp/libsignal-client`

---

### Android App (Phase 2)

Since it's just for you and one friend, self-hosting is the right call:
- **Kotlin + Jetpack Compose** for the UI
- Same WebSocket protocol as the web app (reuse your backend 100%)
- Store private keys in Android Keystore (hardware-backed)
- Use `libsignal-android` for E2E encryption
- FCM for push notifications when app is backgrounded
- Can use **Retrofit** for REST + **OkHttp WebSocket** client

---

### Claude Code Prompt to Start

Paste this into Claude Code to begin building:

```
Build a full-stack real-time chat application called SecureChat.

Backend: FastAPI (Python), async SQLAlchemy, PostgreSQL, Redis, Alembic.
Frontend: React 18 + TypeScript, Zustand, TailwindCSS.

Start with:
1. FastAPI project scaffold with folder structure as described
2. PostgreSQL models: User, Room, RoomMember, Message, MessageRead
3. Auth endpoints: POST /auth/register, POST /auth/login (JWT + refresh token)
4. WebSocket endpoint at /ws/{room_id} with ConnectionManager using Redis pub/sub
5. Room CRUD: create DM, group, channel, self-room
6. Message send/receive over WebSocket with event types: message.send, message.new, typing.start, typing.stop, message.read
7. React app with sidebar (room list) + chat window + message input
8. JWT token refresh interceptor in axios
9. docker-compose.yml with FastAPI, PostgreSQL, Redis services

Use pydantic-settings for config, python-jose for JWT, passlib[bcrypt] for passwords, aioredis for Redis.
```

---

### Deployment (Self-hosted for privacy)

For your personal secure chat, self-hosting on a VPS (Hetzner, DigitalOcean) is ideal:
- Docker Compose for all services
- Nginx as reverse proxy with Let's Encrypt TLS
- Backups: daily PostgreSQL dumps to encrypted S3/Backblaze
- Keep the server in a jurisdiction you trust

This gives you full control over your data — no third party ever sees your messages.

---

### Development Setup

To run this locally:

- Use Docker Compose setup for FastAPI + PostgreSQL + Redis.
- Run `docker-compose up --build` to start services.
- Also make the frontend run on port 3000 and the backend on port 8000.
- Also I want to use git for my version control.

