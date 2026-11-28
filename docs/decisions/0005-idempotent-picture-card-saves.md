# 0005 — Idempotent picture-card saves

- Status: accepted
- Date: 2026-11-28

## Context

`POST /mnemonics` saves the learner's sentence and draws a picture. The database already keeps one card per
learner and word, so a repeated request does not make a duplicate row. But every request draws a new picture,
which costs money and uses one of the 5 pictures a day. A repeat happens easily: the connection drops after the
server saved the card, the browser times out, or the learner clicks again. The client cannot know whether the
first request worked, so it needs a way to retry safely.

## Decision

Support an optional `Idempotency-Key` request header on `POST /mnemonics`, the pattern used by Stripe and
described in the IETF draft "The Idempotency-Key HTTP Header Field".

- The client makes a new random key (a UUID) for every save the learner means to do, and sends the same key when
  it retries that save. The UI reuses the key while the sentence is the same and forgets it after a success.
- A table `idempotency_keys` stores `(user_id, key)` as the primary key, the operation name, a SHA-256
  fingerprint of the request body and the id of the saved card.
- **First request with a key:** insert the key row, do the work, store the card id — all in the request's one
  transaction. Answer `200` with `Idempotent-Replayed: false`.
- **Same key, same body:** answer `200` with the same card and `Idempotent-Replayed: true`. No picture is drawn
  and the daily limit is not used. The card is read again, so the signed picture link is fresh.
- **Same key, different body:** `409 Conflict` with the normal `Error` shape.
- **Two requests with the same key at the same time:** the second `INSERT … ON CONFLICT DO NOTHING` waits for the
  first transaction. When the first commits, the second replays its result; if the first fails, the second does
  the work. So only one picture is drawn. A test runs this with two threads against PostgreSQL.
- **Failed requests are not remembered.** A `400` or `429` rolls back the transaction, the key row disappears and
  the client can retry with the same key after fixing the problem.
- Keys belong to one learner and live 24 hours. An expired key is deleted when it is used again.
- Without the header the endpoint behaves as before.

## Alternatives

- **Rely on the unique constraint only.** Already true, but it does not stop the second picture and limit use.
- **Remember the whole JSON answer.** Simple, but the signed picture link inside expires after one hour.
  Storing the card id and reading the card again avoids stale links.
- **`422` for a reused key with a different body (the IETF draft's suggestion).** We use `409` because our
  `422` answers have FastAPI's list shape, and one status should keep one shape.
- **A Redis store with a lock.** Faster, but a second system to run. PostgreSQL already gives us the lock.

## Consequences

- One small table and one migration (`7b1e4c2d9a10`).
- If the learner later rewrites the card with another key, replaying the old key returns the card as it is now.
- Old keys of learners who never retry stay in the table; a cleanup job can delete rows older than 24 hours.
- `IdempotentRequests` is generic, so other write endpoints (for example progress) can use it later.
