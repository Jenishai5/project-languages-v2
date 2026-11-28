# 10. TECHNICAL QUESTIONS — Вопросы и ответы

> Формат каждого вопроса: **Q** — вопрос (англ.) · *Смысл* — что на самом деле спрашивают · **A** — ответ на английском (произносить) · 🇷🇺 — пояснение · `Code` — где это в коде · **Follow-up** — возможный следующий вопрос.
> Совет: если не знаете — скажите *"I haven't implemented that yet, but here's how I would approach it…"* Это лучше, чем выдумывать.

---

## A. Product & architecture

### 1. Q: Can you describe the architecture of your app?
*Смысл:* понимаете ли вы, из каких частей система и как они общаются.
**A:** "It's a React + TypeScript frontend and a FastAPI backend with PostgreSQL. The backend is layered: routes, services, repositories. External services are Supabase for auth and storage, OpenRouter for text and image models, Azure Speech for pronunciation, and Tatoeba as the data source."
🇷🇺 Назовите слои и внешние сервисы — это главное.
`Code:` `src/langapp/api/routes/`, `services/`, `repositories/`
**Follow-up:** "Why layers?" → вопрос 2.

### 2. Q: Why did you choose a layered architecture?
*Смысл:* понимаете ли вы пользу разделения ответственности.
**A:** "Each layer has one job. Routes handle HTTP, services hold the business rules, repositories are the only code that touches the database. That makes the code easier to test — I can test a service with a fake repository — and easier to change."
🇷🇺 Separation of concerns: каждый слой — одна обязанность.
`Code:` `tests/test_architecture.py` — проверяет, что routes не импортируют repositories, services не импортируют FastAPI.
**Follow-up:** "How do you enforce it?" → "With an architecture test that fails CI."

### 3. Q: What happens when a user clicks "Check" in Shuffle?
*Смысл:* можете ли вы пройти запрос end-to-end.
**A:** "The React component sends a POST to `/api/agents/grammar/check` with the JWT. Vite proxies it to FastAPI. FastAPI validates the body with Pydantic and verifies the token with Supabase. The orchestrator checks the tiles are the same words; if the order is correct, no model is called. Otherwise it checks the cache, the daily limit and a free slot, calls the grammar agent, logs the call and returns JSON."
🇷🇺 См. сценарий 1 в документе 7.
**Follow-up:** "What if the model is down?" → вопрос 14.

### 4. Q: Why FastAPI and not Express or Django?
**A:** "FastAPI gives me request validation and OpenAPI docs from type hints with Pydantic, it's fast to write, and Python has the best ecosystem for AI work. Django would bring a lot I don't need, like templates and its own ORM admin."
🇷🇺 Типы → валидация + автодокументация `/docs`.
**Follow-up:** "Do you use async?" → "Routes are synchronous; FastAPI runs them in a thread pool. Async would help with many slow LLM calls."

### 5. Q: How does the frontend talk to the backend?
**A:** "Through `fetch` helpers in `src/lib/*Api.ts`. Each call adds `Authorization: Bearer <token>` from the Supabase session. In development, Vite proxies `/api` to port 8000, so there's no CORS issue."
`Code:` `frontend/src/lib/agentsApi.ts`, `vite.config.ts`
**Follow-up:** "What about production?" → "I'd need either the same domain behind a reverse proxy, or CORS with an explicit list of origins."

### 6. Q: How do you manage state in React?
**A:** "Local state with `useState`, an `AuthContext` for the session, and a custom hook `useLanguages` that keeps the language pair in localStorage and syncs it with `/settings`. The app is small enough that I didn't need Redux."
🇷🇺 Честно: глобального стора нет, и это осознанно.

---

## B. Database

### 7. Q: Why is there no users table?
*Смысл:* понимаете ли вы последствия выбора Supabase Auth.
**A:** "Users live in Supabase Auth. My tables store the `user_id` UUID from the token. The trade-off is that there's no foreign key, so the database can't enforce that the user exists, and deleting a user's data needs extra code."
`Code:` `user_progress.user_id`, `mnemonics.user_id` — UUID без FK.
**Follow-up:** "How would you delete a user?" → "An endpoint that deletes all rows by `user_id` in one transaction, plus their files in Storage."

### 8. Q: How does spaced repetition work in your app?
**A:** "Each item has a mastery level from 0 to 5. A correct answer raises it by one, a wrong one lowers it by one. The next review is in 2 to the power of mastery days — 1, 2, 4, 8, 16, 32. It's computed in one SQL upsert."
`Code:` `repositories/progress.py`
**Follow-up:** "Why one upsert?" → "To avoid a race condition between read and write."

### 9. Q: How do you change the database schema?
**A:** "With Alembic migrations. There are six, and each one has a `downgrade`, so I can roll back."
🇷🇺 Миграция = версионированное изменение схемы, как git для таблиц.

### 10. Q: What is a transaction and where do you use it?
**A:** "A group of database operations that succeed or fail together. I open one transaction per request in `get_session`. If anything raises an error, everything is rolled back."
`Code:` `api/deps.py: get_session` → `session.begin()`

### 11. Q: How do you prevent SQL injection?
**A:** "I never build SQL from strings. SQLAlchemy sends parameters separately from the query."

---

## C. AI agents

### 12. Q: What is an AI agent in your project?
*Смысл:* понимаете ли вы разницу «агент vs вызов LLM».
**A:** "Honestly, they are specialised LLM workers: each has its own role, prompt, JSON format and parser. They don't choose tools or loop on their own. A Python orchestrator decides which agent runs, based on the endpoint."
🇷🇺 Не преувеличивайте — честность производит лучшее впечатление.
**Follow-up:** "So is it really an agent?" → "In the strict sense — an LLM in a loop with tools — no. It's the workflow end of the spectrum, which Anthropic recommends starting with."

### 13. Q: Why five agents instead of one?
**A:** "Small, focused prompts work better, especially with free models. Each agent has its own output schema, so parsing and testing are simple. Pronunciation isn't even an LLM — it's Azure Speech. And I can see cost and failures per agent in `ai_usage`."

### 14. Q: What happens if the LLM fails?
**A:** "There's one HTTP retry for server errors, then `ask_with_retry` tries again if the answer is empty. OpenRouter also falls back to other models in the list. If all of that fails, the user gets a friendly message with status 200, and the failure is logged. A 429 from the provider becomes a 429 for the user."
`Code:` `integrations/openrouter.py`, `services/agents/base.py: ask_with_retry`

### 15. Q: How do you control AI costs?
**A:** "A daily limit of 30 calls per user, 5 pictures per 24 hours, a cache for repeated grammar, vocabulary and cultural questions, and no model call when the Shuffle answer is already correct. Every call is logged with tokens in `ai_usage`, and admins see a summary."

### 16. Q: What is the semaphore for?
**A:** "It limits how many agent calls run at the same time — four. If no slot frees up within five seconds, the user gets a 503. It protects the server and the provider from overload."
`Code:` `deps.get_agent_gate` → `threading.BoundedSemaphore`
**Follow-up:** "Does it work with two servers?" → "No, it's per process. I'd move it to Redis."

### 17. Q: How do you make sure the model returns valid data?
**A:** "The prompt asks for JSON only, with an exact shape. I use temperature 0.2. Each agent parses the JSON itself, clips long fields and drops invalid items. If it's useless, it retries once."

### 18. Q: Does the conversation agent remember previous messages?
**A:** "Within one conversation, yes: the browser sends the last eight messages. Across sessions, no — the history isn't stored on the server. Only the words used and corrections are saved at the end."

### 19. Q: What is prompt injection, and is your app vulnerable?
**A:** "It's when user text tries to override the model's instructions. In my app, the learner's own picture-card sentence goes into Carla's system prompt, so in theory they could inject instructions. The risk is low because the agent has no tools and only sees that learner's own data, and the output is rendered as plain text. A fix would be to put user text in the user message and mark it clearly as data."

### 20. Q: Do your agents use tool calling?
**A:** "Not yet. With tool calling, the model returns a request like 'call `search_examples(word)`', my code runs it and sends the result back. I'd add it for the vocabulary agent to search real Tatoeba examples in my database."

### 21. Q: What's the MCP server in your repo?
**A:** "A read-only Model Context Protocol server with five tools, for my own AI coding assistant — for example, to read learning insights. The app's agents don't use it."

---

## D. Integrations & reliability

### 22. Q: How does authentication work?
**A:** "The frontend logs in with the Supabase SDK and gets a JWT. Every API call sends it. The backend asks Supabase `GET /auth/v1/user` whether the token is valid and caches the answer for 60 seconds."
**Follow-up:** "Why not verify the JWT locally?" → "That's faster — with the public key (JWKS). It's a good next step."

### 23. Q: How do you import data from Tatoeba?
**A:** "With a CLI command, not on user requests. The client has a 10-second timeout, retries with exponential backoff, respects `Retry-After`, and sends at most one request per second. It upserts by Tatoeba id, so running it twice doesn't create duplicates."
🇷🇺 Идемпотентность = повтор даёт тот же результат.

### 24. Q: How are the pictures stored?
**A:** "In a private Supabase Storage bucket. The database stores only the path. The API returns a signed URL valid for one hour."

### 25. Q: What's the difference between a timeout and a retry?
**A:** "A timeout says how long I wait for one attempt. A retry says how many times I try again after a failure. Retries should use backoff, so I don't hammer a struggling service."

### 26. Q: What is graceful degradation in your app?
**A:** "If AI keys are missing or providers fail, the core still works: games, progress, picture cards with emoji. Agents show 'not set up' instead of crashing."

---

## E. Testing & delivery

### 27. Q: How do you test your app?
**A:** "Backend: pytest, about 240 tests, including an architecture test, contract tests and agents tested with fake model clients. Frontend: Vitest, 36 tests. GitHub Actions runs ruff, pytest, Vitest and the build on every push."
**Follow-up:** "How do you test code that calls an LLM?" → "I inject a fake client that returns a fixed JSON, and test parsing and error cases."

### 28. Q: What is your CI pipeline?
**A:** "On push: install, ruff lint, pytest against a Postgres service container; `npm ci`, Vitest and `npm run build`; and `redocly lint` on the contract. There's no deploy step yet."

### 29. Q: What is OpenAPI and do you use it?
**A:** "A standard description of an HTTP API. FastAPI generates one automatically at `/docs`. I also keep a hand-written `openapi.yaml` contract: a sentence list with filters and pagination, a get-one, the picture-card write with validation, one error shape and nullable fields. It passes `redocly lint`, and `tests/test_contract.py` checks that the code has the same parameters and fields."

### 30. Q: How do you handle errors in the backend?
**A:** "Domain errors subclass `AppError`; each one knows its HTTP status — `NotFound` is 404, `RateLimited` is 429. One exception handler turns them into `{"detail": "..."}`."
`Code:` `src/langapp/errors.py`, `api/main.py: handle_app_error`

### 31. Q: How did you use AI tools while building this?
**A:** "I used Claude Code as a pair programmer: I write the plan, keep architecture rules in tests, and review every change. The tests and the architecture test are my safety net — AI-generated code has to pass them."

### 32. Q: How would you deploy it?
**A:** "Build Docker images for the backend and the static frontend, run migrations on deploy, put secrets in the platform's environment variables, and add a deploy job to GitHub Actions after tests pass."

### 33. Q: How would you monitor it in production?
**A:** "OpenTelemetry for traces and metrics — for example, latency and failure rate per agent — sent to Grafana. Right now I have logs with response times and the `ai_usage` table shown in the Staff room."

---

## F. Difficult questions — трудные вопросы

| Вопрос | Как ответить |
|---|---|
| **"Isn't this just a wrapper around ChatGPT?"** | "The model call is one line. The engineering is around it: limits, caching, retries, fallbacks, strict output parsing, logging, tests — and the learning logic, spaced repetition and data pipeline, which don't use AI at all." |
| **"What's the weakest part of your project?"** | "No deployment and no persistent agent memory. Also, state like the cache and live statuses lives in memory, so it won't work with several servers. I know how I'd fix each one." |
| **"Why didn't you use LangChain or an agent framework?"** | "My flows are fixed, so a framework would add complexity without benefit. Plain code is easier to test and debug. If I add tool calling and loops, I'd reconsider." |
| **"What would break at 10,000 users?"** | "Synchronous LLM calls and in-memory state. I'd add a task queue, Redis for limits and cache, and paid models." |
| **"Can a user cheat the progress system?"** | "Yes, partly — conversation results come from the client. It only affects their own progress, but a fix would be to store the conversation on the server." |
| **"How do you know the AI's answers are correct?"** | "I don't fully — that's an open problem. Prompts say 'never invent', output is limited, temperature is low. The next step is evals: a fixed set of questions with expected answers to compare models." |
| **"Did you write this code yourself?"** | "I designed it and wrote it with an AI assistant. I can explain every part, and the architecture rules and tests are how I keep control." |
| **"Why isn't every endpoint in openapi.yaml?"** | "The contract covers the operations consumers rely on: the sentence list, one sentence, picture cards and the admin endpoints. Tests keep them in sync with the code. Lessons, games and progress are next; FastAPI's `/docs` shows them meanwhile." |
