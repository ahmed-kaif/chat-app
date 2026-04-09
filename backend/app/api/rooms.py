import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.room import Room, RoomMember, RoomType, MemberRole
from app.models.user import User
from app.schemas.room import RoomOut, CreateRoomRequest, CreateDMRequest, AddMemberRequest
from app.api.auth import get_current_user

router = APIRouter(prefix="/rooms", tags=["Rooms"])


async def _get_room_or_404(room_id: uuid.UUID, db: AsyncSession) -> Room:
    result = await db.execute(
        select(Room)
        .where(Room.id == room_id)
        .options(selectinload(Room.members).selectinload(RoomMember.user))
    )
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return room


async def _require_member(room_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> RoomMember:
    result = await db.execute(
        select(RoomMember).where(
            and_(RoomMember.room_id == room_id, RoomMember.user_id == user_id)
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this room")
    return member


@router.get("", response_model=list[RoomOut])
async def list_my_rooms(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Room)
        .join(RoomMember, Room.id == RoomMember.room_id)
        .where(RoomMember.user_id == current_user.id)
        .options(selectinload(Room.members).selectinload(RoomMember.user))
        .order_by(Room.updated_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_room(
    data: CreateRoomRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.type == RoomType.DM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use POST /rooms/dm to create a DM",
        )
    if data.type == RoomType.SELF:
        # Only one self-room per user
        existing = await db.execute(
            select(Room)
            .join(RoomMember, Room.id == RoomMember.room_id)
            .where(Room.type == RoomType.SELF, RoomMember.user_id == current_user.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Self room already exists")

    room = Room(
        type=data.type,
        name=data.name,
        description=data.description,
        created_by=current_user.id,
    )
    db.add(room)
    await db.flush()

    # Add creator as owner
    db.add(RoomMember(room_id=room.id, user_id=current_user.id, role=MemberRole.OWNER))

    # Add other members
    for uid in data.member_ids:
        if uid != current_user.id:
            db.add(RoomMember(room_id=room.id, user_id=uid, role=MemberRole.MEMBER))

    await db.flush()
    return await _get_room_or_404(room.id, db)


@router.post("/dm", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
async def create_dm(
    data: CreateDMRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot create DM with yourself. Use self room instead.")

    # Check if DM already exists between these two users
    subq_me = select(RoomMember.room_id).where(RoomMember.user_id == current_user.id)
    subq_them = select(RoomMember.room_id).where(RoomMember.user_id == data.target_user_id)
    result = await db.execute(
        select(Room)
        .where(
            Room.type == RoomType.DM,
            Room.id.in_(subq_me),
            Room.id.in_(subq_them),
        )
        .options(selectinload(Room.members).selectinload(RoomMember.user))
    )
    existing = result.scalar_one_or_none()
    if existing:
        return existing

    room = Room(type=RoomType.DM, created_by=current_user.id)
    db.add(room)
    await db.flush()

    db.add(RoomMember(room_id=room.id, user_id=current_user.id, role=MemberRole.MEMBER))
    db.add(RoomMember(room_id=room.id, user_id=data.target_user_id, role=MemberRole.MEMBER))

    await db.flush()
    return await _get_room_or_404(room.id, db)


@router.get("/{room_id}", response_model=RoomOut)
async def get_room(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _require_member(room_id, current_user.id, db)
    return await _get_room_or_404(room_id, db)


@router.post("/{room_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    room_id: uuid.UUID,
    data: AddMemberRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = await _require_member(room_id, current_user.id, db)
    if member.role not in (MemberRole.OWNER, MemberRole.ADMIN):
        raise HTTPException(status_code=403, detail="Only owners and admins can add members")

    existing = await db.execute(
        select(RoomMember).where(
            RoomMember.room_id == room_id, RoomMember.user_id == data.user_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="User is already a member")

    db.add(RoomMember(room_id=room_id, user_id=data.user_id, role=data.role))
    return {"detail": "Member added"}


@router.delete("/{room_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    room_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    requester = await _require_member(room_id, current_user.id, db)
    if user_id != current_user.id and requester.role not in (MemberRole.OWNER, MemberRole.ADMIN):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    result = await db.execute(
        select(RoomMember).where(
            RoomMember.room_id == room_id, RoomMember.user_id == user_id
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(target)
