from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    test_database_url: str | None = None

    tatoeba_base_url: str = "https://api.tatoeba.org"
    tatoeba_timeout_seconds: float = 10.0
    tatoeba_max_retries: int = 4
    tatoeba_min_interval_seconds: float = 1.0
    tatoeba_user_agent: str = "project-languages-v2/0.1 (student project)"

    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "mnemonics"
    signed_url_seconds: int = 3600

    openrouter_api_key: str | None = None
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_text_model: str = "openrouter/free"
    openrouter_image_model: str = "recraft/recraft-v4.1-flash-v2:free"
    openrouter_timeout_seconds: float = 120.0
    openrouter_app_title: str = "TurtleTalk"

    mnemonic_daily_limit: int = 5


@lru_cache
def get_settings() -> Settings:
    return Settings()
