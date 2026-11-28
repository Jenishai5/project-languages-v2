# 7. END-TO-END SCENARIOS — Три сценария от клика до базы

> Каждый сценарий проверен по коду. Общий путь запроса везде одинаковый: компонент React → функция в `frontend/src/lib/*Api.ts` → `fetch('/api/...')` с заголовком `Authorization: Bearer <JWT>` → Vite proxy → FastAPI route → `CurrentUser` (проверка токена у Supabase) → service → repository → PostgreSQL. **[VERIFIED]**

---

## Сценарий 1. Shuffle → ошибка → объяснение грамматики (Greta)

**Что видит пользователь:** собирает предложение из плиток, нажимает «Check», ответ неверный → появляется подсказка «почему так».

```mermaid
sequenceDiagram
    actor U as Ученик
    participant FE as GrammarTip.tsx
    participant API as POST /api/agents/grammar/check
    participant AUTH as Supabase /auth/v1/user
    participant ORC as AgentOrchestrator.check_shuffle
    participant DB as PostgreSQL
    participant LLM as OpenRouter

    U->>FE: Неверный порядок плиток
    FE->>API: {sentence_id, answer[], learning, native} + JWT
    API->>AUTH: Проверить токен (кэш 60 с)
    AUTH-->>API: user_id
    API->>ORC: check_shuffle(...)
    ORC->>DB: SELECT sentence
    alt Плитки не те же самые
        ORC-->>FE: 400 "Use exactly the word tiles"
    else Порядок правильный
        ORC-->>FE: 200 correct=true (модель не вызывается)
    else Порядок неверный
        ORC->>ORC: кэш? лимит 30/день? слот из 4?
        ORC->>LLM: chat_json (промпт Greta, JSON)
        LLM-->>ORC: {explanation, mistakes, tip}
        ORC->>DB: INSERT ai_usage, INSERT learning_outcomes(kind=mistake)
        ORC-->>FE: 200 {explanation, mistakes, tip, remaining_today}
    end
    FE-->>U: Объяснение на родном языке
```

| Шаг | Где в коде | Что происходит |
|---|---|---|
| 1 | `components/lesson/GrammarTip.tsx` → `checkGrammar()` в `lib/agentsApi.ts` | Отправка ответа |
| 2 | `api/routes/agents.py: check_grammar` | Pydantic проверяет вход: до 40 плиток, каждая ≤60 символов, коды языков по шаблону |
| 3 | `deps.py: CurrentUser` | Токен проверяется у Supabase |
| 4 | `orchestrator.py: check_shuffle` | `same_words` — защита от подмены; правильный ответ не тратит лимит |
| 5 | `orchestrator.py: ask` | Кэш → лимит → семафор → вызов → журнал |
| 6 | БД | `ai_usage` (всегда), `learning_outcomes` (если есть объяснение) |

**Ошибки:** 401 (нет токена), 404 (предложение не найдено), 400 (чужие плитки), 429 (лимит или провайдер перегружен), 503 (все 4 слота заняты дольше 5 с), 200 + `message` (модель не ответила). **[VERIFIED]**

---

## Сценарий 2. Создать картинку-мнемонику («Create picture»)

**Что видит пользователь:** пишет своё предложение со словом → через несколько секунд появляется войлочная картинка (или эмодзи, если картинка не получилась).

```mermaid
sequenceDiagram
    actor U as Ученик
    participant FE as MnemonicsPanel.tsx
    participant API as POST /api/mnemonics
    participant SVC as MnemonicService.save
    participant DB as PostgreSQL
    participant IMG as OpenRouter /images
    participant ST as Supabase Storage

    U->>FE: "The cat sleeps on my bed"
    FE->>API: {concept_id, learning, native, sentence} + JWT
    API->>SVC: save(...)
    SVC->>DB: Найти слово и перевод
    SVC->>SVC: Длина 3–200 символов? Слово есть в предложении?
    alt Нет слова / неверная длина
        SVC-->>FE: 400 с понятным текстом
    end
    SVC->>DB: Сколько картинок за последние 24 ч? (лимит 5)
    alt Лимит исчерпан
        SVC-->>FE: 429 "Come back tomorrow!"
    end
    loop Модели по очереди
        SVC->>IMG: generate_image(model, felt-prompt)
        SVC->>DB: INSERT mnemonic_generations (ok / fail)
    end
    SVC->>ST: save(путь user/concept/lang)
    SVC->>DB: INSERT или UPDATE mnemonics
    SVC->>ST: signed URL (3600 с)
    SVC-->>FE: 200 {sentence, image_url | null, emoji}
    FE-->>U: Карточка в карусели
```

**Важные детали [VERIFIED] (`services/mnemonics.py`):**
- Одна карточка на слово: повторное сохранение **обновляет** существующую (`find` → `update`), поэтому ответ всегда `200`, а не `201` (ADR 0004).
- Если ключей нет (`_can_draw = False`) — карточка сохраняется **без картинки**.
- Модель перегружена (429) → сразу эмодзи; другая ошибка модели → следующая модель; ошибка Storage → эмодзи. Пользователь **не видит ошибку**, только запасной вариант.
- Лимит — «скользящие» 24 часа (`clock() - timedelta(days=1)`), не календарный день.
- Картинки приватные: в базе хранится **путь**, а браузер получает временную подписанную ссылку.

---

## Сценарий 3. Разговор с Carla (start → turn → finish)

```mermaid
sequenceDiagram
    actor U as Ученик
    participant FE as ConversationPanel.tsx
    participant CS as ConversationService
    participant ORC as AgentOrchestrator.ask
    participant LLM as OpenRouter
    participant DB as PostgreSQL

    U->>FE: Открывает разговор по своей карточке
    FE->>CS: POST /conversation/start {mnemonic_id}
    CS->>DB: Карточка ученика + до 10 слов той же темы
    CS->>ORC: ask(Carla, history=[], message=None)
    ORC->>LLM: system prompt (тема + предложение ученика)
    LLM-->>FE: {reply: первый вопрос}
    loop Каждая реплика
        U->>FE: Пишет ответ
        FE->>CS: POST /conversation/turn {history: последние 8, message}
        CS->>ORC: ask(...)
        ORC->>LLM: история + сообщение
        LLM-->>FE: {reply, correction | null}
    end
    U->>FE: "Finish"
    FE->>CS: POST /conversation/finish {messages, corrections}
    CS->>DB: learning_outcomes(word_used, mistake) + user_progress
    CS-->>FE: {words_used, mistakes_saved}
```

**Ключевые факты [VERIFIED]:**
- История разговора **живёт в браузере** (React state). Сервер её не хранит; `finish` получает её от клиента.
- Браузер отправляет `history.slice(-8)`; схема разрешает до 20 реплик, сообщение ≤300 символов.
- Каждый `start` и `turn` — отдельный вызов модели и **расходует дневной лимит** (30).
- На `finish` модель **не вызывается**: сервер сам ищет слова темы в сообщениях (`mask_sentence`) и повышает прогресс по ним.
- Слабость: так как `messages` и `corrections` приходят от клиента, ученик технически может «приписать» себе использованные слова. Это влияет только на его собственный прогресс. **[INFERRED]**
