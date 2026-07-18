from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dev.db"  # local dev/tests; set to the Supabase Postgres connection string in deployment
    supabase_url: str = ""  # e.g. https://<project-ref>.supabase.co — Settings > API in the Supabase dashboard
    token_encryption_key: str = ""
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    google_ads_developer_token: str = ""
    google_ads_client_id: str = ""
    google_ads_client_secret: str = ""
    google_ads_oauth_redirect_uri: str = "http://localhost:8000/clients/google/oauth/callback"
    meta_app_id: str = ""
    meta_app_secret: str = ""
    meta_oauth_redirect_uri: str = "http://localhost:8000/clients/meta/oauth/callback"
    redis_url: str = "redis://localhost:6379/0"
    frontend_base_url: str = "http://localhost:5173"
    cors_allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def supabase_jwks_url(self) -> str:
        # Supabase Auth publishes its current asymmetric signing keys here — no
        # secret involved, safe to fetch over plain HTTPS with no auth header.
        return f"{self.supabase_url}/auth/v1/.well-known/jwks.json"


@lru_cache
def get_settings() -> Settings:
    return Settings()
