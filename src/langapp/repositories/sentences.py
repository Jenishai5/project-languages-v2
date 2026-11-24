from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import exists, func, or_, select, union_all
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, aliased, selectinload

from langapp.db.models import Audio, Sentence, SentenceLink
from langapp.domain import ParsedSentence, ParsedTranslation

UPDATABLE_COLUMNS = ("lang", "text", "word_count", "license", "owner", "is_unapproved")
AUDIO_COLUMNS = ("sentence_id", "download_url", "author", "license", "attribution_url", "recorded_at", "source_modified_at")
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
        "word_count": item.word_count,
        "license": item.license,
        "owner": item.owner,
        "is_unapproved": item.is_unapproved,
    }


def _audio_rows(item: ParsedSentence | ParsedTranslation) -> list[dict]:
    return [
        {
            "id": audio.id,
            "sentence_id": item.id,
            "download_url": str(audio.download_url),
            "author": audio.author,
            "license": audio.license,
            "attribution_url": audio.attribution_url,
            "recorded_at": audio.created,
            "source_modified_at": audio.modified,
        }
        for audio in item.audios
    ]


class SentenceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_many(self, sentences: Sequence[ParsedSentence]) -> UpsertStats:
        rows: dict[int, dict] = {}
        audios: dict[int, dict] = {}
        links: dict[tuple[int, int], bool] = {}
        for sentence in sentences:
            rows[sentence.id] = _row(sentence)
        for sentence in sentences:
            for translation in sentence.translations:
                rows.setdefault(translation.id, _row(translation))
                links[(sentence.id, translation.id)] = translation.is_direct
            for item in (sentence, *sentence.translations):
                for audio in _audio_rows(item):
                    audios[audio["id"]] = audio

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

        if audios:
            audio_stmt = insert(Audio).values(list(audios.values()))
            audio_stmt = audio_stmt.on_conflict_do_update(
                index_elements=[Audio.id],
                set_={column: audio_stmt.excluded[column] for column in AUDIO_COLUMNS},
                where=or_(
                    *(getattr(Audio, column).is_distinct_from(audio_stmt.excluded[column]) for column in AUDIO_COLUMNS)
                ),
            )
            self.session.execute(audio_stmt)

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

    def random_for_builder(
        self, target_lang: str, prompt_lang: str, max_words: int, limit: int
    ) -> list[Sentence]:
        stmt = (
            select(Sentence)
            .where(
                Sentence.lang == target_lang,
                Sentence.word_count.between(2, max_words),
                Sentence.id.in_(self._ids_translated_into(prompt_lang)),
            )
            .order_by(func.random())
            .limit(limit)
            .options(selectinload(Sentence.audios))
        )
        return list(self.session.scalars(stmt))

    def translations_for(self, sentence_ids: Sequence[int], langs: Sequence[str]) -> dict[int, dict[str, list[str]]]:
        if not sentence_ids:
            return {}
        other = aliased(Sentence)
        outgoing = select(SentenceLink.sentence_id.label("source_id"), SentenceLink.translation_id.label("other_id")).where(
            SentenceLink.sentence_id.in_(sentence_ids)
        )
        incoming = select(SentenceLink.translation_id.label("source_id"), SentenceLink.sentence_id.label("other_id")).where(
            SentenceLink.translation_id.in_(sentence_ids)
        )
        pairs = union_all(outgoing, incoming).subquery()
        stmt = (
            select(pairs.c.source_id, other.lang, other.text)
            .join(other, other.id == pairs.c.other_id)
            .where(other.lang.in_(langs))
            .order_by(pairs.c.source_id, other.id)
        )
        result: dict[int, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
        for source_id, lang, text in self.session.execute(stmt):
            if text not in result[source_id][lang]:
                result[source_id][lang].append(text)
        return {key: dict(value) for key, value in result.items()}

    def count(self) -> int:
        return self.session.scalar(select(func.count()).select_from(Sentence)) or 0

    @staticmethod
    def _ids_translated_into(lang: str):
        other = aliased(Sentence)
        outgoing = (
            select(SentenceLink.sentence_id)
            .join(other, other.id == SentenceLink.translation_id)
            .where(other.lang == lang)
        )
        incoming = (
            select(SentenceLink.translation_id)
            .join(other, other.id == SentenceLink.sentence_id)
            .where(other.lang == lang)
        )
        return union_all(outgoing, incoming)

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
