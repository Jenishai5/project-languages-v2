from dataclasses import dataclass

from langapp.db.models import Audio, Sentence, WordPair
from langapp.errors import InvalidRequest, NotFound
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.word_pairs import WordPairRepository
from langapp.services.word_tagger import tag_word

TRAILING_PUNCTUATION = ".!?…"
WORD_MATCH_PAIRS = {"en-es", "en-ru", "es-ru", "es-emojis"}
IMAGE_MODES = {"en-image", "es-image", "image-en", "image-es"}
PROMPT_LANGS = {"es": "spa", "ru": "rus"}
BUILDER_LANG = "eng"
BUILDER_PROMPT_LANG = PROMPT_LANGS["es"]


class UnknownGameMode(InvalidRequest):
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


def recording_view(sentence: Sentence) -> dict | None:
    audio = pick_audio(sentence.audios)
    if audio is None:
        return None
    return {"url": audio.download_url, "author": audio.author, "license": audio.license, "attribution_url": audio.attribution_url}


def tiles_view(tokens: list[Token]) -> list[dict]:
    return [{"form": t.form, "position": t.position, "word_type": t.word_type} for t in tokens]


def sentence_exercise(sentence: Sentence, translations: dict[str, list[str]]) -> dict:
    tokens = tokenize(sentence.text)
    return {
        "id": sentence.id,
        "full_text": sentence.text,
        "translation": {short: (translations.get(code) or [None])[0] for short, code in PROMPT_LANGS.items()},
        "words": tiles_view(tokens),
        "level": estimate_level(len(tokens)),
        "audio": recording_view(sentence),
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


class GameService:
    def __init__(self, sentences: SentenceRepository, word_pairs: WordPairRepository) -> None:
        self._sentences = sentences
        self._word_pairs = word_pairs

    def builder_round(self, limit: int, max_words: int) -> list[dict]:
        sentences = self._sentences.random_for_builder(BUILDER_LANG, BUILDER_PROMPT_LANG, max_words, limit)
        if not sentences:
            raise NotFound("No sentences for the builder yet. Run: make import-builder")
        translations = self._sentences.translations_for([s.id for s in sentences], list(PROMPT_LANGS.values()))
        return [sentence_exercise(s, translations.get(s.id, {})) for s in sentences]

    def word_match(self, language: str, limit: int) -> dict:
        pairs = self._word_pairs.random_round(check_word_match_mode(language), limit)
        if not pairs:
            raise NotFound(f'No words for "{language}" yet. Run: make import-words')
        return word_match_round(pairs)
