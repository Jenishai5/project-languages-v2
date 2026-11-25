import unicodedata
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

LANG_PATTERN = r"^[a-z]{3,4}$"
PAIR_PATTERN = r"^[a-z]{2,3}-[a-z]{2,10}$"


class ItemType(StrEnum):
    SENTENCE = "sentence"
    WORD = "word"
    LESSON = "lesson"


def clean_text(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("text must be a string")
    cleaned = " ".join(unicodedata.normalize("NFC", value).split())
    if not cleaned:
        raise ValueError("text is empty")
    return cleaned


def blank_to_none(value: object) -> object:
    if isinstance(value, str):
        return value.strip() or None
    return value


class ParsedAudio(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")

    id: int = Field(gt=0)
    download_url: HttpUrl
    author: str | None = None
    license: str | None = None
    attribution_url: str | None = None
    created: datetime | None = None
    modified: datetime | None = None

    @field_validator("author", "license", "attribution_url", mode="before")
    @classmethod
    def optional_text(cls, value: object) -> object:
        return blank_to_none(value)

    @field_validator("created", "modified", mode="after")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("timestamp has no time zone")
        return value


class _SentenceFields(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")

    id: int = Field(gt=0)
    lang: str = Field(pattern=LANG_PATTERN)
    text: str
    license: str | None = None
    owner: str | None = None
    is_unapproved: bool = False
    audios: tuple[ParsedAudio, ...] = ()

    @field_validator("text", mode="before")
    @classmethod
    def validate_text(cls, value: object) -> str:
        return clean_text(value)

    @field_validator("lang", mode="before")
    @classmethod
    def clean_lang(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("license", "owner", mode="before")
    @classmethod
    def optional_text(cls, value: object) -> object:
        return blank_to_none(value)

    @field_validator("is_unapproved", mode="before")
    @classmethod
    def null_to_false(cls, value: object) -> object:
        return False if value is None else value

    @property
    def word_count(self) -> int:
        return len(self.text.split())


class ParsedTranslation(_SentenceFields):
    is_direct: bool = False


class ParsedSentence(_SentenceFields):
    translations: tuple[ParsedTranslation, ...] = ()


class ParsedWordPair(BaseModel):
    model_config = ConfigDict(frozen=True)

    pair: str = Field(pattern=PAIR_PATTERN)
    category: str | None = None
    source_text: str
    target_text: str

    @field_validator("source_text", "target_text", mode="before")
    @classmethod
    def validate_text(cls, value: object) -> str:
        return clean_text(value)

    @field_validator("category", mode="before")
    @classmethod
    def optional_category(cls, value: object) -> object:
        return blank_to_none(value)


@dataclass
class ParsedConcept:
    slug: str
    category: str
    terms: dict[str, str] = field(default_factory=dict)
    emoji: str | None = None


@dataclass(frozen=True)
class PlannedLesson:
    slug: str
    title: str
    position: int
    concept_slugs: tuple[str, ...]


@dataclass(frozen=True)
class Page:
    payload: dict
    next_url: str | None


@dataclass(frozen=True)
class ChatReply:
    text: str
    model: str


@dataclass(frozen=True)
class GeneratedImage:
    data: bytes
    media_type: str
    model: str
