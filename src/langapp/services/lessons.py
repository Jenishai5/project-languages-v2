import random

from langapp.db.models import Concept, Sentence
from langapp.services.games import estimate_level, pick_audio, tokenize

LANGUAGE_NAMES = {"eng": "English", "spa": "Spanish", "rus": "Russian", "cat": "Catalan"}


class LanguageNotSupported(Exception):
    pass


def language_list(counts: dict[str, int]) -> list[dict]:
    return [
        {"code": code, "name": LANGUAGE_NAMES.get(code, code), "words": count}
        for code, count in sorted(counts.items(), key=lambda item: -item[1])
    ]


def check_languages(learning: str, native: str, available: set[str]) -> None:
    if learning == native:
        raise LanguageNotSupported("Native and learning language must be different.")
    for code in (learning, native):
        if code not in available:
            raise LanguageNotSupported(f"Language '{code}' is not available yet.")


def _term(concept: Concept, lang: str) -> str | None:
    return next((t.text for t in concept.terms if t.lang == lang), None)


def _audio(sentence: Sentence) -> dict | None:
    audio = pick_audio(sentence.audios)
    if audio is None:
        return None
    return {"url": audio.download_url, "author": audio.author, "license": audio.license, "attribution_url": audio.attribution_url}


def lesson_view(
    lesson,
    concepts: list[Concept],
    sentences: list[tuple[Sentence, int]],
    translations: dict[int, dict[str, list[str]]],
    learning: str,
    native: str,
    rng: random.Random | None = None,
) -> dict:
    rng = rng or random.Random()
    words = []
    slug_by_id = {}
    for concept in concepts:
        term, translation = _term(concept, learning), _term(concept, native)
        if term is None or translation is None:
            continue
        slug_by_id[concept.id] = concept.slug
        words.append(
            {
                "concept_id": concept.id,
                "slug": concept.slug,
                "word": term,
                "translation": translation,
                "emoji": concept.emoji,
                "image_url": concept.image_url if concept.image_approved else None,
            }
        )

    exercises = []
    for sentence, concept_id in sentences:
        prompts = translations.get(sentence.id, {}).get(native)
        if not prompts or concept_id not in slug_by_id:
            continue
        tokens = tokenize(sentence.text)
        exercises.append(
            {
                "id": sentence.id,
                "concept_slug": slug_by_id[concept_id],
                "full_text": sentence.text,
                "prompt": prompts[0],
                "words": [{"form": t.form, "position": t.position, "word_type": t.word_type} for t in tokens],
                "level": estimate_level(len(tokens)),
                "audio": _audio(sentence),
            }
        )

    all_texts = [e["full_text"] for e in exercises]
    listening = []
    for exercise in exercises:
        if exercise["audio"] is None:
            continue
        others = [text for text in all_texts if text != exercise["full_text"]]
        options = rng.sample(others, k=min(2, len(others))) + [exercise["full_text"]]
        rng.shuffle(options)
        listening.append(
            {
                "sentence_id": exercise["id"],
                "audio": exercise["audio"],
                "options": options,
                "answer": exercise["full_text"],
            }
        )

    return {
        "id": lesson.id,
        "slug": lesson.slug,
        "title": lesson.title,
        "position": lesson.position,
        "learning": learning,
        "native": native,
        "words": words,
        "sentences": exercises,
        "listening": [item for item in listening if len(item["options"]) >= 2],
    }
