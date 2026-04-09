import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.message import MessageType
from app.schemas.auth import UserOut


class AttachmentOut(BaseModel):
    id: uuid.UUID
    file_url: str
    file_name: str
    file_type: str
    file_size: int
    thumbnail_url: str | None

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    sender_id: uuid.UUID | None
    content: str | None
    type: MessageType
    reply_to_id: uuid.UUID | None
    created_at: datetime
    edited_at: datetime | None
    deleted_at: datetime | None
    sender: UserOut | None = None
    attachments: list[AttachmentOut] = []
    read_count: int = 0

    model_config = {"from_attributes": True}


class SendMessageRequest(BaseModel):
    content: str = Field(..., max_length=4096)
    type: MessageType = MessageType.TEXT
    reply_to_id: uuid.UUID | None = None


class EditMessageRequest(BaseModel):
    content: str = Field(..., max_length=4096)
