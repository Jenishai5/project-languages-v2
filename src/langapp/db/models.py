from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    String,
    Text,
    false,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Sentence(Base):
    __tablename__ = "sentences"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    lang: Mapped[str] = mapped_column(String(8), index=True)
    text: Mapped[str] = mapped_column(Text)
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
