from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from langapp.api.deps import CurrentUser, LessonRepoDep, SentenceRepoDep
from langapp.domain import LANG_PATTERN
from langapp.services.lessons import LanguageNotSupported, check_languages, language_list, lesson_view

router = APIRouter(tags=["lessons"])

LangQuery = Annotated[str, Query(pattern=LANG_PATTERN)]


class LanguageSettings(BaseModel):
    native_lang: str
    learning_lang: str


def _validated(repo, learning: str, native: str) -> None:
    try:
        check_languages(learning, native, set(repo.languages()))
    except LanguageNotSupported as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/languages")
def languages(repo: LessonRepoDep) -> dict:
    return {"languages": language_list(repo.languages())}


@router.get("/lessons")
def list_lessons(repo: LessonRepoDep, learning: LangQuery = "eng", native: LangQuery = "spa") -> dict:
    _validated(repo, learning, native)
    lessons = [lesson for lesson in repo.list_lessons(learning, native) if lesson["word_count"] > 0]
    return {"learning": learning, "native": native, "lessons": lessons}


@router.get("/lessons/{lesson_id}")
def get_lesson(
    lesson_id: int,
    repo: LessonRepoDep,
    sentences_repo: SentenceRepoDep,
    learning: LangQuery = "eng",
    native: LangQuery = "spa",
) -> dict:
    _validated(repo, learning, native)
    lesson = repo.get_lesson(lesson_id)
    if lesson is None:
        raise HTTPException(status_code=404, detail=f"Lesson {lesson_id} not found")
    sentences = repo.lesson_sentences(lesson_id, learning)
    translations = sentences_repo.translations_for([s.id for s, _ in sentences], [native])
    return lesson_view(lesson, repo.lesson_concepts(lesson_id), sentences, translations, learning, native)


@router.get("/settings", response_model=LanguageSettings)
def get_settings(user: CurrentUser, repo: LessonRepoDep) -> LanguageSettings:
    settings = repo.get_settings(user.id)
    if settings is None:
        raise HTTPException(status_code=404, detail="No language settings yet")
    return LanguageSettings(native_lang=settings.native_lang, learning_lang=settings.learning_lang)


@router.put("/settings", response_model=LanguageSettings)
def save_settings(body: LanguageSettings, user: CurrentUser, repo: LessonRepoDep) -> LanguageSettings:
    _validated(repo, body.learning_lang, body.native_lang)
    saved = repo.save_settings(user.id, body.native_lang, body.learning_lang)
    repo.session.commit()
    return LanguageSettings(native_lang=saved.native_lang, learning_lang=saved.learning_lang)
