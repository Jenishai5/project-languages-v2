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


@lru_cache
def get_settings() -> Settings:
    return Settings()
