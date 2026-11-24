from typing import Annotated

from fastapi import APIRouter, Query

from langapp.api.deps import CurrentUser, LanguageCatalogDep, LessonServiceDep, UserSettingsServiceDep
from langapp.api.schemas import (
    ErrorOut,
    LanguageSettingsIn,
    LanguageSettingsOut,
    LanguagesOut,
    LessonDetailOut,
    LessonListOut,
)
from langapp.domain import LANG_PATTERN
from langapp.services.user_settings import LanguageChoice

router = APIRouter(tags=["lessons"])

LangQuery = Annotated[str, Query(pattern=LANG_PATTERN)]


@router.get("/languages", response_model=LanguagesOut)
def languages(catalog: LanguageCatalogDep) -> dict:
    return {"languages": catalog.list()}


@router.get("/lessons", response_model=LessonListOut, responses={400: {"model": ErrorOut}})
def list_lessons(service: LessonServiceDep, learning: LangQuery = "eng", native: LangQuery = "spa") -> dict:
    return {"learning": learning, "native": native, "lessons": service.list(learning, native)}


@router.get(
    "/lessons/{lesson_id}",
    response_model=LessonDetailOut,
    responses={400: {"model": ErrorOut}, 404: {"model": ErrorOut}},
)
def get_lesson(lesson_id: int, service: LessonServiceDep, learning: LangQuery = "eng", native: LangQuery = "spa") -> dict:
    return service.detail(lesson_id, learning, native)


@router.get("/settings", response_model=LanguageSettingsOut, responses={404: {"model": ErrorOut}})
def get_settings(user: CurrentUser, service: UserSettingsServiceDep) -> LanguageChoice:
    return service.get(user.id)


@router.put("/settings", response_model=LanguageSettingsOut, responses={400: {"model": ErrorOut}})
def save_settings(body: LanguageSettingsIn, user: CurrentUser, service: UserSettingsServiceDep) -> LanguageChoice:
    return service.save(user.id, LanguageChoice(native_lang=body.native_lang, learning_lang=body.learning_lang))
