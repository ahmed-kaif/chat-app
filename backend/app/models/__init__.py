from app.core.database import Base  # noqa: F401 - import Base for Alembic
from app.models.user import User  # noqa: F401
from app.models.room import Room, RoomMember  # noqa: F401
from app.models.message import Message, MessageRead, Attachment  # noqa: F401
