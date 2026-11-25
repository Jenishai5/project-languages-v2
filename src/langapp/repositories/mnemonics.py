import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from langapp.db.models import Concept, Mnemonic


class MnemonicRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def find(self, user_id: uuid.UUID, concept_id: int, learning: str, native: str) -> Mnemonic | None:
        stmt = (
            select(Mnemonic)
            .options(selectinload(Mnemonic.concept).selectinload(Concept.terms))
            .where(
                Mnemonic.user_id == user_id,
                Mnemonic.concept_id == concept_id,
                Mnemonic.learning_lang == learning,
                Mnemonic.native_lang == native,
            )
        )
        return self.session.scalars(stmt).first()

    def list_for_user(self, user_id: uuid.UUID, learning: str, native: str) -> list[Mnemonic]:
        stmt = (
            select(Mnemonic)
            .options(selectinload(Mnemonic.concept).selectinload(Concept.terms))
            .where(Mnemonic.user_id == user_id, Mnemonic.learning_lang == learning, Mnemonic.native_lang == native)
            .order_by(Mnemonic.created_at.desc(), Mnemonic.id.desc())
        )
        return list(self.session.scalars(stmt))

    def count_created_since(self, user_id: uuid.UUID, since: datetime) -> int:
        stmt = select(func.count()).select_from(Mnemonic).where(Mnemonic.user_id == user_id, Mnemonic.created_at >= since)
        return self.session.scalar(stmt) or 0

    def add(
        self,
        user_id: uuid.UUID,
        concept_id: int,
        learning: str,
        native: str,
        text: str,
        image_path: str | None,
        text_model: str,
        image_model: str | None,
    ) -> Mnemonic:
        mnemonic = Mnemonic(
            user_id=user_id,
            concept_id=concept_id,
            learning_lang=learning,
            native_lang=native,
            text=text,
            image_path=image_path,
            text_model=text_model,
            image_model=image_model,
        )
        self.session.add(mnemonic)
        self.session.flush()
        return self.find(user_id, concept_id, learning, native) or mnemonic
