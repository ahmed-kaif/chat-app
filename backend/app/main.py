import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import auth, users, rooms, messages, files
from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.websocket.manager import manager
from app.websocket.handlers import handle_event

# --- Lifespan ---


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    await manager.startup()
    print(f"🚀 {settings.APP_NAME} v{settings.APP_VERSION} starting up...")
    yield
    # Shutdown
    await manager.shutdown()
    print("👋 Shutting down...")


# --- App ---

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="A real-time secure chat application",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# --- CORS ---

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static files (uploads) ---

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR, check_dir=False), name="uploads")

# --- Routers ---

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(rooms.router)
app.include_router(messages.router)
app.include_router(files.router)

# --- WebSocket endpoint ---


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    # Authenticate via token query param
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id: str = payload.get("sub", "")
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, room_id, user_id)
    await manager.set_user_online(user_id, True)

    # Notify room that user came online
    await manager.broadcast_to_room(
        room_id,
        {
            "type": "presence.changed",
            "payload": {"user_id": user_id, "status": "online"},
            "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
        },
    )

    try:
        while True:
            raw = await websocket.receive_text()
            await handle_event(websocket, room_id, user_id, raw, db)
    except WebSocketDisconnect:
        await manager.disconnect(websocket, room_id, user_id)
        await manager.set_user_online(user_id, False)
        await manager.broadcast_to_room(
            room_id,
            {
                "type": "presence.changed",
                "payload": {"user_id": user_id, "status": "offline"},
                "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
            },
        )

# --- Health check ---


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok", "version": settings.APP_VERSION}
