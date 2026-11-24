from langapp.db.models import Sentence
from langapp.errors import NotFound
from langapp.repositories.sentences import SentenceRepository


class SentenceService:
    def __init__(self, repo: SentenceRepository) -> None:
        self._repo = repo

    def search(
        self, lang: str | None, translation_lang: str | None, query: str | None, limit: int, offset: int
    ) -> tuple[list[Sentence], int]:
        return self._repo.list(lang, translation_lang, query, limit, offset)

    def random(self, lang: str, translation_lang: str | None) -> Sentence:
        sentence = self._repo.random(lang, translation_lang)
        if sentence is None:
            raise NotFound("No sentences match. Run the import first.")
        return sentence

    def get(self, sentence_id: int) -> Sentence:
        sentence = self._repo.get(sentence_id)
        if sentence is None:
            raise NotFound(f"Sentence {sentence_id} not found")
        return sentence
