# 0002 — Tell the UI who is an admin

- Status: accepted
- Date: 2026-11-26

## Context

The Staff room (`/staff-room`) is only for admins, but the UI had no way to know who is an admin, so there was no link to it. The admin list lives in the backend (`ADMIN_EMAILS`) and must stay there.

## Decision

Add `is_admin` (boolean, required) to the answer of `GET /agents/usage`. The dashboard already calls this endpoint, so the link costs no extra request. The UI shows "Open staff room" only when `is_admin` is true.

`/agents/usage` was added to `openapi.yaml` at the same time, because it was used by the UI but missing from the contract.

## Alternatives

- **A new `GET /me` endpoint.** Cleaner if more user facts are needed later, but one more request and one more endpoint for one boolean today.
- **Hard-code the admin e-mail in the frontend.** Rejected: the list would be public in the JavaScript bundle and would need a new build to change.
- **Call `/agents/usage/summary` and hide the link on 403.** Rejected: it loads the whole report just to decide about a link.

## Consequences

- Hiding the link is only for convenience. Security still comes from the backend, which answers `403` to non-admins.
