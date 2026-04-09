import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import String, DateTime, ForeignKey, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class RoomType(str, PyEnum):
    DM = "dm"
    GROUP = "group"
    CHANNEL = "channel"
    SELF = "self"


class MemberRole(str, PyEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    type: Mapped[RoomType] = mapped_column(Enum(RoomType), nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    members: Mapped[list["RoomMember"]] = relationship(
        "RoomMember", back_populates="room", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(  # type: ignore[name-defined]
        "Message", back_populates="room", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Room {self.type}:{self.name or self.id}>"


class RoomMember(Base):
    __tablename__ = "room_members"

    room_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole), default=MemberRole.MEMBER, nullable=False
    )
    muted_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )

    # Relationships
    room: Mapped["Room"] = relationship("Room", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="room_memberships")  # type: ignore[name-defined]
