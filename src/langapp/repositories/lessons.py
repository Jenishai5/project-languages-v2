from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import delete, func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from langapp.db.models import Concept, ConceptTerm, Lesson, LessonConcept, LessonSentence, Sentence, UserSettings
from langapp.ingestion.concepts import ParsedConcept, PlannedLesson


@dataclass(frozen=True)
class LessonWord:
    lesson_id: int
    concept_id: int
    slug: str
    term: str


class LessonRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_concepts(self, concepts: Sequence[ParsedConcept]) -> dict[str, int]:
        if not concepts:
            return {}
        stmt = insert(Concept).values(
            [{"slug": c.slug, "category": c.category, "emoji": c.emoji} for c in concepts]
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Concept.slug],
            set_={"category": stmt.excluded.category, "emoji": stmt.excluded.emoji},
        ).returning(Concept.slug, Concept.id)
        ids = {slug: concept_id for slug, concept_id in self.session.execute(stmt)}

        term_rows = [
            {"concept_id": ids[c.slug], "lang": lang, "text": text}
            for c in concepts
            for lang, text in c.terms.items()
        ]
        if term_rows:
            terms = insert(ConceptTerm).values(term_rows)
            terms = terms.on_conflict_do_update(
                index_elements=[ConceptTerm.concept_id, ConceptTerm.lang],
                set_={"text": terms.excluded.text},
                where=ConceptTerm.text.is_distinct_from(terms.excluded.text),
            )
            self.session.execute(terms)
        return ids

    def upsert_lessons(self, lessons: Sequence[PlannedLesson], concept_ids: dict[str, int]) -> int:
        if not lessons:
            return 0
        slugs = [lesson.slug for lesson in lessons]
        self.session.execute(delete(Lesson).where(Lesson.slug.not_in(slugs)))
        self.session.execute(update(Lesson).values(position=-Lesson.position))
        stmt = insert(Lesson).values(
            [{"slug": lesson.slug, "title": lesson.title, "position": lesson.position} for lesson in lessons]
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Lesson.slug],
            set_={"title": stmt.excluded.title, "position": stmt.excluded.position},
        ).returning(Lesson.slug, Lesson.id)
        lesson_ids = {slug: lesson_id for slug, lesson_id in self.session.execute(stmt)}

        link_rows = [
            {"lesson_id": lesson_ids[lesson.slug], "concept_id": concept_ids[slug], "position": index}
            for lesson in lessons
            for index, slug in enumerate(lesson.concept_slugs)
            if slug in concept_ids
        ]
        self.session.execute(delete(LessonConcept))
        if link_rows:
            self.session.execute(insert(LessonConcept).values(link_rows))
        linked = select(LessonConcept.lesson_id, LessonConcept.concept_id)
        self.session.execute(
            delete(LessonSentence).where(tuple_(LessonSentence.lesson_id, LessonSentence.concept_id).not_in(linked))
        )
        return len(lesson_ids)

    def words_to_fill(self, learning_lang: str, first_lessons: int | None) -> list[LessonWord]:
        lessons = select(Lesson.id).order_by(Lesson.position)
        if first_lessons is not None:
            lessons = lessons.limit(first_lessons)
        stmt = (
            select(LessonConcept.lesson_id, Concept.id, Concept.slug, ConceptTerm.text)
            .join(Concept, Concept.id == LessonConcept.concept_id)
            .join(ConceptTerm, (ConceptTerm.concept_id == Concept.id) & (ConceptTerm.lang == learning_lang))
            .join(Lesson, Lesson.id == LessonConcept.lesson_id)
            .where(LessonConcept.lesson_id.in_(lessons.scalar_subquery()))
            .order_by(Lesson.position, LessonConcept.position)
        )
        return [LessonWord(*row) for row in self.session.execute(stmt)]

    def all_terms(self, lang: str) -> list[str]:
        return list(self.session.scalars(select(ConceptTerm.text).where(ConceptTerm.lang == lang)))

    def add_lesson_sentences(self, rows: Sequence[tuple[int, int, int]]) -> int:
        if not rows:
            return 0
        stmt = insert(LessonSentence).values(
            [{"lesson_id": lesson_id, "sentence_id": sentence_id, "concept_id": concept_id} for lesson_id, sentence_id, concept_id in rows]
        )
        stmt = stmt.on_conflict_do_nothing().returning(LessonSentence.sentence_id)
        return len(list(self.session.scalars(stmt)))

    def languages(self) -> dict[str, int]:
        stmt = select(ConceptTerm.lang, func.count()).group_by(ConceptTerm.lang)
        return {lang: count for lang, count in self.session.execute(stmt)}

    def list_lessons(self, learning_lang: str, native_lang: str) -> list[dict]:
        learning_term = select(ConceptTerm.concept_id).where(ConceptTerm.lang == learning_lang)
        native_term = select(ConceptTerm.concept_id).where(ConceptTerm.lang == native_lang)
        word_counts = (
            select(LessonConcept.lesson_id, func.count().label("words"))
            .where(LessonConcept.concept_id.in_(learning_term), LessonConcept.concept_id.in_(native_term))
            .group_by(LessonConcept.lesson_id)
            .subquery()
        )
        sentence_counts = (
            select(LessonSentence.lesson_id, func.count().label("sentences"))
            .join(Sentence, Sentence.id == LessonSentence.sentence_id)
            .where(Sentence.lang == learning_lang)
            .group_by(LessonSentence.lesson_id)
            .subquery()
        )
        stmt = (
            select(
                Lesson.id,
                Lesson.slug,
                Lesson.title,
                Lesson.position,
                func.coalesce(word_counts.c.words, 0),
                func.coalesce(sentence_counts.c.sentences, 0),
            )
            .outerjoin(word_counts, word_counts.c.lesson_id == Lesson.id)
            .outerjoin(sentence_counts, sentence_counts.c.lesson_id == Lesson.id)
            .order_by(Lesson.position)
        )
        return [
            {"id": id_, "slug": slug, "title": title, "position": position, "word_count": words, "sentence_count": sentences}
            for id_, slug, title, position, words, sentences in self.session.execute(stmt)
        ]

    def get_lesson(self, lesson_id: int) -> Lesson | None:
        return self.session.get(Lesson, lesson_id)

    def lesson_concepts(self, lesson_id: int) -> list[Concept]:
        stmt = (
            select(Concept)
            .join(LessonConcept, LessonConcept.concept_id == Concept.id)
            .where(LessonConcept.lesson_id == lesson_id)
            .order_by(LessonConcept.position)
            .options(selectinload(Concept.terms))
        )
        return list(self.session.scalars(stmt))

    def lesson_sentences(self, lesson_id: int, learning_lang: str) -> list[tuple[Sentence, int]]:
        stmt = (
            select(Sentence, LessonSentence.concept_id)
            .join(LessonSentence, LessonSentence.sentence_id == Sentence.id)
            .where(LessonSentence.lesson_id == lesson_id, Sentence.lang == learning_lang)
            .order_by(Sentence.word_count, Sentence.id)
            .options(selectinload(Sentence.audios))
        )
        return [(sentence, concept_id) for sentence, concept_id in self.session.execute(stmt)]

    def set_image(self, slug: str, image_url: str, approved: bool) -> bool:
        concept = self.session.scalars(select(Concept).where(Concept.slug == slug)).first()
        if concept is None:
            return False
        concept.image_url = image_url
        concept.image_approved = approved
        return True

    def get_settings(self, user_id: uuid.UUID) -> UserSettings | None:
        return self.session.get(UserSettings, user_id)

    def save_settings(self, user_id: uuid.UUID, native_lang: str, learning_lang: str) -> UserSettings:
        stmt = insert(UserSettings).values(user_id=user_id, native_lang=native_lang, learning_lang=learning_lang)
        stmt = stmt.on_conflict_do_update(
            index_elements=[UserSettings.user_id],
            set_={"native_lang": native_lang, "learning_lang": learning_lang, "updated_at": func.now()},
        ).returning(UserSettings)
        return self.session.scalars(stmt).one()
