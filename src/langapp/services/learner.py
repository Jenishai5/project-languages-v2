import uuid

from langapp.domain import ItemType
from langapp.errors import NotFound
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.lessons import LessonRepository
from langapp.repositories.progress import ProgressRepository
from langapp.services.lessons import word_cards
from langapp.services.progress import word_key


class LearnerService:
    def __init__(self, progress: ProgressRepository, concepts: ConceptRepository, lessons: LessonRepository) -> None:
        self._progress = progress
        self._concepts = concepts
        self._lessons = lessons

    def record_word(self, user_id: uuid.UUID, concept_id: int, learning: str, correct: bool) -> dict:
        concept = self._concepts.get_with_terms(concept_id)
        if concept is None or not any(term.lang == learning for term in concept.terms):
            raise NotFound("Word not found.")
        row = self._progress.record(user_id, ItemType.WORD, word_key(learning, concept.slug), correct)
        return {"mastery": row.mastery_level, "next_review_at": row.next_review_at}

    def weak_words(
        self, user_id: uuid.UUID, learning: str, native: str, lesson_id: int | None = None, limit: int = 3
    ) -> list[dict]:
        prefix = word_key(learning, "")
        struggled = {
            row.item_key.removeprefix(prefix): row
            for row in self._progress.word_results(user_id, prefix)
            if row.correct_count < row.attempts
        }
        if lesson_id is not None:
            allowed = {concept.slug for concept in self._lessons.lesson_concepts(lesson_id)}
            struggled = {slug: row for slug, row in struggled.items() if slug in allowed}
        if not struggled:
            return []

        cards = {card["slug"]: card for card in word_cards(self._concepts.with_terms_by_slugs(list(struggled)), learning, native)}
        ranked = sorted(
            (slug for slug in struggled if slug in cards),
            key=lambda slug: (struggled[slug].correct_count / struggled[slug].attempts, -struggled[slug].attempts, slug),
        )
        return [
            {
                "concept_id": cards[slug]["concept_id"],
                "slug": slug,
                "word": cards[slug]["word"],
                "translation": cards[slug]["translation"],
                "emoji": cards[slug]["emoji"],
                "attempts": struggled[slug].attempts,
                "correct": struggled[slug].correct_count,
            }
            for slug in ranked[:limit]
        ]
