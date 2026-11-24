# Language App — data import + API (v2)

Imports Spanish sentences with English and Russian translations from the **Tatoeba API** into **PostgreSQL (Docker)** and serves them with **FastAPI**. This is the rebuild of the backend of [project-languages](https://github.com/Jenishai5/project-languages), using a layered architecture.

## Which API and why

[Tatoeba](https://tatoeba.org) is a free, community-made collection of sentences and their translations. API: `https://api.tatoeba.org/v1/sentences` ([OpenAPI spec](https://api.tatoeba.org/openapi.json)).

- It fits the app: the old app had a sentence game in English, Spanish and Russian, and Tatoeba gives real sentences with exactly those translations.
- Public, read-only, **no API key**.
- Every sentence has a stable numeric `id`, which this project uses as the primary key, so imports are idempotent.
- Every record has a `license` field (CC BY 2.0 FR in what we saw), so we know we may use the data with attribution.
- It is big enough to browse: more than 350,000 Spanish sentences with an English or Russian translation.

## Architecture

```
Tatoeba API ──HTTP──▶ ingestion/tatoeba_client.py   timeouts, retries + backoff, rate limit, paging
                              │ raw JSON pages
                              ▼
                     ingestion/parser.py            raw JSON → domain models (Pydantic); bad records skipped
                              │ ParsedSentence
                              ▼
                     services/import_service.py     orchestrates one import run, one transaction per page
                              │
                              ▼
                     repositories/                  the ONLY code that reads/writes the database
                              │ SQLAlchemy
                              ▼
                     PostgreSQL in Docker ◀── migrations/ (Alembic)

FastAPI (api/) ──▶ repositories/ ──▶ PostgreSQL
```

| Folder | Layer | Knows about |
|---|---|---|
| `src/langapp/domain.py` | Domain models (Pydantic) | nothing else |
| `src/langapp/ingestion/` | Talking to Tatoeba and cleaning its data | domain |
| `src/langapp/db/` | SQLAlchemy tables and DB connection | — |
| `src/langapp/repositories/` | Database reads/writes | db, domain |
| `src/langapp/services/` | Use cases (the import) | ingestion, repositories |
| `src/langapp/api/` | HTTP endpoints | repositories |
| `migrations/` | Versioned schema changes (Alembic) | db models |

## Database schema

- **`sentences`**: one row per Tatoeba sentence, in any language. `id` = Tatoeba's id (natural key, not generated).
- **`sentence_links`**: which sentence translates which. Primary key `(sentence_id, translation_id)`, so a link can't be stored twice. Translations are sentences too, so they live in `sentences`.
- **`import_runs`**: one row per import, with status, counters, last cursor and error. Lets you prove the import is reliable.

All timestamps are `timestamptz` (stored in UTC, returned with their offset).

## How to run

Needs: Docker Desktop, Python 3.11+ (`brew install python@3.12` if `python3 --version` is older).

```bash
cp .env.example .env
make install
make db
make migrate
make import
make api
```

What each step does:
- **`cp .env.example .env`**: creates your settings file. Change the password in it; it's yours and never committed.
- **`make install`**: creates `.venv` and installs the project.
- **`make db`**: starts PostgreSQL in Docker on port **5433**, so it doesn't clash with a local Postgres on 5432. It also creates `langapp_test`.
- **`make migrate`**: creates the tables (`alembic upgrade head`).
- **`make import`**: imports 2 pages = 100 sentences. Use `make import PAGES=10` for more.
- **`make api`**: runs the API. Open http://localhost:8000/docs.

Run `make import` again: the counters show `0 new rows`, because the import is idempotent.

Without `make`:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
docker compose up -d --wait
alembic upgrade head
python -m langapp.cli import --source spa --targets eng rus --pages 2
uvicorn langapp.api.main:app --reload
```

### Endpoints

| Method | Path | What |
|---|---|---|
| GET | `/health` | DB status + number of sentences |
| GET | `/sentences?lang=spa&translation_lang=eng&q=casa&limit=20&offset=0` | Browse and search |
| GET | `/sentences/random?lang=spa&translation_lang=rus` | One random sentence (for the game) |
| GET | `/sentences/{id}` | One sentence with all translations |
| GET | `/import-runs` | Latest import runs and their counters |

### Look at the data

```bash
docker exec -it langapp-db psql -U langapp -d langapp
```
```sql
SELECT lang, count(*) FROM sentences GROUP BY lang;
SELECT * FROM import_runs ORDER BY id DESC LIMIT 5;
```

## TurtleTalk games (React frontend)

The original TurtleTalk React app lives in `frontend/` and now runs on this backend.

| Feature | Data source | Endpoint |
|---|---|---|
| Sentence Builder (drag the English words into order) | Tatoeba: short English sentences with Spanish/Russian translations | `GET /game/sentences` |
| Listen (after a correct answer) | Tatoeba recordings by real people, with author and licence shown | `audio` field in `/game/sentences` |
| Word Match (en↔es, en↔ru, es↔ru, es→emoji) | The old dictionary files in `data/dictionaries/` | `GET /game/wordmatch` |
| Progress (spaced repetition) | Your answers; login via Supabase Auth | `POST /progress/sentence`, `POST /progress/word`, `GET /progress/sentences` |

The endpoints keep the same URLs and JSON shapes the old Express server used, so the React screens needed very few changes.

### Run it

```bash
make migrate
make import-builder
make import-words
make api
make frontend
```

What each step does:
- **`make migrate`**: adds the new tables (`audios`, `word_pairs`, `user_progress`) and the `word_count` column.
- **`make import-builder`**: imports 200 short English sentences with Spanish/Russian translations and recordings.
- **`make import-words`**: imports 715 word pairs from `data/dictionaries/`.
- **`make api`**: keep it running.
- **`make frontend`**: in a second terminal. Then open http://localhost:5173.

For login and progress, add `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env` (backend) and `frontend/.env` (frontend). Without them the games still work; only saving progress needs login.

### How the parts fit

- **Word tiles** come from `services/games.py`: the sentence is split into words and the final `.`, `!` or `?` is removed.
- **Word-type colours** come from `services/word_tagger.py`, a small rule-based tagger (word lists + suffixes). It is approximate: words it doesn't know (most nouns) get no colour. A real NLP library such as spaCy could replace it later; it doesn't support Python 3.15 yet.
- **Level** (A1/A2/B1) is estimated from sentence length. Tatoeba has no CEFR levels.
- **Progress:** the backend asks Supabase who the token belongs to (`auth.py`), then saves the answer with one atomic upsert (`repositories/progress.py`). Mastery goes 0–5, and the next review is in 2^mastery days.

### More surprises in the data

- **Same word, different answers:** *fish* = **el pescado** (food) and **pez** (animal), and *un pollo* = 🍗 and 🐔. So a word pair is unique on (pair, source, target), and one round never shows the same question or answer twice.
- **Inconsistent articles** in the old dictionary: *el reloj* in one category, *reloj* in another.
- **Audio licences differ per recording** (CC BY 4.0, CC BY-NC-ND 3.0…), so each recording's author and licence are stored and shown.
- **Audio timestamps** come with a time zone (`2026-09-26T05:43:42+00:00`) and are stored as `timestamptz`.

## Lessons

A lesson teaches 4–7 words, then uses them: **Learn → Match → Build sentences → Listen**.

### How lessons are made

1. **Concepts.** `make import-concepts` turns the dictionary files into *concepts*: one row per meaning, with its words in every language (`concepts` + `concept_terms`). So any native language works with any learning language, instead of needing one file per language pair. Then it groups the concepts into lessons by category (`lessons` + `lesson_concepts`): 353 concepts, 70 lessons.
2. **Sentences.** `make build-lessons` searches Tatoeba for short sentences (3–7 words) that contain each lesson word (`q==doctor`) and have a translation in the learner's language. It picks the best ones and links them to the lesson (`lesson_sentences`). It is run once, not while people play.
3. **Choosing good sentences** (`services/lesson_builder.py`):
   - the exact word must appear (*doctor*, not *doctors*);
   - **coverage**: at least 60% of the words must be known (lesson words or very common words), so "Call a doctor." wins over "The doctor prescribed antibiotics.";
   - sentences with a recording come first, then shorter ones;
   - the best sentences are picked **per native language**, so Spanish and Russian speakers both get sentences.
4. **The learner** picks "I speak" and "I want to learn". This is saved in the browser, and in `user_settings` when logged in.

```bash
make migrate
make import-concepts
make build-lessons
```

`make build-lessons` fills the first 10 lessons (about 50 Tatoeba requests at 1 per second). `make build-lessons LESSONS=0` fills all 70 (about 6 minutes). Running it again adds nothing new.

### Images

Each concept has `image_url` and `image_approved`. A picture is shown only after approval, because a wrong picture teaches the wrong word. Until then the emoji is shown (243 of 353 concepts have one).

```bash
.venv/bin/python -m langapp.cli set-image doctor https://…/doctor.png
.venv/bin/python -m langapp.cli set-image doctor https://…/doctor.png --approve
```

The first command saves the picture, waiting for approval. The second saves it and shows it to learners.

AI image generation is **not connected yet**: choose a provider first (account, key, terms of use). Then generate each picture once, store it, review it, and approve it with `set-image`.

### Endpoints

| Method | Path | What |
|---|---|---|
| GET | `/languages` | Languages with words available |
| GET | `/lessons?learning=eng&native=spa` | Lesson list with word and sentence counts |
| GET | `/lessons/{id}?learning=eng&native=spa` | Words, build exercises and listening exercises |
| GET / PUT | `/settings` | The learner's languages (login required) |
| POST | `/progress/lesson` · GET `/progress/lessons` | Lesson results (login required) |

### Data notes

- **Russian is thin:** only 69 of 353 concepts have a Russian word, because the old `en-ru` file was small. Russian speakers see fewer lessons until more translations are added.
- **Odd categories:** some come from the old files (*paper* is in "family and relationships"). Fix the JSON and run `make import-concepts` again.
- **Alternatives:** terms like *el médico / la médica* are shown in full, and searched by the first one.
- **Production builds need the `VITE_*` values.** Vite writes them into the code at build time. Without `frontend/.env`, the Supabase check fails and Vite drops the whole app as unreachable code.

## Tests

```bash
make test
```

- `test_parser.py`: a real saved Tatoeba response, plus a hand-made messy one (wrong types, empty text, duplicates…).
- `test_client.py`: fake HTTP with `respx`. Covers retries on 5xx, timeouts and 429 with `Retry-After`, no retry on 400, giving up, rate limiting and paging. Uses no real network and no real waiting.
- `test_repository.py`, `test_import_service.py`, `test_api.py`: run against the real `langapp_test` database in Docker. They prove that importing twice creates no duplicates and that a failure halfway keeps the pages already saved.

## Reliability

| Problem | What the code does |
|---|---|
| Slow API | 10 s timeout per request |
| Timeout, network error, HTTP 500/502/503/504 | Retry up to 4 times with exponential backoff + jitter (1, 2, 4, 8 s…) |
| HTTP 429 | Waits for `Retry-After` (max 60 s), then retries |
| HTTP 400/404 | No retry: it's our mistake, so fail fast with the API's message |
| Rate limit | Tatoeba publishes none, so we limit ourselves to 1 request/second and send a `User-Agent` |
| One bad record | Skipped and reported; the rest of the page is saved |
| API down halfway | The run is marked `failed` with the error and the last cursor; pages already saved stay (one transaction per page) |
| Import run twice | `INSERT … ON CONFLICT (id) DO UPDATE … WHERE something changed` → no duplicates, and `updated_at` changes only when the data really changed |
| Schema changes | New Alembic migration: `alembic revision --autogenerate -m "…"`, review it, then `alembic upgrade head` |

## Surprises in the data

- **`limit` is silently capped at 50.** Asking for 100 or 500 returns 50 records and no error, so the client never asks for more than 50.
- **Sentences have no date fields.** Only audio objects have `created`/`modified`. We store our own `first_seen_at`/`updated_at` (UTC) instead.
- **`trans:lang=eng,rus` means "eng OR rus".** Some sentences come with one translation, some with both (39 of 50 on one page had both).
- **`is_direct` is often `false`,** even when the same person wrote both sentences. Many translations are linked through a third sentence.
- **Real user content isn't always "clean":** typos (the shortest sentences include `Olvide!` without its accent) and some dark topics (war, accidents). A learning app might want to filter by tag or length later.
- **No rate-limit headers** in responses (no `X-RateLimit-*`, no `Retry-After` seen).
- **Errors are JSON with a message:** `{"message":"Invalid value for parameter 'lang'…","code":400}`.

## Attribution

Sentences from [Tatoeba](https://tatoeba.org), licensed CC BY 2.0 FR. Each sentence's `owner` and `license` are stored and returned by the API.
