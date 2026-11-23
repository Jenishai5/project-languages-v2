from datetime import datetime

from pydantic import BaseModel, ConfigDict

from langapp.db.models import Sentence


class TranslationOut(BaseModel):
    id: int
    lang: str
    text: str
    is_direct: bool


class SentenceOut(BaseModel):
    id: int
    lang: str
    text: str
    license: str | None
    owner: str | None
    translations: list[TranslationOut]

    @classmethod
    def from_model(cls, sentence: Sentence, translation_lang: str | None = None) -> "SentenceOut":
        translations = [
            TranslationOut(
                id=link.translation.id,
                lang=link.translation.lang,
                text=link.translation.text,
                is_direct=link.is_direct,
            )
            for link in sentence.links
            if translation_lang is None or link.translation.lang == translation_lang
        ]
        return cls(
            id=sentence.id,
            lang=sentence.lang,
            text=sentence.text,
            license=sentence.license,
            owner=sentence.owner,
            translations=sorted(translations, key=lambda item: (item.lang, item.id)),
        )


class SentencePage(BaseModel):
    items: list[SentenceOut]
    total: int
    limit: int
    offset: int


class ImportRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_lang: str
    target_langs: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    pages: int
    fetched: int
    inserted: int
    updated: int
    skipped: int
    error: str | None


class HealthOut(BaseModel):
    status: str
    database: str
    sentences: int
