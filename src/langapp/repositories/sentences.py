from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, aliased, selectinload

from langapp.db.models import Sentence, SentenceLink
from langapp.domain import ParsedSentence, ParsedTranslation

UPDATABLE_COLUMNS = ("lang", "text", "license", "owner", "is_unapproved")
REGEX_SPECIAL = set(r"\.^$*+?()[]{}|")


@dataclass(frozen=True)
class UpsertStats:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0


def whole_word_pattern(search: str) -> str:
    escaped = "".join(f"\\{char}" if char in REGEX_SPECIAL else char for char in search.strip())
    return rf"\m{escaped}\M"


def _row(item: ParsedSentence | ParsedTranslation) -> dict:
    return {
        "id": item.id,
        "lang": item.lang,
        "text": item.text,
        "license": item.license,
        "owner": item.owner,
        "is_unapproved": item.is_unapproved,
    }


class SentenceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_many(self, sentences: Sequence[ParsedSentence]) -> UpsertStats:
        rows: dict[int, dict] = {}
        links: dict[tuple[int, int], bool] = {}
        for sentence in sentences:
            rows[sentence.id] = _row(sentence)
        for sentence in sentences:
            for translation in sentence.translations:
                rows.setdefault(translation.id, _row(translation))
                links[(sentence.id, translation.id)] = translation.is_direct

        if not rows:
            return UpsertStats()

        existing_ids = set(
            self.session.scalars(select(Sentence.id).where(Sentence.id.in_(rows.keys())))
        )

        stmt = insert(Sentence).values(list(rows.values()))
        changed = or_(
            *(getattr(Sentence, column).is_distinct_from(stmt.excluded[column]) for column in UPDATABLE_COLUMNS)
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[Sentence.id],
            set_={**{column: stmt.excluded[column] for column in UPDATABLE_COLUMNS}, "updated_at": func.now()},
            where=changed,
        ).returning(Sentence.id)
        written_ids = set(self.session.scalars(stmt))

        if links:
            link_stmt = insert(SentenceLink).values(
                [
                    {"sentence_id": sentence_id, "translation_id": translation_id, "is_direct": is_direct}
                    for (sentence_id, translation_id), is_direct in links.items()
                ]
            )
            link_stmt = link_stmt.on_conflict_do_update(
                index_elements=[SentenceLink.sentence_id, SentenceLink.translation_id],
                set_={"is_direct": link_stmt.excluded.is_direct},
                where=SentenceLink.is_direct.is_distinct_from(link_stmt.excluded.is_direct),
            )
            self.session.execute(link_stmt)

        inserted = len(written_ids - existing_ids)
        updated = len(written_ids & existing_ids)
        return UpsertStats(inserted=inserted, updated=updated, unchanged=len(rows) - inserted - updated)

    def get(self, sentence_id: int) -> Sentence | None:
        stmt = select(Sentence).where(Sentence.id == sentence_id).options(self._with_translations())
        return self.session.scalars(stmt).first()

    def list(
        self,
        lang: str | None = None,
        translation_lang: str | None = None,
        search: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[Sentence], int]:
        filters = self._filters(lang, translation_lang, search)
        total = self.session.scalar(select(func.count()).select_from(Sentence).where(*filters)) or 0
        stmt = (
            select(Sentence)
            .where(*filters)
            .order_by(Sentence.id)
            .limit(limit)
            .offset(offset)
            .options(self._with_translations())
        )
        return list(self.session.scalars(stmt)), total

    def random(self, lang: str, translation_lang: str | None = None) -> Sentence | None:
        stmt = (
            select(Sentence)
            .where(*self._filters(lang, translation_lang, None))
            .order_by(func.random())
            .limit(1)
            .options(self._with_translations())
        )
        return self.session.scalars(stmt).first()

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(Sentence)) or 0

    @staticmethod
    def _with_translations():
        return selectinload(Sentence.links).selectinload(SentenceLink.translation)

    @staticmethod
    def _filters(lang: str | None, translation_lang: str | None, search: str | None) -> list:
        filters = []
        if lang:
            filters.append(Sentence.lang == lang)
        if search:
            filters.append(Sentence.text.op("~*")(whole_word_pattern(search)))
        if translation_lang:
            target = aliased(Sentence)
            filters.append(
                exists()
                .where(SentenceLink.sentence_id == Sentence.id)
                .where(SentenceLink.translation_id == target.id)
                .where(target.lang == translation_lang)
            )
        return filters
