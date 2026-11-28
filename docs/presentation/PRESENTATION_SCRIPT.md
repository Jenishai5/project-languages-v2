# 9. PRESENTATION SCRIPT — Сценарий презентации

> Тексты для произнесения — **на английском** (жирным выделены ключевые слова, на которые стоит сделать ударение). Под каждым блоком — подсказка на русском. Не заучивайте дословно: запомните **порядок мыслей**.

---

## 9.1. 30-second introduction

> "Hi, I'm Jenishai. I built **TurtleTalk**, a language-learning app for **Spanish, English, Russian and Catalan**. You learn words by **topics** — people, food, home — through short games: **Match**, **Shuffle**, **pronunciation**, and **picture cards** you create yourself. Five **AI agents** help you along the way: one explains grammar mistakes, one helps with vocabulary, one is a conversation partner, one gives cultural notes, and one scores your pronunciation. The backend is **FastAPI and PostgreSQL**, the frontend is **React with TypeScript**."

*Подсказка:* кто вы → что это → как учит → AI → стек. 30 секунд ≈ 75–85 слов.

---

## 9.2. 2-minute presentation

**1. Problem (15 с)**
> "Most vocabulary apps show you a word and a translation. You forget it the next day, because there is **no context** and **no personal connection**."

**2. Solution (30 с)**
> "In TurtleTalk, words are grouped by **topic**. You first **match** five words, then you **build sentences** from real examples taken from **Tatoeba**, a community collection of translated sentences. Then you write **your own sentence** with the word, and the app draws a **felt-style picture** for it. That picture becomes a **memory hook** — a mnemonic."

**3. AI help (30 с)**
> "When you make a mistake, AI explains **why**. Greta explains grammar in your **native language**. Carla starts a short **conversation about your own picture card**. Paco listens to you and **scores your pronunciation** with Azure Speech. Every answer comes back as **strict JSON**, so the UI always knows what to show."

**4. Engineering (30 с)**
> "Under the hood it's a **layered FastAPI backend**: routes, services, repositories. A **test checks the architecture rules**. All AI calls go through one **orchestrator**, which handles a **daily limit**, a **concurrency limit**, **caching**, **retries** and **logging** of every call. Progress uses **spaced repetition**."

**5. Close (15 с)**
> "Next steps are **deployment with CI/CD**, **observability with OpenTelemetry**, and making the agents **remember** each learner's weak points. Thank you — I'm happy to show a demo."

---

## 9.3. 5-minute technical presentation

| Время | Слайд / тема | Что сказать (суть) | Что показать |
|---|---|---|---|
| 0:00–0:30 | Intro | 30-секундное представление | Landing page |
| 0:30–1:15 | Architecture | "Browser → Vite proxy → FastAPI → services → repositories → PostgreSQL. External services: Supabase for auth and storage, OpenRouter for LLMs and images, Azure for speech, Tatoeba for data." | Диаграмма из документа 2 |
| 1:15–2:00 | Layered backend | "Routes are thin: validate with Pydantic, call one service. Services hold the rules. Only repositories talk to the database. `test_architecture.py` fails the build if a route imports a repository." | `tests/test_architecture.py` |
| 2:00–3:15 | Agent orchestrator | "Five specialised agents, one entry point: `AgentOrchestrator.ask`. Order: cache → configured? → daily limit (30) → semaphore (4 slots, 5 s wait) → call with retry → log to `ai_usage` → save useful result to `learning_outcomes`." | Диаграмма 6.4 |
| 3:15–3:45 | Honest scope | "It's **rule-based orchestration**, not autonomous agents. No tool calling, no agent-to-agent communication. I chose predictability: free models are bad at tool calling, and this way everything is testable." | Таблица 6.2 |
| 3:45–4:30 | Reliability | "Timeouts on every external call, retries with backoff, fallback models, emoji instead of a picture, and the app still works with **no AI keys**." | Сценарий 2 |
| 4:30–5:00 | What's next | Roadmap: deploy, OpenTelemetry + Grafana, Redis, personalization | Таблица 8.6 |

---

## 9.4. Live demo script

**Подготовка (за 30 минут до начала):**
1. Docker запущен → `make db` → `make migrate` → `make api` (бэкенд на :8000).
2. `cd frontend && npm run dev` (на :5173).
3. Войти в аккаунт заранее (лучше админский — для Staff room).
4. Проверить, что в `.env` есть ключи OpenRouter и Azure. **Не показывать `.env` на экране!**
5. Открыть вкладки: `/lessons`, `/mnemonics`, `/staff-room`, `http://localhost:8000/docs`.
6. Проверить микрофон в браузере.

| # | Действие | Что сказать |
|---|---|---|
| 1 | `/lessons` — карточки тем (bento) | "Words are grouped by topic. Each card shows progress." |
| 2 | Открыть тему → список слов (раскрыть, прослушать) | "Audio uses the browser's Web Speech API — no server needed." |
| 3 | **Match** 5 слов, специально ошибиться | "A wrong pair shakes; the answer is saved for spaced repetition." |
| 4 | **Shuffle**: специально собрать неверно → Check | "Now Greta explains the mistake. The call went through the orchestrator." |
| 5 | **Picture**: написать предложение со словом | "My own sentence becomes a felt picture. If the image model fails, I get an emoji — never an error." |
| 6 | Карточка → **Talk** с Carla, 2 реплики, Finish | "The history lives in the browser; on finish the server saves which topic words I used." |
| 7 | **Pronounce** (если есть время) | "Azure scores accuracy, fluency and weak sounds." |
| 8 | `/staff-room` → Control Room 3D | "Admin-only. Live agent states come from `GET /agents/live`, polled every four seconds." |
| 9 | `localhost:8000/docs` | "FastAPI generates interactive docs from the code." |

**План Б (если AI не отвечает):**
> "The free model is rate-limited right now — and this is actually a good moment to show the **fallback**: the app shows a friendly message instead of crashing, and the call is logged as failed in `ai_usage`."

Потом показать Staff room (там будет видна ошибка) и продолжить с Match/Shuffle — они работают без AI.

**План В (если не работает бэкенд):** показывать диаграммы из этого руководства и код (`orchestrator.py`, `test_architecture.py`).

---

## 9.5. Чек-лист перед выходом

- [ ] Все сервисы запущены, вход выполнен
- [ ] `.env` закрыт, в терминале нет ключей
- [ ] Лимит AI не исчерпан (Dashboard → remaining today)
- [ ] Уведомления на компьютере выключены
- [ ] Шрифт в браузере и редакторе увеличен (Cmd +)
- [ ] Вода рядом 🙂
