import unicodedata

from pydantic import BaseModel, ConfigDict, Field, field_validator

LANG_PATTERN = r"^[a-z]{3,4}$"


class _SentenceFields(BaseModel):
    model_config = ConfigDict(frozen=True, extra="ignore")

    id: int = Field(gt=0)
    lang: str = Field(pattern=LANG_PATTERN)
    text: str
    license: str | None = None
    owner: str | None = None
    is_unapproved: bool = False

    @field_validator("text", mode="before")
    @classmethod
    def clean_text(cls, value: object) -> str:
        if not isinstance(value, str):
            raise ValueError("text must be a string")
        cleaned = " ".join(unicodedata.normalize("NFC", value).split())
        if not cleaned:
            raise ValueError("text is empty")
        return cleaned

    @field_validator("lang", mode="before")
    @classmethod
    def clean_lang(cls, value: object) -> object:
        return value.strip().lower() if isinstance(value, str) else value

    @field_validator("license", "owner", mode="before")
    @classmethod
    def blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("is_unapproved", mode="before")
    @classmethod
    def null_to_false(cls, value: object) -> object:
        return False if value is None else value


class ParsedTranslation(_SentenceFields):
    is_direct: bool = False


class ParsedSentence(_SentenceFields):
    translations: tuple[ParsedTranslation, ...] = ()
