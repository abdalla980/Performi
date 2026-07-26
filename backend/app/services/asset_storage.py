import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import get_settings

_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"}
_MAX_SIZE_BYTES = 5 * 1024 * 1024

_EXTENSION_BY_CONTENT_TYPE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
}


class InvalidAssetError(ValueError):
    pass


def save_client_asset(client_id: uuid.UUID, file: UploadFile, contents: bytes) -> str:
    """Validates and writes an uploaded image to disk, returning its stored relative
    path (f"{client_id}/{generated_name}"). Never trusts the client-supplied filename
    for the on-disk path, to avoid path traversal."""
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise InvalidAssetError(f"Unsupported file type: {file.content_type}")
    if len(contents) > _MAX_SIZE_BYTES:
        raise InvalidAssetError("File is too large (max 5MB)")

    extension = _EXTENSION_BY_CONTENT_TYPE[file.content_type]
    stored_name = f"{uuid.uuid4()}{extension}"
    relative_path = f"{client_id}/{stored_name}"

    settings = get_settings()
    target_dir = Path(settings.uploads_dir) / str(client_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    (target_dir / stored_name).write_bytes(contents)

    return relative_path
