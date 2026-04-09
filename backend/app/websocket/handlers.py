import json
from datetime import datetime, timezone

from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.message import Message, MessageRead, MessageType
from app.models.room import RoomMember
from app.websocket.manager import manager


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def handle_event(
    websocket: WebSocket,
    room_id: str,
    user_id: str,
    raw: str,
    db: AsyncSession,
):
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        await manager.send_personal(websocket, {"type": "error", "payload": {"detail": "Invalid JSON"}})
        return

    event_type: str = data.get("type", "")
    payload: dict = data.get("payload", {})

    match event_type:
        case "message.send":
            await handle_message_send(websocket, room_id, user_id, payload, db)
        case "message.edit":
            await handle_message_edit(websocket, room_id, user_id, payload, db)
        case "message.delete":
            await handle_message_delete(websocket, room_id, user_id, payload, db)
        case "typing.start" | "typing.stop":
            await handle_typing(room_id, user_id, event_type)
        case "message.read":
            await handle_message_read(websocket, room_id, user_id, payload, db)
        case "presence.update":
            await handle_presence(room_id, user_id, payload)
        case _:
            await manager.send_personal(
                websocket, {"type": "error", "payload": {"detail": f"Unknown event type: {event_type}"}}
            )


async def handle_message_send(
    websocket: WebSocket,
    room_id: str,
    user_id: str,
    payload: dict,
    db: AsyncSession,
):
    content = payload.get("content", "").strip()
    if not content:
        await manager.send_personal(websocket, {"type": "error", "payload": {"detail": "Empty message"}})
        return

    # Verify membership
    result = await db.execute(
        select(RoomMember).where(
            RoomMember.room_id == room_id, RoomMember.user_id == user_id
        )
    )
    if not result.scalar_one_or_none():
        await manager.send_personal(websocket, {"type": "error", "payload": {"detail": "Not a member"}})
        return

    msg = Message(
        room_id=room_id,
        sender_id=user_id,
        content=content,
        type=MessageType.TEXT,
        reply_to_id=payload.get("reply_to_id"),
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)

    # Load sender for response
    result = await db.execute(
        select(Message)
        .where(Message.id == msg.id)
        .options(selectinload(Message.sender), selectinload(Message.attachments))
    )
    msg = result.scalar_one()
    await db.commit()

    event = {
        "type": "message.new",
        "payload": {
            "id": str(msg.id),
            "room_id": str(msg.room_id),
            "sender_id": str(msg.sender_id),
            "sender_username": msg.sender.username if msg.sender else None,
            "sender_display_name": msg.sender.display_name if msg.sender else None,
            "sender_avatar_url": msg.sender.avatar_url if msg.sender else None,
            "content": msg.content,
            "type": msg.type.value,
            "reply_to_id": str(msg.reply_to_id) if msg.reply_to_id else None,
            "created_at": msg.created_at.isoformat(),
            "edited_at": None,
            "attachments": [],
        },
        "timestamp": _now_iso(),
    }
    await manager.broadcast_to_room(room_id, event)


async def handle_message_edit(
    websocket: WebSocket,
    room_id: str,
    user_id: str,
    payload: dict,
    db: AsyncSession,
):
    message_id = payload.get("message_id")
    new_content = payload.get("content", "").strip()
    if not message_id or not new_content:
        return

    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg or str(msg.sender_id) != user_id or msg.deleted_at:
        await manager.send_personal(websocket, {"type": "error", "payload": {"detail": "Cannot edit"}})
        return

    msg.content = new_content
    msg.edited_at = datetime.now(timezone.utc)
    await db.commit()

    event = {
        "type": "message.updated",
        "payload": {
            "id": str(msg.id),
            "room_id": room_id,
            "content": msg.content,
            "edited_at": msg.edited_at.isoformat(),
        },
        "timestamp": _now_iso(),
    }
    await manager.broadcast_to_room(room_id, event)


async def handle_message_delete(
    websocket: WebSocket,
    room_id: str,
    user_id: str,
    payload: dict,
    db: AsyncSession,
):
    message_id = payload.get("message_id")
    if not message_id:
        return

    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg or str(msg.sender_id) != user_id:
        await manager.send_personal(websocket, {"type": "error", "payload": {"detail": "Cannot delete"}})
        return

    msg.deleted_at = datetime.now(timezone.utc)
    await db.commit()

    event = {
        "type": "message.deleted",
        "payload": {"id": str(msg.id), "room_id": room_id},
        "timestamp": _now_iso(),
    }
    await manager.broadcast_to_room(room_id, event)


async def handle_typing(room_id: str, user_id: str, event_type: str):
    event = {
        "type": "typing.indicator",
        "payload": {
            "user_id": user_id,
            "room_id": room_id,
            "is_typing": event_type == "typing.start",
        },
        "timestamp": _now_iso(),
    }
    await manager.broadcast_to_room(room_id, event)


async def handle_message_read(
    websocket: WebSocket,
    room_id: str,
    user_id: str,
    payload: dict,
    db: AsyncSession,
):
    message_id = payload.get("message_id")
    if not message_id:
        return

    existing = await db.execute(
        select(MessageRead).where(
            MessageRead.message_id == message_id, MessageRead.user_id == user_id
        )
    )
    if not existing.scalar_one_or_none():
        db.add(MessageRead(message_id=message_id, user_id=user_id))
        await db.commit()

    event = {
        "type": "read.receipt",
        "payload": {
            "message_id": message_id,
            "user_id": user_id,
            "room_id": room_id,
            "read_at": _now_iso(),
        },
        "timestamp": _now_iso(),
    }
    await manager.broadcast_to_room(room_id, event)


async def handle_presence(room_id: str, user_id: str, payload: dict):
    status_val = payload.get("status", "online")
    online = status_val in ("online", "away")
    await manager.set_user_online(user_id, online)

    event = {
        "type": "presence.changed",
        "payload": {"user_id": user_id, "status": status_val},
        "timestamp": _now_iso(),
    }
    await manager.broadcast_to_room(room_id, event)
