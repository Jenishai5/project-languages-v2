from fastapi import APIRouter

from langapp.api.deps import CurrentUser, LearnerServiceDep, ProgressServiceDep
from langapp.api.schemas import (
    ErrorOut,
    LessonProgressMap,
    LessonProgressOut,
    LessonResultIn,
    LessonWordResultIn,
    ProgressSavedOut,
    SentenceProgressMap,
    SentenceProgressOut,
    SentenceResultIn,
    WordResultIn,
)
from langapp.domain import ItemType
from langapp.services.progress import ProgressSnapshot, word_key

router = APIRouter(prefix="/progress", tags=["progress"])


def _saved(snapshot: ProgressSnapshot) -> ProgressSavedOut:
    return ProgressSavedOut(mastery=snapshot.mastery, next_review_at=snapshot.next_review_at)


@router.post("/sentence", response_model=ProgressSavedOut)
def save_sentence_result(body: SentenceResultIn, user: CurrentUser, service: ProgressServiceDep) -> ProgressSavedOut:
    return _saved(service.record(user.id, ItemType.SENTENCE, str(body.exercise_id), body.correct))


@router.post("/word", response_model=ProgressSavedOut)
def save_word_result(body: WordResultIn, user: CurrentUser, service: ProgressServiceDep) -> ProgressSavedOut:
    return _saved(service.record(user.id, ItemType.WORD, word_key(body.language, body.lemma), body.correct))


@router.post("/lesson-word", response_model=ProgressSavedOut, responses={404: {"model": ErrorOut}})
def save_lesson_word_result(body: LessonWordResultIn, user: CurrentUser, learner: LearnerServiceDep) -> dict:
    return learner.record_word(user.id, body.concept_id, body.learning, body.correct)


@router.post("/lesson", response_model=ProgressSavedOut)
def save_lesson_result(body: LessonResultIn, user: CurrentUser, service: ProgressServiceDep) -> ProgressSavedOut:
    return _saved(service.record(user.id, ItemType.LESSON, str(body.lesson_id), body.correct))


@router.get("/sentences", response_model=SentenceProgressMap)
def sentence_progress(user: CurrentUser, service: ProgressServiceDep) -> SentenceProgressMap:
    return SentenceProgressMap(
        progress={
            item.key: SentenceProgressOut(
                attempts=item.attempts,
                correct=item.correct,
                mastery=item.mastery,
                last_attempted=item.last_attempted_at,
                next_review=item.next_review_at,
            )
            for item in service.for_user(user.id, ItemType.SENTENCE)
        }
    )


@router.get("/lessons", response_model=LessonProgressMap)
def lesson_progress(user: CurrentUser, service: ProgressServiceDep) -> LessonProgressMap:
    return LessonProgressMap(
        progress={
            item.key: LessonProgressOut(attempts=item.attempts, correct=item.correct, mastery=item.mastery)
            for item in service.for_user(user.id, ItemType.LESSON)
        }
    )
