from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, Field, StringConstraints

from langapp.api.deps import CurrentUser, ProgressRepoDep

router = APIRouter(prefix="/progress", tags=["progress"])

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class SentenceResult(BaseModel):
    exercise_id: int = Field(gt=0)
    correct: bool


class WordResult(BaseModel):
    lemma: ShortText
    language: Annotated[str, StringConstraints(pattern=r"^[a-z]{2,3}-[a-z]{2,10}$")] = "en-es"
    correct: bool


@router.post("/sentence")
def save_sentence_result(body: SentenceResult, user: CurrentUser, repo: ProgressRepoDep) -> dict:
    row = repo.record(user.id, "sentence", str(body.exercise_id), body.correct)
    repo.session.commit()
    return {"success": True, "mastery": row.mastery_level, "next_review_at": row.next_review_at.isoformat()}


@router.post("/word")
def save_word_result(body: WordResult, user: CurrentUser, repo: ProgressRepoDep) -> dict:
    row = repo.record(user.id, "word", f"{body.language}:{body.lemma}", body.correct)
    repo.session.commit()
    return {"success": True, "mastery": row.mastery_level, "next_review_at": row.next_review_at.isoformat()}


@router.get("/sentences")
def sentence_progress(user: CurrentUser, repo: ProgressRepoDep) -> dict:
    return {
        "progress": {
            row.item_key: {
                "attempts": row.attempts,
                "correct": row.correct_count,
                "mastery": row.mastery_level,
                "last_attempted": row.last_attempted_at.isoformat(),
                "next_review": row.next_review_at.isoformat(),
            }
            for row in repo.for_user(user.id, "sentence")
        }
    }
