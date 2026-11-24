import uuid

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from langapp.db.models import UserSettings


class UserSettingsRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_settings(self, user_id: uuid.UUID) -> UserSettings | None:
        return self.session.get(UserSettings, user_id)

    def save_settings(self, user_id: uuid.UUID, native_lang: str, learning_lang: str) -> UserSettings:
        stmt = insert(UserSettings).values(user_id=user_id, native_lang=native_lang, learning_lang=learning_lang)
        stmt = stmt.on_conflict_do_update(
            index_elements=[UserSettings.user_id],
            set_={"native_lang": native_lang, "learning_lang": learning_lang, "updated_at": func.now()},
        ).returning(UserSettings)
        return self.session.scalars(stmt).one()
