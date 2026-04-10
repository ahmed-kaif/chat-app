import json
import asyncio
from typing import Any

import redis.asyncio as aioredis
from fastapi import WebSocket

from app.core.config import settings


class ConnectionManager:
    """
    Manages active WebSocket connections and Redis pub/sub for cross-worker broadcasting.
    """

    def __init__(self):
        # room_id -> set of (WebSocket, user_id)
        self._connections: dict[str, set[tuple[WebSocket, str]]] = {}
        self._redis: aioredis.Redis | None = None
        self._pubsub: Any | None = None
        self._listener_task: asyncio.Task | None = None

    async def startup(self):
        self._redis = await aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        self._pubsub = self._redis.pubsub()
        await self._pubsub.subscribe("securechat_events")
        self._listener_task = asyncio.create_task(self._listen())

    async def shutdown(self):
        if self._listener_task:
            self._listener_task.cancel()
        if self._pubsub:
            await self._pubsub.close()
        if self._redis:
            await self._redis.aclose()

    async def connect(self, websocket: WebSocket, room_id: str, user_id: str):
        await websocket.accept()
        if room_id not in self._connections:
            self._connections[room_id] = set()
        self._connections[room_id].add((websocket, user_id))

    async def disconnect(self, websocket: WebSocket, room_id: str, user_id: str):
        if room_id in self._connections:
            self._connections[room_id].discard((websocket, user_id))
            if not self._connections[room_id]:
                del self._connections[room_id]

    async def broadcast_to_room(self, room_id: str, event: dict[str, Any]):
        """Publish to Redis so ALL workers receive and forward to WS clients."""
        if self._redis:
            payload = json.dumps({"room_id": room_id, "event": event})
            await self._redis.publish("securechat_events", payload)

    async def send_personal(self, websocket: WebSocket, event: dict[str, Any]):
        """Send directly to a single WebSocket connection."""
        try:
            await websocket.send_json(event)
        except Exception:
            pass

    async def _listen(self):
        """Redis pub/sub listener — forwards received messages to local WS connections."""
        if not self._pubsub:
            return
        async for message in self._pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                    room_id = data["room_id"]
                    event = data["event"]
                    await self._forward_to_local(room_id, event)
                except Exception:
                    pass

    async def _forward_to_local(self, room_id: str, event: dict[str, Any]):
        """Send event to all locally connected sockets in the room."""
        if room_id not in self._connections:
            return
        dead = set()
        for ws, uid in self._connections[room_id]:
            try:
                await ws.send_json(event)
            except Exception:
                dead.add((ws, uid))
        for item in dead:
            self._connections[room_id].discard(item)

    async def set_user_online(self, user_id: str, online: bool):
        if self._redis:
            key = f"presence:{user_id}"
            if online:
                await self._redis.set(key, "online", ex=300)  # 5 min TTL
            else:
                await self._redis.delete(key)

    async def get_user_online(self, user_id: str) -> bool:
        if self._redis:
            return bool(await self._redis.get(f"presence:{user_id}"))
        return False


manager = ConnectionManager()
