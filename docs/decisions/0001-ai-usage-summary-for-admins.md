# 0001 — AI usage summary endpoint for admins

- Status: accepted
- Date: 2026-11-26

## Context

The "Staff room" dashboard shows how much each AI agent is used, so we can watch cost and failures. The UI needs numbers for the whole app, per agent and per day. The contract only had `GET /agents/usage`, which is about one learner and only today.

## Decision

Add `GET /agents/usage/summary?days=7` to `openapi.yaml` before writing code.

- It returns totals for all learners together: calls, failures, failure rate, tokens, number of learners, models and calls per day.
- It never returns user ids or anything a learner wrote. The numbers come from the `ai_usage` table, which only stores counts.
- Only admins can call it. Admins are listed by e-mail in the backend setting `ADMIN_EMAILS`. Everyone else gets `403`.
- All five agents are always in the answer, also with zero calls, so the UI does not need to know which agents exist.
- `last_call_at` is nullable: it is `null` when an agent had no calls.

## Alternatives

- **Compute it in the browser from many `GET /agents/usage` calls.** Not possible: that endpoint only shows the current learner.
- **An admin role in the database.** Better later, but it needs a schema change. One setting is enough for one admin today.
- **Send the numbers to Grafana with OpenTelemetry.** Planned for week 4. The endpoint stays useful for the in-app dashboard.

## Consequences

- The admin list lives in `.env`, so changing it needs a restart.
- Errors still use two shapes (`{"detail": "text"}` and FastAPI's validation list). Both are in the contract. Moving to one Problem Details shape will be a separate decision.
