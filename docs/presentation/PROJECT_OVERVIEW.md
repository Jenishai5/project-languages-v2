# 1. PROJECT OVERVIEW — Обзор проекта TurtleTalk

> **Как читать этот документ.** Каждое важное утверждение помечено:
> **[VERIFIED]** — проверено прямо в коде или тестах;
> **[INFERRED]** — разумный вывод из кода, но прямо не записан;
> **[NOT IMPLEMENTED]** — этого в проекте нет;
> **[NOT VERIFIED]** — недостаточно данных, чтобы подтвердить.
> Пути к файлам даны от корня репозитория `project-languages-v2/`.

---

## 1.1. Что это за приложение

**TurtleTalk** — веб-приложение для изучения иностранных слов (английский, испанский, русский; частично каталанский). Это переписанная с нуля версия старого проекта `project-languages` (Express + React), теперь с бэкендом на **Python / FastAPI**, базой **PostgreSQL** и слоем **AI-агентов**. **[VERIFIED]** — `README.md`, раздел «Language App — data import + API (v2)».

Простыми словами: ученик выбирает «я говорю на…» и «я учу…», открывает тему (например, *People*), тренирует слова четырьмя способами, пишет свои предложения-картинки, разговаривает с AI-собеседником, а AI-«учителя» объясняют ошибки.

### Какую проблему решает

| Проблема ученика | Как отвечает приложение | Статус |
|---|---|---|
| Слова забываются | Интервальное повторение: уровень `mastery` 0–5 и дата следующего повтора `next_review_at` | **[VERIFIED]** `src/langapp/repositories/progress.py`, `ProgressRepository.record` |
| Непонятно, *почему* порядок слов неправильный | Grammar Agent объясняет ошибку на родном языке | **[VERIFIED]** `services/agents/grammar.py` |
| Нет живой практики | Conversation Agent — короткий диалог на тему своей карточки | **[VERIFIED]** `services/agents/conversation.py` |
| Слово «не цепляется» | Своё предложение → AI-картинка → карточка-флешкарта (мнемоника) | **[VERIFIED]** `services/mnemonics.py` |
| Неправильное произношение | Оценка произношения через Azure Speech | **[VERIFIED]** `integrations/azure_speech.py` |
| Учебные предложения искусственные | Реальные предложения и записи носителей из Tatoeba | **[VERIFIED]** `ingestion/tatoeba_client.py` |

### Пользователи

1. **Ученик (learner)** — регистрируется по e-mail через Supabase Auth, учит слова. **[VERIFIED]** `frontend/src/lib/authApi.ts`.
2. **Администратор (admin)** — тот, чей e-mail записан в `ADMIN_EMAILS`; видит «Control room» с работой агентов. **[VERIFIED]** `src/langapp/api/deps.py`, функции `is_admin`, `get_admin_user`.
3. **Разработчик** — запускает импорт данных через CLI и смотрит базу через MCP-сервер (только чтение). **[VERIFIED]** `src/langapp/cli.py`, `src/langapp/mcp_server.py`.

---

## 1.2. Главные функции (только то, что реально есть в коде)

| Функция | Где во фронтенде | Какой API | Статус |
|---|---|---|---|
| Регистрация, вход, смена пароля | `components/AuthForm.tsx`, `AppNavbar.tsx` | Supabase Auth напрямую (не наш бэкенд) | **[VERIFIED]** |
| Выбор языков (сохраняется в БД) | `hooks/useLanguages.ts` | `GET/PUT /settings` | **[VERIFIED]** |
| 7 словарных тем (People, Places, Food…) | `pages/Lessons.tsx` | `GET /lessons` | **[VERIFIED]** |
| Тема: 4 тренировки (Match, Shuffle, Pronounce, Picture) | `pages/Lesson.tsx`, `components/lesson/*` | `GET /lessons/{id}` | **[VERIFIED]** |
| Объяснение ошибки в Shuffle | `components/lesson/GrammarTip.tsx` | `POST /agents/grammar/check` | **[VERIFIED]** |
| «Трудные слова» после Match + помощь по слову | `components/agents/HardWords.tsx`, `WordHelpPanel.tsx` | `GET /agents/vocabulary/weak`, `POST /agents/vocabulary/help` | **[VERIFIED]** |
| Культурные заметки о слове | `components/agents/CulturePanel.tsx` | `POST /agents/cultural/explain` | **[VERIFIED]** |
| Оценка произношения | `components/agents/PronunciationCoach.tsx` | `POST /agents/pronunciation/assess` | **[VERIFIED]** (нужен ключ Azure) |
| Карточки-картинки (мнемоники) | `components/mnemonics/MnemonicsPanel.tsx` | `GET/POST /mnemonics` | **[VERIFIED]** |
| Флешкарты из своих карточек | `pages/Mnemonics.tsx`, `Flashcards.tsx` | `GET /mnemonics` | **[VERIFIED]** |
| Разговор с AI о карточке | `components/agents/ConversationPanel.tsx` | `POST /agents/conversation/start|turn|finish` | **[VERIFIED]** |
| Свободная практика: Word Match | `pages/Game.tsx` | `GET /game/wordmatch` | **[VERIFIED]** |
| Свободная практика: Sentence Builder | `pages/SentenceGame.tsx` | `GET /game/sentences` | **[VERIFIED]** |
| Прогресс и интервальное повторение | `lib/progressService.ts` | `POST /progress/*`, `GET /progress/*` | **[VERIFIED]** |
| Dashboard (прогресс, AI-лимит на сегодня) | `pages/Dashboard.tsx` | `GET /lessons`, `GET /progress/lessons`, `GET /agents/usage` | **[VERIFIED]** |
| Admin Control Room (3D-комната агентов) | `pages/StaffRoom.tsx`, `components/controlroom/*` | `GET /agents/usage/summary`, `GET /agents/live` | **[VERIFIED]** (тесты бэкенда и фронтенда проходят) |

**Чего в проекте НЕТ** (важно не обещать это на презентации):
- деплоя в интернет (приложение запускается локально) — **[NOT IMPLEMENTED]**;
- оплаты, подписок — **[NOT IMPLEMENTED]**;
- мобильного приложения — **[NOT IMPLEMENTED]** (есть адаптивная вёрстка);
- голосового чата в реальном времени — **[NOT IMPLEMENTED]** (собеседник может *озвучить* ответ через браузер, `useSpeechSynthesis.ts`);
- паузы/остановки агентов администратором — **[NOT IMPLEMENTED]** (решение записано в `docs/decisions/0003-live-agent-states.md`).

---

## 1.3. Чем отличается от обычного веб-приложения

Обычное веб-приложение: «кнопка → запрос → база данных → ответ». Здесь есть ещё три слоя:

1. **AI-агенты** — часть запросов уходит к языковой модели (LLM) через OpenRouter, и ответ генерируется, а не берётся из базы. **[VERIFIED]** `integrations/openrouter.py`.
2. **Импорт внешних данных** — предложения и аудио из Tatoeba загружаются заранее отдельной командой и хранятся в PostgreSQL. **[VERIFIED]** `services/import_service.py`, `cli.py`.
3. **Наблюдаемость AI** — каждый вызов агента записывается (`ai_usage`), есть лимиты в день и живая панель для администратора. **[VERIFIED]** `services/agents/orchestrator.py`, `services/agent_activity.py`.

### Почему используются AI-агенты

- Объяснение грамматической ошибки, примеры со словом, разговор — это **генерация текста под конкретного ученика** (его уровень, родной язык, конкретная ошибка). Заранее такие ответы в базу не положишь. **[INFERRED]**
- Каждый агент делает **одну узкую задачу** со своим промптом и строгим форматом ответа (JSON). Это проще тестировать и контролировать, чем одного «универсального» агента. **[VERIFIED]** — у каждого агента свой `build_messages` и свой `parse_*`.

> ⚠️ **Честно о слове «агент».** В этом проекте «агент» — это **специализированный вызов LLM с фиксированным промптом и проверкой ответа**, а не автономный агент с циклом «подумал → вызвал инструмент → подумал ещё». У агентов **нет tool calling**, они **не общаются друг с другом**, а «оркестратор» — **обычный Python-код с правилами** (лимиты, кэш, очередь), а не LLM. **[VERIFIED]** — коммит `f6a215d Add AI agent layer: rule-based orchestrator…`, файл `orchestrator.py`. Подробно — в документе 6.

### Что делают агенты (кратко)

| Агент | Задача | Модель / сервис |
|---|---|---|
| **Grammar** (Greta) | Объясняет, почему порядок слов в Shuffle неверный | LLM через OpenRouter |
| **Vocabulary** (Victor) | Примеры, синонимы, антонимы, подсказка для запоминания | LLM через OpenRouter |
| **Conversation** (Carla) | Короткий диалог о карточке ученика + исправление ошибок | LLM через OpenRouter |
| **Cultural** (Chiara) | Как носители реально используют слово, идиомы | LLM через OpenRouter |
| **Pronunciation** (Paco) | Оценка произношения по звукам | **Azure Speech** (не LLM!) |

Имена (Greta, Victor…) — это персонажи интерфейса из `frontend/src/components/staffroom/agents.ts`; в бэкенде агенты называются `grammar`, `vocabulary` и т.д. **[VERIFIED]**

---

## 1.4. Что происходит, когда пользователь работает с приложением

Пример: ученик собрал предложение в Shuffle неправильно.

1. React-компонент `BuildStep.tsx` сравнивает порядок плиток с правильным → показывает «❌».
2. `GrammarTip.tsx` предлагает «объяснить ошибку» → вызывает `checkGrammar()` из `lib/agentsApi.ts`.
3. Запрос `POST /api/agents/grammar/check` с токеном Supabase в заголовке `Authorization`.
4. Vite dev-сервер проксирует `/api/...` на `http://localhost:8000/...` (`frontend/vite.config.ts`).
5. FastAPI проверяет токен (`get_current_user` → Supabase), валидирует тело (Pydantic `GrammarCheckIn`).
6. `AgentOrchestrator.check_shuffle()` проверяет, что плитки те же, смотрит кэш, дневной лимит, берёт слот (максимум 4 одновременно).
7. `GrammarAgent.explain()` → `OpenRouterClient.chat_json()` → LLM.
8. Ответ (JSON) разбирается (`parse_feedback`), ошибки сохраняются в `learning_outcomes`, вызов — в `ai_usage`.
9. Фронтенд показывает объяснение, список ошибок и совет.

Все шаги **[VERIFIED]**; подробная диаграмма — в документе 9 (End-to-end).

---

## 1.5. Elevator pitch (30 секунд)

**English (to say):**
> "TurtleTalk is a language-learning web app. You pick a topic like *People* or *Food*, and you train the words in four ways: matching, building real sentences, speaking, and pictures. When you make a mistake, a small team of AI teachers helps you: one explains grammar, one gives examples, one chats with you, one explains culture, and one scores your pronunciation. It's built with React, FastAPI and PostgreSQL, and it uses real sentences from Tatoeba."

**Русский смысл:** приложение для изучения слов; темы; четыре вида тренировки; при ошибке помогают пять AI-«учителей»; стек React + FastAPI + PostgreSQL; реальные предложения из Tatoeba.

---

## 1.6. Объяснение на одну минуту

> "The idea is simple: words stick better when you use them in different ways and when you understand your mistakes.
>
> On the frontend, a React app shows seven vocabulary topics. Each topic has four trainings. The Shuffle training uses real sentences from Tatoeba, and the word tiles are coloured by part of speech.
>
> The backend is a FastAPI app with a layered architecture: routes, services and repositories, and a PostgreSQL database in Docker. Login is handled by Supabase.
>
> The AI part is a set of five specialised agents. Four of them call a language model through OpenRouter, and one uses Azure Speech for pronunciation. A Python orchestrator controls them: it checks the daily limit, caches answers, limits how many calls run at the same time and logs every call. As an admin, I can watch the agents work live in a 3D control room."

---

## 1.7. Подробное объяснение на три минуты

**1. Проблема (30 с).** Учебники дают списки слов и искусственные предложения; ученик не понимает, почему ошибся, и быстро забывает слова.

**2. Решение — путь ученика (60 с).**
- Выбор языков → 7 тем по 31–94 слова (данные из словарных файлов старого проекта, `data/dictionaries/`).
- В теме: **Match** (5 случайных слов), **Shuffle** (10 настоящих предложений Tatoeba, каждое на другое слово темы, цвет плиток = часть речи), **Pronounce** (произнести слово), **Picture** (картинка → выбрать слово).
- **Карточки-картинки:** ученик пишет своё предложение со словом → AI рисует картинку в стиле фетра → карточка попадает во флешкарты → можно поговорить о ней с AI-собеседником.
- **Интервальное повторение:** каждый ответ повышает или понижает `mastery` (0–5), следующий повтор через 2^mastery дней.

**3. Архитектура (60 с).**
- **Frontend:** React 19 + TypeScript + Vite; маршруты в `App.tsx`; запросы через `fetch` в `lib/*Api.ts`.
- **Backend:** FastAPI, слои `api/routes → services → repositories → PostgreSQL`; правило слоёв проверяется тестом `tests/test_architecture.py`.
- **База:** PostgreSQL 17 в Docker, миграции Alembic (6 миграций), ORM SQLAlchemy 2.
- **Агенты:** `AgentOrchestrator` + 5 агентов; OpenRouter (бесплатные модели), Azure Speech; лимит 30 AI-ответов в день на ученика, 4 одновременных вызова, кэш ответов.
- **Наблюдаемость:** таблица `ai_usage`, эндпоинты `/agents/usage/summary` и `/agents/live`, 3D Control Room, read-only MCP-сервер, CI в GitHub Actions.

**4. Честные ограничения (30 с).** Нет деплоя; живые состояния агентов хранятся в памяти одного процесса; агенты синхронные (запрос ждёт ответа LLM до 120 с); нет защиты от prompt injection кроме строгого формата ответа. Подробно — документ 7 и 12.

---

## 1.8. Технический обзор (одна страница)

| Слой | Технологии | Ключевые файлы |
|---|---|---|
| UI | React 19, TypeScript, React Router 7, Vite 8, GSAP, Three.js (React Three Fiber) | `frontend/src/App.tsx`, `pages/*`, `components/*` |
| Аутентификация | Supabase Auth (JWT в заголовке) | `frontend/src/lib/supabase.ts`, `src/langapp/auth.py` |
| API | FastAPI, Pydantic v2 | `src/langapp/api/main.py`, `api/routes/*`, `api/schemas.py` |
| Бизнес-логика | Сервисы на чистом Python | `src/langapp/services/*` |
| Агенты | Собственный оркестратор, 5 агентов | `src/langapp/services/agents/*` |
| Доступ к данным | SQLAlchemy 2 (repository pattern) | `src/langapp/repositories/*` |
| База данных | PostgreSQL 17 (Docker), Alembic | `docker-compose.yml`, `migrations/versions/*` |
| Внешние сервисы | Tatoeba API, OpenRouter, Azure Speech, Supabase Auth + Storage | `src/langapp/ingestion/tatoeba_client.py`, `integrations/*` |
| Инструменты разработчика | CLI, MCP-сервер, Makefile | `src/langapp/cli.py`, `mcp_server.py`, `Makefile` |
| Качество | pytest (238 тестов, все проходят), Vitest (36 тестов), ruff, ESLint, GitHub Actions | `tests/*`, `.github/workflows/ci.yml` |

**Размер кода [VERIFIED]:** бэкенд ≈ 6 050 строк Python в `src/langapp`; 61 коммит в истории git (плюс незакоммиченные изменения последних дней).
