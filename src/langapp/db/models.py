import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    false,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Sentence(Base):
    __tablename__ = "sentences"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    lang: Mapped[str] = mapped_column(String(8), index=True)
    text: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int | None] = mapped_column(SmallInteger)
    license: Mapped[str | None] = mapped_column(String(64))
    owner: Mapped[str | None] = mapped_column(String(100))
    is_unapproved: Mapped[bool] = mapped_column(Boolean, server_default=false())
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    links: Mapped[list["SentenceLink"]] = relationship(
        foreign_keys="SentenceLink.sentence_id",
        back_populates="sentence",
        cascade="all, delete-orphan",
    )
    audios: Mapped[list["Audio"]] = relationship(back_populates="sentence", cascade="all, delete-orphan")


class SentenceLink(Base):
    __tablename__ = "sentence_links"
    __table_args__ = (CheckConstraint("sentence_id <> translation_id", name="no_self_link"),)

    sentence_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sentences.id", ondelete="CASCADE"), primary_key=True
    )
    translation_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sentences.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    is_direct: Mapped[bool] = mapped_column(Boolean)

    sentence: Mapped[Sentence] = relationship(foreign_keys=[sentence_id], back_populates="links")
    translation: Mapped[Sentence] = relationship(foreign_keys=[translation_id])


class Audio(Base):
    __tablename__ = "audios"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    sentence_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("sentences.id", ondelete="CASCADE"), index=True
    )
    download_url: Mapped[str] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(String(100))
    license: Mapped[str | None] = mapped_column(String(64))
    attribution_url: Mapped[str | None] = mapped_column(Text)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sentence: Mapped[Sentence] = relationship(back_populates="audios")


class ImportRun(Base):
    __tablename__ = "import_runs"
    __table_args__ = (
        CheckConstraint("status IN ('running', 'succeeded', 'failed')", name="valid_status"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    source_lang: Mapped[str] = mapped_column(String(8))
    target_langs: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pages: Mapped[int] = mapped_column(Integer, default=0)
    fetched: Mapped[int] = mapped_column(Integer, default=0)
    inserted: Mapped[int] = mapped_column(Integer, default=0)
    updated: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    last_cursor: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)


class WordPair(Base):
    __tablename__ = "word_pairs"
    __table_args__ = (UniqueConstraint("pair", "source_text", "target_text", name="uq_word_pair"),)

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    pair: Mapped[str] = mapped_column(String(16), index=True)
    category: Mapped[str | None] = mapped_column(String(64))
    source_text: Mapped[str] = mapped_column(Text)
    target_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserProgress(Base):
    __tablename__ = "user_progress"
    __table_args__ = (
        CheckConstraint("item_type IN ('sentence', 'word', 'lesson')", name="valid_item_type"),
        CheckConstraint("mastery_level BETWEEN 0 AND 5", name="valid_mastery"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    item_type: Mapped[str] = mapped_column(String(16), primary_key=True)
    item_key: Mapped[str] = mapped_column(String(255), primary_key=True)
    attempts: Mapped[int] = mapped_column(Integer)
    correct_count: Mapped[int] = mapped_column(Integer)
    mastery_level: Mapped[int] = mapped_column(SmallInteger)
    last_attempted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    next_review_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Concept(Base):
    __tablename__ = "concepts"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    emoji: Mapped[str | None] = mapped_column(String(16))
    image_url: Mapped[str | None] = mapped_column(Text)
    image_approved: Mapped[bool] = mapped_column(Boolean, server_default=false())

    terms: Mapped[list["ConceptTerm"]] = relationship(back_populates="concept", cascade="all, delete-orphan")


class ConceptTerm(Base):
    __tablename__ = "concept_terms"

    concept_id: Mapped[int] = mapped_column(Integer, ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True)
    lang: Mapped[str] = mapped_column(String(8), primary_key=True)
    text: Mapped[str] = mapped_column(Text)

    concept: Mapped[Concept] = relationship(back_populates="terms")


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    title: Mapped[str] = mapped_column(String(100))
    position: Mapped[int] = mapped_column(Integer, unique=True)


class LessonConcept(Base):
    __tablename__ = "lesson_concepts"

    lesson_id: Mapped[int] = mapped_column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True)
    concept_id: Mapped[int] = mapped_column(Integer, ForeignKey("concepts.id", ondelete="CASCADE"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer)


class LessonSentence(Base):
    __tablename__ = "lesson_sentences"

    lesson_id: Mapped[int] = mapped_column(Integer, ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True)
    sentence_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("sentences.id", ondelete="CASCADE"), primary_key=True)
    concept_id: Mapped[int] = mapped_column(Integer, ForeignKey("concepts.id", ondelete="CASCADE"), index=True)


class UserSettings(Base):
    __tablename__ = "user_settings"
    __table_args__ = (
        CheckConstraint("native_lang <> learning_lang", name="different_languages"),
        CheckConstraint("level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')", name="known_level"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    native_lang: Mapped[str] = mapped_column(String(8))
    learning_lang: Mapped[str] = mapped_column(String(8))
    level: Mapped[str | None] = mapped_column(String(2))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Mnemonic(Base):
    __tablename__ = "mnemonics"
    __table_args__ = (
        UniqueConstraint("user_id", "concept_id", "learning_lang", "native_lang", name="uq_mnemonic_per_user_word"),
        CheckConstraint("length(text) > 0", name="text_not_empty"),
        CheckConstraint("native_lang <> learning_lang", name="different_languages"),
        Index("ix_mnemonics_user_created", "user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    concept_id: Mapped[int] = mapped_column(Integer, ForeignKey("concepts.id", ondelete="CASCADE"))
    learning_lang: Mapped[str] = mapped_column(String(8))
    native_lang: Mapped[str] = mapped_column(String(8))
    text: Mapped[str] = mapped_column(Text)
    image_path: Mapped[str | None] = mapped_column(Text)
    text_model: Mapped[str | None] = mapped_column(String(200))
    image_model: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    concept: Mapped[Concept] = relationship()


class ImageGeneration(Base):
    __tablename__ = "image_generations"
    __table_args__ = (Index("ix_image_generations_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    model: Mapped[str] = mapped_column(String(200))
    succeeded: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (Index("ix_idempotency_keys_created", "created_at"),)

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    operation: Mapped[str] = mapped_column(String(64))
    fingerprint: Mapped[str] = mapped_column(String(64))
    result_id: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class LearningOutcome(Base):
    __tablename__ = "learning_outcomes"
    __table_args__ = (Index("ix_learning_outcomes_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    agent: Mapped[str] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(32))
    lesson_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("lessons.id", ondelete="SET NULL"))
    concept_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("concepts.id", ondelete="SET NULL"))
    detail: Mapped[dict] = mapped_column(JSONB)
    model: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AiUsage(Base):
    __tablename__ = "ai_usage"
    __table_args__ = (Index("ix_ai_usage_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    agent: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(200))
    succeeded: Mapped[bool] = mapped_column(Boolean)
    tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
