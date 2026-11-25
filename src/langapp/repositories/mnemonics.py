import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from langapp.db.models import Concept, ImageGeneration, Mnemonic


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

    def get_for_user(self, user_id: uuid.UUID, mnemonic_id: int) -> Mnemonic | None:
        stmt = (
            select(Mnemonic)
            .options(selectinload(Mnemonic.concept).selectinload(Concept.terms))
            .where(Mnemonic.id == mnemonic_id, Mnemonic.user_id == user_id)
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

    def count_generations_since(self, user_id: uuid.UUID, since: datetime) -> int:
        stmt = (
            select(func.count())
            .select_from(ImageGeneration)
            .where(ImageGeneration.user_id == user_id, ImageGeneration.created_at >= since)
        )
        return self.session.scalar(stmt) or 0

    def log_generation(self, user_id: uuid.UUID, model: str, succeeded: bool) -> None:
        self.session.add(ImageGeneration(user_id=user_id, model=model, succeeded=succeeded))
        self.session.flush()

    def add(
        self,
        user_id: uuid.UUID,
        concept_id: int,
        learning: str,
        native: str,
        text: str,
        image_path: str | None,
        text_model: str | None,
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

    def update(self, mnemonic: Mnemonic, text: str, image_path: str | None, image_model: str | None) -> Mnemonic:
        mnemonic.text = text
        mnemonic.image_path = image_path
        mnemonic.image_model = image_model
        mnemonic.text_model = None
        self.session.flush()
        return mnemonic
