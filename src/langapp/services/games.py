from dataclasses import dataclass

from langapp.db.models import Audio, Sentence, WordPair
from langapp.services.word_tagger import tag_word

TRAILING_PUNCTUATION = ".!?…"
WORD_MATCH_PAIRS = {"en-es", "en-ru", "es-ru", "es-emojis"}
IMAGE_MODES = {"en-image", "es-image", "image-en", "image-es"}
PROMPT_LANGS = {"es": "spa", "ru": "rus"}


class UnknownGameMode(Exception):
    pass


@dataclass(frozen=True)
class Token:
    form: str
    position: int
    word_type: str


def tokenize(text: str) -> list[Token]:
    words = text.split()
    if words:
        words[-1] = words[-1].rstrip(TRAILING_PUNCTUATION) or words[-1]
    words = [word for word in words if word]
    return [Token(form=word, position=index, word_type=tag_word(word)) for index, word in enumerate(words)]


def estimate_level(word_count: int) -> str:
    if word_count <= 5:
        return "A1"
    if word_count <= 8:
        return "A2"
    return "B1"


def pick_audio(audios: list[Audio]) -> Audio | None:
    return min(audios, key=lambda audio: audio.id) if audios else None


def sentence_exercise(sentence: Sentence, translations: dict[str, list[str]]) -> dict:
    tokens = tokenize(sentence.text)
    audio = pick_audio(sentence.audios)
    return {
        "id": sentence.id,
        "full_text": sentence.text,
        "translation": {short: (translations.get(code) or [None])[0] for short, code in PROMPT_LANGS.items()},
        "words": [{"form": t.form, "position": t.position, "word_type": t.word_type} for t in tokens],
        "level": estimate_level(len(tokens)),
        "audio": None
        if audio is None
        else {"url": audio.download_url, "author": audio.author, "license": audio.license, "attribution_url": audio.attribution_url},
    }


def check_word_match_mode(language: str) -> str:
    if language in IMAGE_MODES:
        raise UnknownGameMode("Image modes are not available in this version yet.")
    if language not in WORD_MATCH_PAIRS:
        raise UnknownGameMode(f"Unknown language: {language}")
    return language


def word_match_round(pairs: list[WordPair]) -> dict:
    return {
        "pairs": [{"question": p.source_text, "answer": p.target_text} for p in pairs],
        "imageMode": None,
    }
