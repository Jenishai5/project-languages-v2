import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ActivityPanel from "../components/controlroom/ActivityPanel";
import TaskPanel from "../components/controlroom/TaskPanel";
import { supportsWebGL, useReducedMotion } from "../components/controlroom/environment";
import { FILTERS, STATE_META, matchesFilter, type StatusFilter } from "../components/controlroom/liveStates";
import { useLiveAgents } from "../components/controlroom/useLiveAgents";
import AgentPanel from "../components/staffroom/AgentPanel";
import StaffRoomScene from "../components/staffroom/StaffRoomScene";
import { AGENT_LOOKS } from "../components/staffroom/agents";
import { ApiError, fetchAiUsageSummary, type AgentName, type AiUsageSummary } from "../lib/agentsApi";
import "../styles/staffroom.css";
import "../styles/controlroom.css";

const ControlRoomScene = lazy(() => import("../components/controlroom/three/ControlRoomScene"));

const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

type Load =
  | { state: "loading" }
  | { state: "ready"; data: AiUsageSummary }
  | { state: "forbidden"; message: string }
  | { state: "error"; message: string };

const number = new Intl.NumberFormat("en");

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function StaffRoom() {
  const [days, setDays] = useState(7);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [view, setView] = useState<"scene" | "table">("scene");
  const [selected, setSelected] = useState<AgentName | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [attempt, setAttempt] = useState(0);
  const reduced = useReducedMotion();
  const webgl = useMemo(() => supportsWebGL(), []);
  const now = useNow(1000);

  useEffect(() => {
    let cancelled = false;
    fetchAiUsageSummary(days)
      .then(data => { if (!cancelled) setLoad({ state: "ready", data }); })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Something went wrong.";
        setLoad(error instanceof ApiError && error.status === 403 ? { state: "forbidden", message } : { state: "error", message });
      });
    return () => { cancelled = true; };
  }, [days, attempt]);

  const { live, error: liveError, updatedAt } = useLiveAgents(load.state === "ready");

  const choosePeriod = (next: number) => {
    if (next === days) return;
    setLoad({ state: "loading" });
    setDays(next);
  };

  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    setAttempt(n => n + 1);
  }, []);

  const select = useCallback((agent: AgentName | null) => {
    setSelected(current => (agent === null || current === agent ? null : agent));
  }, []);

  const periodLabel = PERIODS.find(p => p.days === days)?.label ?? `${days} days`;
  const data = load.state === "ready" ? load.data : null;
  const agents = data?.agents ?? [];
  const totalCalls = agents.reduce((sum, a) => sum + a.calls, 0);
  const totalFailures = agents.reduce((sum, a) => sum + a.failures, 0);
  const selectedAgent = agents.find(a => a.agent === selected) ?? null;
  const liveAgents = live?.agents;
  const active = liveAgents?.filter(a => ["thinking", "working", "waiting"].includes(a.state)).length ?? 0;
  const attention = liveAgents?.filter(a => a.state === "error" || a.state === "blocked") ?? [];
  const counts = Object.fromEntries(FILTERS.map(f => [f.id, liveAgents?.filter(a => matchesFilter(a.state, f.id)).length ?? 0]));
  const seconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const status = liveError
    ? { tone: "offline", text: "Live data unavailable" }
    : attention.length
      ? { tone: "warn", text: `${attention.length} agent${attention.length > 1 ? "s need" : " needs"} attention` }
      : live
        ? { tone: "ok", text: "All systems normal" }
        : { tone: "pending", text: "Connecting…" };

  return (
    <div className="control-room">
      <header className="cr-header">
        <div className="cr-brand">
          <img src="/turtle.png" alt="" width={44} height={44} />
          <div>
            <p className="cr-eyebrow">TurtleTalk · admin</p>
            <h1 className="cr-title">Control room</h1>
          </div>
        </div>

        <p className="cr-status" data-tone={status.tone} role="status">
          <span className="cr-status__dot" aria-hidden="true" />{status.text}
        </p>

        {data && (
          <dl className="cr-stats">
            <div><dt>Active agents</dt><dd>{active}<small> of {agents.length}</small></dd></div>
            <div><dt>Answered</dt><dd>{number.format(totalCalls - totalFailures)}</dd></div>
            <div><dt>Failed</dt><dd>{totalFailures}<small> ({totalCalls ? Math.round((totalFailures / totalCalls) * 100) : 0}%)</small></dd></div>
            <div><dt>Session</dt><dd className="cr-stats__session">{seconds === null ? "–" : seconds < 2 ? "live" : `updated ${seconds}s ago`}</dd></div>
          </dl>
        )}

        <div className="cr-controls">
          <div className="cr-segmented" role="group" aria-label="Period">
            {PERIODS.map(period => (
              <button key={period.days} className={period.days === days ? "is-active" : ""} aria-pressed={period.days === days}
                onClick={() => choosePeriod(period.days)}>
                {period.label}
              </button>
            ))}
          </div>
          <div className="cr-segmented" role="group" aria-label="View">
            <button className={view === "scene" ? "is-active" : ""} aria-pressed={view === "scene"} onClick={() => setView("scene")}>Room</button>
            <button className={view === "table" ? "is-active" : ""} aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
          </div>
          <Link to="/dashboard" className="cr-back">Back to app</Link>
        </div>
      </header>

      {load.state === "loading" && <div className="cr-state"><div className="spinner" role="status" aria-label="Loading" /></div>}

      {load.state === "forbidden" && (
        <div className="cr-state cr-state--card">
          <h2 className="h2">This room is for admins</h2>
          <p>{load.message}</p>
          <p className="small">Add your e-mail to <code>ADMIN_EMAILS</code> in the backend <code>.env</code> and restart the API.</p>
        </div>
      )}

      {load.state === "error" && (
        <div className="cr-state cr-state--card" role="alert">
          <h2 className="h2">Could not load the control room</h2>
          <p>{load.message}</p>
          <button className="btn btn--primary" onClick={retry}>Try again</button>
        </div>
      )}

      {data && (
        <div className={`cr-layout${view === "table" ? " is-table" : ""}`}>
          <section className="cr-stage" aria-label="Agents">
            <div className="cr-filters" role="group" aria-label="Filter agents by status">
              {FILTERS.map(f => (
                <button key={f.id} type="button" className={filter === f.id ? "is-active" : ""} aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)} disabled={!live && f.id !== "all"}>
                  {f.label}{live && <span>{counts[f.id]}</span>}
                </button>
              ))}
              {totalCalls === 0 && (
                <span className="cr-filters__note">No AI answers {days === 1 ? "today" : `in the last ${days} days`} yet. The teachers are reading at their desks.</span>
              )}
            </div>

            {view === "scene" ? (
              webgl ? (
                <div className="cr-world">
                  <Suspense fallback={<div className="cr-state"><div className="spinner" role="status" aria-label="Loading the room" /></div>}>
                    <ControlRoomScene live={liveAgents} selected={selected} filter={filter} reduced={reduced} onSelect={select} />
                  </Suspense>
                  <ul className="visually-hidden" aria-live="polite">
                    {liveAgents?.map(a => <li key={a.agent}>{AGENT_LOOKS[a.agent].name}: {STATE_META[a.state].label}. {a.detail}</li>)}
                  </ul>
                </div>
              ) : (
                <div className="cr-fallback">
                  <StaffRoomScene agents={agents} periodLabel={periodLabel} selected={selected} onSelect={agent => select(agent)} />
                  <p className="cr-footnote">This browser can't show the 3D room, so here is the simple view.</p>
                </div>
              )
            ) : (
              <div className="cr-table-wrap">
                <table className="cr-table">
                  <caption>AI usage per agent, {periodLabel.toLowerCase()}</caption>
                  <thead>
                    <tr><th scope="col">Agent</th><th scope="col">Now</th><th scope="col">Calls</th><th scope="col">Failed</th>
                      <th scope="col">Tokens</th><th scope="col">Learners</th><th scope="col">Models</th></tr>
                  </thead>
                  <tbody>
                    {agents.filter(a => matchesFilter(liveAgents?.find(l => l.agent === a.agent)?.state ?? "idle", filter)).map(agent => {
                      const state = liveAgents?.find(l => l.agent === agent.agent)?.state;
                      return (
                        <tr key={agent.agent} className={selected === agent.agent ? "is-selected" : ""}>
                          <th scope="row">
                            <button className="cr-table__name" onClick={() => setSelected(agent.agent)}>
                              <span className="cr-swatch" style={{ background: AGENT_LOOKS[agent.agent].color }} aria-hidden="true" />
                              {AGENT_LOOKS[agent.agent].name} · {AGENT_LOOKS[agent.agent].subject}
                            </button>
                          </th>
                          <td>{state ? <span className="cr-chip" style={{ "--state": STATE_META[state].color } as React.CSSProperties}>{STATE_META[state].label}</span> : "–"}</td>
                          <td>{agent.calls}</td>
                          <td>{agent.failures} ({Math.round(agent.failure_rate * 100)}%)</td>
                          <td>{number.format(agent.tokens)}</td>
                          <td>{agent.learners}</td>
                          <td>{agent.models.join(", ") || "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="cr-side">
            {selectedAgent ? (
              <AgentPanel agent={selectedAgent} days={days} generatedAt={data.generated_at} onClose={() => setSelected(null)}
                live={liveAgents?.find(a => a.agent === selectedAgent.agent)}
                recent={live?.recent.filter(e => e.agent === selectedAgent.agent)} />
            ) : (
              <>
                <ActivityPanel live={live} filter={filter} now={now} onSelect={agent => setSelected(agent)} />
                <TaskPanel live={live} usage={agents} periodLabel={periodLabel} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
