import threading
from collections.abc import Iterator
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from langapp.auth import AuthError, AuthUser, SupabaseTokenVerifier
from langapp.config import get_settings
from langapp.db.session import get_session_factory
from langapp.integrations.azure_speech import AzureSpeechClient
from langapp.integrations.openrouter import OpenRouterClient
from langapp.integrations.supabase_storage import SupabaseImageStore
from langapp.repositories.ai_usage import AiUsageRepository
from langapp.repositories.concepts import ConceptRepository
from langapp.repositories.import_runs import ImportRunRepository
from langapp.repositories.lessons import LessonRepository
from langapp.repositories.mnemonics import MnemonicRepository
from langapp.repositories.outcomes import LearningOutcomeRepository
from langapp.repositories.progress import ProgressRepository
from langapp.repositories.sentences import SentenceRepository
from langapp.repositories.system import DatabaseCheck
from langapp.repositories.user_settings import UserSettingsRepository
from langapp.repositories.word_pairs import WordPairRepository
from langapp.services.agent_activity import AgentActivity
from langapp.services.agents.base import model_list
from langapp.services.agents.conversation import ConversationAgent
from langapp.services.agents.conversation_service import ConversationService
from langapp.services.agents.cultural import CulturalAgent
from langapp.services.agents.grammar import GrammarAgent
from langapp.services.agents.orchestrator import AgentLimits, AgentOrchestrator, ReplyCache
from langapp.services.agents.pronunciation import PronunciationAgent, PronunciationService
from langapp.services.agents.vocabulary import VocabularyAgent
from langapp.services.games import GameService
from langapp.services.languages import LanguageCatalog
from langapp.services.learner import LearnerService
from langapp.services.lessons import LessonService
from langapp.services.live_status import LiveStatus, blocked_reasons
from langapp.services.mnemonics import MnemonicService, MnemonicSettings
from langapp.services.progress import ProgressService
from langapp.services.sentences import SentenceService
from langapp.services.system import SystemService
from langapp.services.usage_report import UsageReport
from langapp.services.user_settings import UserSettingsService


def get_session() -> Iterator[Session]:
    with get_session_factory().begin() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def get_sentence_repository(session: SessionDep) -> SentenceRepository:
    return SentenceRepository(session)


SentenceRepoDep = Annotated[SentenceRepository, Depends(get_sentence_repository)]


def get_language_catalog(session: SessionDep) -> LanguageCatalog:
    return LanguageCatalog(ConceptRepository(session))


LanguageCatalogDep = Annotated[LanguageCatalog, Depends(get_language_catalog)]


def get_system_service(session: SessionDep, sentences: SentenceRepoDep) -> SystemService:
    return SystemService(DatabaseCheck(session), sentences, ImportRunRepository(session))


def get_sentence_service(sentences: SentenceRepoDep) -> SentenceService:
    return SentenceService(sentences)


def get_game_service(session: SessionDep, sentences: SentenceRepoDep) -> GameService:
    return GameService(sentences, WordPairRepository(session))


def get_progress_service(session: SessionDep) -> ProgressService:
    return ProgressService(ProgressRepository(session))


def get_lesson_service(session: SessionDep, sentences: SentenceRepoDep, catalog: LanguageCatalogDep) -> LessonService:
    return LessonService(LessonRepository(session), sentences, catalog)


def get_user_settings_service(session: SessionDep, catalog: LanguageCatalogDep) -> UserSettingsService:
    return UserSettingsService(UserSettingsRepository(session), catalog)


SystemServiceDep = Annotated[SystemService, Depends(get_system_service)]
SentenceServiceDep = Annotated[SentenceService, Depends(get_sentence_service)]
GameServiceDep = Annotated[GameService, Depends(get_game_service)]
ProgressServiceDep = Annotated[ProgressService, Depends(get_progress_service)]
LessonServiceDep = Annotated[LessonService, Depends(get_lesson_service)]
UserSettingsServiceDep = Annotated[UserSettingsService, Depends(get_user_settings_service)]


@lru_cache
def get_openrouter() -> OpenRouterClient | None:
    settings = get_settings()
    if not settings.openrouter_api_key:
        return None
    return OpenRouterClient(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        timeout_seconds=settings.openrouter_timeout_seconds,
        app_title=settings.openrouter_app_title,
    )


@lru_cache
def get_image_store() -> SupabaseImageStore | None:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_service_role_key:
        return None
    return SupabaseImageStore(settings.supabase_url, settings.supabase_service_role_key, settings.supabase_storage_bucket)


def get_mnemonic_service(
    session: SessionDep,
    catalog: LanguageCatalogDep,
    openrouter: Annotated[OpenRouterClient | None, Depends(get_openrouter)],
    store: Annotated[SupabaseImageStore | None, Depends(get_image_store)],
) -> MnemonicService:
    settings = get_settings()
    return MnemonicService(
        MnemonicRepository(session),
        ConceptRepository(session),
        catalog,
        images=openrouter,
        store=store,
        settings=MnemonicSettings(
            image_model=settings.openrouter_image_model,
            daily_limit=settings.mnemonic_daily_limit,
            signed_url_seconds=settings.signed_url_seconds,
        ),
    )


MnemonicServiceDep = Annotated[MnemonicService, Depends(get_mnemonic_service)]


@lru_cache
def get_reply_cache() -> ReplyCache:
    return ReplyCache()


@lru_cache
def get_agent_activity() -> AgentActivity:
    return AgentActivity()


@lru_cache
def get_agent_gate() -> threading.BoundedSemaphore:
    return threading.BoundedSemaphore(max(1, get_settings().agent_max_concurrent))


def _agent_settings() -> tuple[tuple[str, ...], int]:
    settings = get_settings()
    return model_list(settings.agent_models, settings.openrouter_text_model), settings.agent_max_tokens


def get_grammar_agent(
    openrouter: Annotated[OpenRouterClient | None, Depends(get_openrouter)],
) -> GrammarAgent | None:
    if openrouter is None:
        return None
    models, max_tokens = _agent_settings()
    return GrammarAgent(openrouter, models, max_tokens=max_tokens)


def get_vocabulary_agent(
    openrouter: Annotated[OpenRouterClient | None, Depends(get_openrouter)],
) -> VocabularyAgent | None:
    if openrouter is None:
        return None
    models, max_tokens = _agent_settings()
    return VocabularyAgent(openrouter, models, max_tokens=max_tokens)


def get_cultural_agent(
    openrouter: Annotated[OpenRouterClient | None, Depends(get_openrouter)],
) -> CulturalAgent | None:
    if openrouter is None:
        return None
    models, max_tokens = _agent_settings()
    return CulturalAgent(openrouter, models, max_tokens=max_tokens)


def get_agent_orchestrator(
    session: SessionDep,
    sentences: SentenceRepoDep,
    grammar: Annotated[GrammarAgent | None, Depends(get_grammar_agent)],
    vocabulary: Annotated[VocabularyAgent | None, Depends(get_vocabulary_agent)],
    cultural: Annotated[CulturalAgent | None, Depends(get_cultural_agent)],
    cache: Annotated[ReplyCache, Depends(get_reply_cache)],
    gate: Annotated[threading.BoundedSemaphore, Depends(get_agent_gate)],
    activity: Annotated[AgentActivity, Depends(get_agent_activity)],
) -> AgentOrchestrator:
    settings = get_settings()
    return AgentOrchestrator(
        sentences,
        ConceptRepository(session),
        UserSettingsRepository(session),
        LearningOutcomeRepository(session),
        AiUsageRepository(session),
        grammar=grammar,
        vocabulary=vocabulary,
        cache=cache,
        gate=gate,
        limits=AgentLimits(daily_limit=settings.agent_daily_limit, wait_seconds=settings.agent_wait_seconds),
        cultural=cultural,
        activity=activity,
    )


AgentOrchestratorDep = Annotated[AgentOrchestrator, Depends(get_agent_orchestrator)]


def get_conversation_agent(
    openrouter: Annotated[OpenRouterClient | None, Depends(get_openrouter)],
) -> ConversationAgent | None:
    if openrouter is None:
        return None
    models, max_tokens = _agent_settings()
    return ConversationAgent(openrouter, models, max_tokens=max_tokens)


def get_conversation_service(
    session: SessionDep,
    orchestrator: AgentOrchestratorDep,
    agent: Annotated[ConversationAgent | None, Depends(get_conversation_agent)],
) -> ConversationService:
    return ConversationService(
        orchestrator,
        agent,
        MnemonicRepository(session),
        LessonRepository(session),
        LearningOutcomeRepository(session),
        ProgressRepository(session),
    )


ConversationServiceDep = Annotated[ConversationService, Depends(get_conversation_service)]


@lru_cache
def get_azure_speech() -> AzureSpeechClient | None:
    settings = get_settings()
    if not settings.azure_speech_key or not settings.azure_speech_region:
        return None
    return AzureSpeechClient(settings.azure_speech_key, settings.azure_speech_region, settings.azure_speech_timeout_seconds)


def get_pronunciation_agent(
    azure: Annotated[AzureSpeechClient | None, Depends(get_azure_speech)],
) -> PronunciationAgent | None:
    return PronunciationAgent(azure) if azure is not None else None


def get_pronunciation_service(
    session: SessionDep,
    orchestrator: AgentOrchestratorDep,
    agent: Annotated[PronunciationAgent | None, Depends(get_pronunciation_agent)],
) -> PronunciationService:
    return PronunciationService(orchestrator, agent, LearningOutcomeRepository(session))


PronunciationServiceDep = Annotated[PronunciationService, Depends(get_pronunciation_service)]


def get_learner_service(session: SessionDep) -> LearnerService:
    return LearnerService(ProgressRepository(session), ConceptRepository(session), LessonRepository(session))


LearnerServiceDep = Annotated[LearnerService, Depends(get_learner_service)]


@lru_cache
def get_token_verifier() -> SupabaseTokenVerifier | None:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        return None
    return SupabaseTokenVerifier(settings.supabase_url, settings.supabase_anon_key)


def get_current_user(
    verifier: Annotated[SupabaseTokenVerifier | None, Depends(get_token_verifier)],
    authorization: Annotated[str | None, Header()] = None,
) -> AuthUser:
    if verifier is None:
        raise HTTPException(status_code=503, detail="Login is not configured: set SUPABASE_URL and SUPABASE_ANON_KEY")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No token provided.")
    try:
        return verifier.verify(authorization.removeprefix("Bearer ").strip())
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]


def is_admin(user: AuthUser) -> bool:
    admins = {email.strip().lower() for email in get_settings().admin_emails.split(",") if email.strip()}
    return bool(user.email) and user.email.lower() in admins


def get_admin_user(user: CurrentUser) -> AuthUser:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Only admins can see AI usage for the whole app.")
    return user


AdminUser = Annotated[AuthUser, Depends(get_admin_user)]


def get_usage_report(session: SessionDep) -> UsageReport:
    return UsageReport(AiUsageRepository(session))


UsageReportDep = Annotated[UsageReport, Depends(get_usage_report)]


def get_live_status(session: SessionDep, activity: Annotated[AgentActivity, Depends(get_agent_activity)]) -> LiveStatus:
    settings = get_settings()
    blocked = blocked_reasons(
        openrouter_ready=bool(settings.openrouter_api_key),
        azure_ready=bool(settings.azure_speech_key and settings.azure_speech_region),
    )
    return LiveStatus(activity, AiUsageRepository(session), blocked)


LiveStatusDep = Annotated[LiveStatus, Depends(get_live_status)]
