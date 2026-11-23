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
