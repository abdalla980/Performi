from cryptography.fernet import Fernet

from app.config import get_settings


def _fernet() -> Fernet:
    key = get_settings().token_encryption_key
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not configured")
    return Fernet(key.encode())


def encrypt_token(raw: str) -> bytes:
    return _fernet().encrypt(raw.encode())


def decrypt_token(blob: bytes) -> str:
    return _fernet().decrypt(blob).decode()
