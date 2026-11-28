# 0003 — Live agent states for the Staff room

- Status: accepted
- Date: 2026-11-26

## Context

The Staff room is becoming a 3D control room where each teacher agent shows what it is doing right now (thinking, working, waiting, celebrating, confused, blocked). The database only stores finished AI calls (`ai_usage`), so it cannot tell whether an agent is busy at this moment. The animations must come from real states, not invented ones.

## Decision

Add `GET /agents/live` (admins only). It combines:

- an in-memory tracker (`AgentActivity`) that `AgentOrchestrator.ask()` updates: a request is **waiting** while it queues for a free slot, **thinking** for the first 1.5 s of the model call and **working** after that, **success** for 6 s after a good answer, **error** for 20 s after a failed one (with the reason), otherwise **idle**;
- **blocked** when the agent's API key is missing in the settings (OpenRouter for four agents, Azure Speech for pronunciation);
- today's counts and the 30 newest finished calls from `ai_usage` (agent, model, success, tokens, time — never what a learner wrote).

The UI polls it every few seconds.

## Alternatives

- **WebSocket or Server-Sent Events.** Instant updates, but more moving parts for a dashboard one admin looks at. Polling every few seconds is enough today.
- **Store in-progress calls in the database.** Survives restarts and works with several servers, but adds a write before every AI call.
- **Pause / resume per agent.** Not part of this decision; there is no real pause in the backend yet, so the UI shows no such control.

## Consequences

- Live states are per server process. With more than one backend worker each one only knows its own calls; today there is one.
- After a restart the live part starts empty (`tracking_since` tells the UI when tracking began). Counts and the activity feed come from the database and are not affected.
- Average response time is measured since the server started, from successful calls only.
