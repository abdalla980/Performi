from app.db import normalize_database_url


def test_plain_postgres_url_uses_installed_psycopg3_driver():
    # Railway/Supabase hand out driverless URLs; SQLAlchemy would default to
    # psycopg2, which isn't installed — only psycopg (v3) is.
    assert normalize_database_url("postgresql://u:p@host:5432/db") == "postgresql+psycopg://u:p@host:5432/db"


def test_legacy_postgres_scheme_is_normalized_too():
    assert normalize_database_url("postgres://u:p@host/db") == "postgresql+psycopg://u:p@host/db"


def test_explicit_driver_and_sqlite_urls_are_left_alone():
    assert normalize_database_url("postgresql+psycopg://u@h/db") == "postgresql+psycopg://u@h/db"
    assert normalize_database_url("sqlite:///./dev.db") == "sqlite:///./dev.db"
