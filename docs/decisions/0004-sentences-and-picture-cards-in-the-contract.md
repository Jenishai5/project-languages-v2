# 0004 — Sentences and picture cards in the contract

- Status: accepted
- Date: 2026-11-27

## Context

`openapi.yaml` only described the admin and agent endpoints. The UI and other consumers also use
`GET /sentences` (list with filters and paging), `GET /sentences/{sentence_id}` (one sentence) and
`GET`/`POST /mnemonics` (the learner's picture cards). These endpoints were older than the contract,
so the code was the only description of them. The course asks for a contract with a list with filter and
pagination, a get-one, one write with validation, one error shape and nullable fields.

## Decision

Describe these four operations in `openapi.yaml` exactly as the code behaves today, without changing the code.

- **Paging** uses `limit` (1–100, default 20) and `offset` (default 0). The page returns `total` so the client
  can count pages. Offset paging is enough for a few thousand sentences.
- **Filters** are `lang`, `translation_lang` and `q` (a whole word, at least 2 characters).
- **`POST /mnemonics` returns `200`, not `201`.** There is one card per learner, word and language pair, and
  saving again replaces it. The same answer for "created" and "replaced" keeps the client simple.
- **Validation has two levels**, both in the contract: the shape of the body (`422`, FastAPI's list of problems)
  and the rules of the app (`400` with one readable sentence, for example "Use the word … in your sentence").
- **Nullable fields** are written as `type: [string, "null"]` (OpenAPI 3.1): `Sentence.license`,
  `Sentence.owner`, `Mnemonic.emoji` and `Mnemonic.image_url` (no picture → the UI shows the emoji).
- `tests/test_contract.py` checks for every operation in the contract that the code has the same parameters,
  the same response fields and the same request body. API tests validate real answers against the schemas.

## Alternatives

- **Generate `openapi.yaml` from FastAPI** (`app.openapi()`). Quick, but then the code decides the contract
  instead of the other way round, and descriptions and examples are lost.
- **Cursor paging.** Stable when rows are added while paging, but no "page 3 of 7". Not needed for data that
  only changes during an import.
- **`201 Created` for a new card and `200` for a replaced one.** More precise, but the client would have to
  handle two success codes for one form.

## Consequences

- New endpoints still go into the contract first, with a decision record.
- `POST /mnemonics` is safe to repeat for the database (still one card), but every call draws a new picture and
  uses the daily limit. Making it fully idempotent (an `Idempotency-Key` header) is a separate decision.
- `GET /sentences/random` and the game, lesson and progress endpoints are not in the contract yet.
