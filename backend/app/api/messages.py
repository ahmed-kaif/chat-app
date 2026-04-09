import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.message import Message, MessageRead
from app.models.room import RoomMember
from app.models.user import User
from app.schemas.message import MessageOut, SendMessageRequest, EditMessageRequest
from app.api.auth import get_current_user
from app.api.rooms import _require_member

router = APIRouter(tags=["Messages"])


@router.get("/rooms/{room_id}/messages", response_model=list[MessageOut])
async def get_messages(
    room_id: uuid.UUID,
    before: datetime | None = None,
    limit: int = Query(default=50, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(room_id, current_user.id, db)

    query = (
        select(Message)
        .where(Message.room_id == room_id, Message.deleted_at.is_(None))
        .options(
            selectinload(Message.sender),
            selectinload(Message.attachments),
            selectinload(Message.reads),
        )
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    if before:
        query = query.where(Message.created_at < before)

    result = await db.execute(query)
    messages = result.scalars().all()
    return list(reversed(messages))


@router.post(
    "/rooms/{room_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    room_id: uuid.UUID,
    data: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(room_id, current_user.id, db)

    msg = Message(
        room_id=room_id,
        sender_id=current_user.id,
        content=data.content,
        type=data.type,
        reply_to_id=data.reply_to_id,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)

    result = await db.execute(
        select(Message)
        .where(Message.id == msg.id)
        .options(
            selectinload(Message.sender),
            selectinload(Message.attachments),
            selectinload(Message.reads),
        )
    )
    return result.scalar_one()


@router.patch("/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    message_id: uuid.UUID,
    data: EditMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Message)
        .where(Message.id == message_id)
        .options(
            selectinload(Message.sender),
            selectinload(Message.attachments),
            selectinload(Message.reads),
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot edit another user's message")
    if msg.deleted_at:
        raise HTTPException(status_code=400, detail="Cannot edit a deleted message")

    msg.content = data.content
    msg.edited_at = datetime.now(timezone.utc)
    db.add(msg)
    return msg


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete another user's message")

    msg.deleted_at = datetime.now(timezone.utc)
    db.add(msg)


@router.post("/messages/{message_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    message_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    existing = await db.execute(
        select(MessageRead).where(
            MessageRead.message_id == message_id, MessageRead.user_id == current_user.id
        )
    )
    if not existing.scalar_one_or_none():
        db.add(MessageRead(message_id=message_id, user_id=current_user.id))
