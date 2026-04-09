import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.room import RoomType, MemberRole
from app.schemas.auth import UserOut


class RoomMemberOut(BaseModel):
    user_id: uuid.UUID
    room_id: uuid.UUID
    role: MemberRole
    joined_at: datetime
    user: UserOut | None = None

    model_config = {"from_attributes": True}


class RoomOut(BaseModel):
    id: uuid.UUID
    type: RoomType
    name: str | None
    description: str | None
    avatar_url: str | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    members: list[RoomMemberOut] = []

    model_config = {"from_attributes": True}


class CreateRoomRequest(BaseModel):
    type: RoomType = RoomType.GROUP
    name: str | None = Field(None, max_length=100)
    description: str | None = Field(None, max_length=500)
    member_ids: list[uuid.UUID] = []  # user IDs to add (besides creator)


class CreateDMRequest(BaseModel):
    target_user_id: uuid.UUID


class AddMemberRequest(BaseModel):
    user_id: uuid.UUID
    role: MemberRole = MemberRole.MEMBER
