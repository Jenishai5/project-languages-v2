import random

from langapp.db.models import Concept, Lesson, Sentence
from langapp.errors import NotFound
from langapp.ingestion.concepts import core_word
from langapp.repositories.lessons import LessonRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.services.games import estimate_level, recording_view, tiles_view, tokenize
from langapp.services.languages import LanguageCatalog
from langapp.services.word_tagger import bare_word

SENTENCES_PER_LESSON = 10
PICTURE_OPTIONS = 4

def _term(concept: Concept, lang: str) -> str | None:
    return next((t.text for t in concept.terms if t.lang == lang), None)


def pick_sentences(exercises: list[dict], limit: int, rng: random.Random | None = None) -> list[dict]:
    by_word: dict[str, list[dict]] = {}
    for exercise in exercises:
        by_word.setdefault(exercise["concept_slug"], []).append(exercise)
    queues = list(by_word.values())
    if rng is not None:
        rng.shuffle(queues)
        for queue in queues:
            rng.shuffle(queue)
    picked: list[dict] = []
    seen_texts: set[str] = set()
    while len(picked) < limit and any(queues):
        for queue in queues:
            while queue and queue[0]["full_text"] in seen_texts:
                queue.pop(0)
            if queue and len(picked) < limit:
                exercise = queue.pop(0)
                seen_texts.add(exercise["full_text"])
                picked.append(exercise)
    return picked


def picture_rounds(words: list[dict], rng: random.Random) -> list[dict]:
    if len(words) < 2:
        return []
    rounds = []
    for word in words:
        if not word["emoji"] and not word["image_url"]:
            continue
        others = sorted({w["word"] for w in words if w["word"] != word["word"]})
        options = rng.sample(others, k=min(PICTURE_OPTIONS - 1, len(others))) + [word["word"]]
        rng.shuffle(options)
        rounds.append(
            {
                "slug": word["slug"],
                "emoji": word["emoji"],
                "image_url": word["image_url"],
                "options": options,
                "answer": word["word"],
            }
        )
    return rounds


def word_cards(concepts: list[Concept], learning: str, native: str) -> list[dict]:
    cards = []
    for concept in concepts:
        term, translation = _term(concept, learning), _term(concept, native)
        if term is None or translation is None:
            continue
        cards.append(
            {
                "concept_id": concept.id,
                "slug": concept.slug,
                "word": term,
                "translation": translation,
                "emoji": concept.emoji,
                "image_url": concept.image_url if concept.image_approved else None,
            }
        )
    return cards


def lesson_nouns(words: list[dict], learning: str) -> set[str]:
    return {bare_word(core_word(part, learning)) for word in words for part in word["word"].split("/")}


def tag_lesson_nouns(tiles: list[dict], nouns: set[str]) -> list[dict]:
    return [
        {**tile, "word_type": "noun"} if not tile["word_type"] and bare_word(tile["form"]) in nouns else tile
        for tile in tiles
    ]


def shuffle_exercises(
    sentences: list[tuple[Sentence, int]],
    translations: dict[int, dict[str, list[str]]],
    slug_by_concept: dict[int, str],
    native: str,
    nouns: set[str] | None = None,
) -> list[dict]:
    exercises = []
    for sentence, concept_id in sentences:
        prompts = translations.get(sentence.id, {}).get(native)
        if not prompts or concept_id not in slug_by_concept:
            continue
        tokens = tokenize(sentence.text)
        exercises.append(
            {
                "id": sentence.id,
                "concept_slug": slug_by_concept[concept_id],
                "full_text": sentence.text,
                "prompt": prompts[0],
                "words": tag_lesson_nouns(tiles_view(tokens), nouns or set()),
                "level": estimate_level(len(tokens)),
                "audio": recording_view(sentence),
            }
        )
    return exercises


def lesson_view(
    lesson: Lesson,
    concepts: list[Concept],
    sentences: list[tuple[Sentence, int]],
    translations: dict[int, dict[str, list[str]]],
    learning: str,
    native: str,
    rng: random.Random | None = None,
) -> dict:
    rng = rng or random.Random()
    words = word_cards(concepts, learning, native)
    slug_by_concept = {word["concept_id"]: word["slug"] for word in words}
    exercises = shuffle_exercises(sentences, translations, slug_by_concept, native, lesson_nouns(words, learning))
    return {
        "id": lesson.id,
        "slug": lesson.slug,
        "title": lesson.title,
        "position": lesson.position,
        "learning": learning,
        "native": native,
        "words": words,
        "sentences": pick_sentences(exercises, SENTENCES_PER_LESSON, rng),
        "pictures": picture_rounds(words, rng),
    }


class LessonService:
    def __init__(
        self,
        lessons: LessonRepository,
        sentences: SentenceRepository,
        catalog: LanguageCatalog,
        rng: random.Random | None = None,
    ) -> None:
        self._lessons = lessons
        self._sentences = sentences
        self._catalog = catalog
        self._rng = rng or random.Random()

    def list(self, learning: str, native: str) -> list[dict]:
        self._catalog.ensure_pair(learning, native)
        return [lesson for lesson in self._lessons.list_lessons(learning, native) if lesson["word_count"] > 0]

    def detail(self, lesson_id: int, learning: str, native: str) -> dict:
        self._catalog.ensure_pair(learning, native)
        lesson = self._lessons.get_lesson(lesson_id)
        if lesson is None:
            raise NotFound(f"Lesson {lesson_id} not found")
        sentences = self._lessons.lesson_sentences(lesson_id, learning)
        translations = self._sentences.translations_for([s.id for s, _ in sentences], [native])
        concepts = self._lessons.lesson_concepts(lesson_id)
        return lesson_view(lesson, concepts, sentences, translations, learning, native, self._rng)
