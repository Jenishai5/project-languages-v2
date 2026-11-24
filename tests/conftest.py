import json
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from pydantic import ValidationError
from sqlalchemy import text

from langapp.db.session import make_engine, make_session_factory

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).parent / "fixtures"


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _test_database_url() -> str | None:
    if os.environ.get("TEST_DATABASE_URL"):
        return os.environ["TEST_DATABASE_URL"]
    try:
        from langapp.config import Settings

        return Settings().test_database_url
    except ValidationError:
        return None


@pytest.fixture(scope="session")
def engine():
    url = _test_database_url()
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")

    alembic_config = Config(str(ROOT / "alembic.ini"))
    alembic_config.attributes["database_url"] = url
    command.upgrade(alembic_config, "head")

    db_engine = make_engine(url)
    yield db_engine
    db_engine.dispose()


@pytest.fixture
def session_factory(engine):
    with engine.begin() as connection:
        connection.execute(
            text("TRUNCATE audios, sentence_links, sentences, import_runs, word_pairs, user_progress RESTART IDENTITY CASCADE")
        )
    return make_session_factory(engine)
