from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from langapp.db.models import Concept, ConceptTerm
from langapp.domain import ParsedConcept


class ConceptRepository:
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

    def all_terms(self, lang: str) -> list[str]:
        return list(self.session.scalars(select(ConceptTerm.text).where(ConceptTerm.lang == lang)))

    def languages(self) -> dict[str, int]:
        stmt = select(ConceptTerm.lang, func.count()).group_by(ConceptTerm.lang)
        return {lang: count for lang, count in self.session.execute(stmt)}

    def set_image(self, slug: str, image_url: str, approved: bool) -> bool:
        concept = self.session.scalars(select(Concept).where(Concept.slug == slug)).first()
        if concept is None:
            return False
        concept.image_url = image_url
        concept.image_approved = approved
        return True

    def get_with_terms(self, concept_id: int) -> Concept | None:
        stmt = select(Concept).options(selectinload(Concept.terms)).where(Concept.id == concept_id)
        return self.session.scalars(stmt).first()

    def with_terms_by_slugs(self, slugs: Sequence[str]) -> list[Concept]:
        if not slugs:
            return []
        stmt = select(Concept).options(selectinload(Concept.terms)).where(Concept.slug.in_(slugs))
        return list(self.session.scalars(stmt))
