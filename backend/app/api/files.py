import os
import uuid
import aiofiles
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.models.user import User
from app.api.auth import get_current_user

router = APIRouter(prefix="/files", tags=["Files"])

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "text/plain",
    "application/zip",
    "video/mp4", "video/webm",
    "audio/mpeg", "audio/ogg", "audio/webm",
}


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"File type '{file.content_type}' is not allowed",
        )

    # Read file and check size
    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.MAX_FILE_SIZE // (1024*1024)}MB",
        )

    # Build unique filename
    ext = Path(file.filename or "file").suffix
    unique_name = f"{uuid.uuid4().hex}{ext}"
    save_path = Path(settings.UPLOAD_DIR) / unique_name

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    async with aiofiles.open(save_path, "wb") as f:
        await f.write(content)

    file_url = f"/uploads/{unique_name}"
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content={
            "file_url": file_url,
            "file_name": file.filename,
            "file_type": file.content_type,
            "file_size": len(content),
        },
    )
