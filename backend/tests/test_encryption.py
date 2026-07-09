from app.encryption import decrypt_token, encrypt_token


def test_encrypt_decrypt_round_trip(monkeypatch):
    from cryptography.fernet import Fernet

    monkeypatch.setenv("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    from app.config import get_settings

    get_settings.cache_clear()

    blob = encrypt_token("refresh-token-value")
    assert blob != b"refresh-token-value"
    assert decrypt_token(blob) == "refresh-token-value"

    get_settings.cache_clear()
