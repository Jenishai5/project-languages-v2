from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import distinct_on, insert
from sqlalchemy.orm import Session

from langapp.db.models import WordPair
from langapp.domain import ParsedWordPair


class WordPairRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def upsert_many(self, pairs: Sequence[ParsedWordPair]) -> int:
        if not pairs:
            return 0
        stmt = insert(WordPair).values(
            [
                {"pair": p.pair, "category": p.category, "source_text": p.source_text, "target_text": p.target_text}
                for p in pairs
            ]
        )
        stmt = stmt.on_conflict_do_nothing(constraint="uq_word_pair").returning(WordPair.id)
        return len(list(self.session.scalars(stmt)))

    def random_round(self, pair: str, limit: int) -> list[WordPair]:
        one_per_question = (
            select(WordPair)
            .where(WordPair.pair == pair)
            .ext(distinct_on(WordPair.source_text))
            .order_by(WordPair.source_text, func.random())
            .subquery()
        )
        stmt = select(WordPair).join(one_per_question, WordPair.id == one_per_question.c.id).order_by(func.random()).limit(limit)
        rows = list(self.session.scalars(stmt))
        answers: set[str] = set()
        unique_answers = []
        for row in rows:
            if row.target_text in answers:
                continue
            answers.add(row.target_text)
            unique_answers.append(row)
        return unique_answers

    def pairs_available(self) -> dict[str, int]:
        stmt = select(WordPair.pair, func.count()).group_by(WordPair.pair)
        return {pair: count for pair, count in self.session.execute(stmt)}
