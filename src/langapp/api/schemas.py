from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from langapp.db.models import Sentence
from langapp.domain import LANG_PATTERN, PAIR_PATTERN


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


ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
LangCode = Annotated[str, StringConstraints(pattern=LANG_PATTERN)]


class ErrorOut(BaseModel):
    detail: str


class LanguageSettingsIn(BaseModel):
    native_lang: LangCode
    learning_lang: LangCode


class LanguageSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    native_lang: str
    learning_lang: str


class SentenceResultIn(BaseModel):
    exercise_id: int = Field(gt=0)
    correct: bool


class WordResultIn(BaseModel):
    lemma: ShortText
    language: Annotated[str, StringConstraints(pattern=PAIR_PATTERN)] = "en-es"
    correct: bool


class LessonResultIn(BaseModel):
    lesson_id: int = Field(gt=0)
    correct: bool


class ProgressSavedOut(BaseModel):
    success: bool = True
    mastery: int
    next_review_at: datetime


class SentenceProgressOut(BaseModel):
    attempts: int
    correct: int
    mastery: int
    last_attempted: datetime
    next_review: datetime


class LessonProgressOut(BaseModel):
    attempts: int
    correct: int
    mastery: int


class SentenceProgressMap(BaseModel):
    progress: dict[str, SentenceProgressOut]


class LessonProgressMap(BaseModel):
    progress: dict[str, LessonProgressOut]


class RecordingOut(BaseModel):
    url: str
    author: str | None
    license: str | None
    attribution_url: str | None


class TileOut(BaseModel):
    form: str
    position: int
    word_type: str


class BuilderSentenceOut(BaseModel):
    id: int
    full_text: str
    translation: dict[str, str | None]
    words: list[TileOut]
    level: str
    audio: RecordingOut | None


class BuilderRoundOut(BaseModel):
    sentences: list[BuilderSentenceOut]


class WordPairOut(BaseModel):
    question: str
    answer: str


class WordMatchOut(BaseModel):
    pairs: list[WordPairOut]
    imageMode: str | None = None


class LanguageOut(BaseModel):
    code: str
    name: str
    words: int


class LanguagesOut(BaseModel):
    languages: list[LanguageOut]


class LessonSummaryOut(BaseModel):
    id: int
    slug: str
    title: str
    position: int
    word_count: int
    sentence_count: int


class LessonListOut(BaseModel):
    learning: str
    native: str
    lessons: list[LessonSummaryOut]


class WordCardOut(BaseModel):
    concept_id: int
    slug: str
    word: str
    translation: str
    emoji: str | None
    image_url: str | None


class ShuffleSentenceOut(BaseModel):
    id: int
    concept_slug: str
    full_text: str
    prompt: str
    words: list[TileOut]
    level: str
    audio: RecordingOut | None


class PictureRoundOut(BaseModel):
    slug: str
    emoji: str | None
    image_url: str | None
    options: list[str]
    answer: str


class LessonDetailOut(BaseModel):
    id: int
    slug: str
    title: str
    position: int
    learning: str
    native: str
    words: list[WordCardOut]
    sentences: list[ShuffleSentenceOut]
    pictures: list[PictureRoundOut]


class MnemonicIn(BaseModel):
    concept_id: int = Field(gt=0)
    learning: LangCode
    native: LangCode
    sentence: str = Field(min_length=1, max_length=500)


class MnemonicOut(BaseModel):
    id: int
    concept_id: int
    slug: str
    word: str
    translation: str
    emoji: str | None
    sentence: str
    masked_sentence: str
    image_url: str | None
    created_at: datetime


class MnemonicListOut(BaseModel):
    mnemonics: list[MnemonicOut]
    daily_limit: int
    remaining_today: int
    pictures_enabled: bool


class GrammarCheckIn(BaseModel):
    sentence_id: int
    answer: list[Annotated[str, Field(min_length=1, max_length=60)]] = Field(min_length=1, max_length=40)
    learning: str = Field(pattern=LANG_PATTERN)
    native: str = Field(pattern=LANG_PATTERN)


class MistakeOut(BaseModel):
    wrong: str
    right: str
    why: str


class GrammarCheckOut(BaseModel):
    correct: bool
    available: bool
    explanation: str | None
    mistakes: list[MistakeOut]
    tip: str | None
    cached: bool
    message: str | None
    remaining_today: int


class WordHelpIn(BaseModel):
    concept_id: int
    learning: str = Field(pattern=LANG_PATTERN)
    native: str = Field(pattern=LANG_PATTERN)


class ExampleOut(BaseModel):
    sentence: str
    translation: str


class WordHelpOut(BaseModel):
    concept_id: int
    word: str
    translation: str
    available: bool
    examples: list[ExampleOut]
    synonyms: list[str]
    antonyms: list[str]
    tip: str | None
    cached: bool
    message: str | None
    remaining_today: int


class WeakWordOut(BaseModel):
    concept_id: int
    slug: str
    word: str
    translation: str
    emoji: str | None
    attempts: int
    correct: int


class WeakWordsOut(BaseModel):
    words: list[WeakWordOut]


class LessonWordResultIn(BaseModel):
    concept_id: int
    learning: str = Field(pattern=LANG_PATTERN)
    correct: bool
