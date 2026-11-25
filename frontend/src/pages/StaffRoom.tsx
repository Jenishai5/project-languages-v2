import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AgentPanel from "../components/staffroom/AgentPanel";
import StaffRoomScene from "../components/staffroom/StaffRoomScene";
import { AGENT_LOOKS } from "../components/staffroom/agents";
import { ApiError, fetchAiUsageSummary, type AgentName, type AiUsageSummary } from "../lib/agentsApi";
import "../styles/staffroom.css";

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

export default function StaffRoom() {
  const [days, setDays] = useState(7);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [view, setView] = useState<"scene" | "table">("scene");
  const [selected, setSelected] = useState<AgentName | null>(null);
  const [attempt, setAttempt] = useState(0);

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

  const choosePeriod = (next: number) => {
    if (next === days) return;
    setLoad({ state: "loading" });
    setDays(next);
  };

  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    setAttempt(n => n + 1);
  }, []);

  const periodLabel = PERIODS.find(p => p.days === days)?.label ?? `${days} days`;
  const data = load.state === "ready" ? load.data : null;
  const agents = data?.agents ?? [];
  const totalCalls = agents.reduce((sum, a) => sum + a.calls, 0);
  const totalFailures = agents.reduce((sum, a) => sum + a.failures, 0);
  const totalTokens = agents.reduce((sum, a) => sum + a.tokens, 0);
  const selectedAgent = agents.find(a => a.agent === selected) ?? null;

  return (
    <div className="staff-room">
      <header className="staff-room__bar">
        <div>
          <p className="eyebrow">TurtleTalk · admin</p>
          <h1 className="h1">Staff room</h1>
        </div>
        <Link to="/dashboard" className="btn btn--secondary">Back to app</Link>
      </header>

      <div className="staff-room__filters">
        <div className="segmented" role="group" aria-label="Period">
          {PERIODS.map(period => (
            <button key={period.days} className={period.days === days ? "is-active" : ""} aria-pressed={period.days === days}
              onClick={() => choosePeriod(period.days)}>
              {period.label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="View">
          <button className={view === "scene" ? "is-active" : ""} aria-pressed={view === "scene"} onClick={() => setView("scene")}>
            Room
          </button>
          <button className={view === "table" ? "is-active" : ""} aria-pressed={view === "table"} onClick={() => setView("table")}>
            Table
          </button>
        </div>
      </div>

      {load.state === "loading" && <div className="staff-room__state"><div className="spinner" role="status" aria-label="Loading" /></div>}

      {load.state === "forbidden" && (
        <div className="staff-room__state staff-room__state--card">
          <h2 className="h2">This room is for admins</h2>
          <p className="muted">{load.message}</p>
          <p className="small">Add your e-mail to <code>ADMIN_EMAILS</code> in the backend <code>.env</code> and restart the API.</p>
        </div>
      )}

      {load.state === "error" && (
        <div className="staff-room__state staff-room__state--card" role="alert">
          <h2 className="h2">Could not load the staff room</h2>
          <p className="muted">{load.message}</p>
          <button className="btn btn--primary" onClick={retry}>Try again</button>
        </div>
      )}

      {data && (
        <>
          <dl className="staff-kpis">
            <div><dt>AI answers</dt><dd>{number.format(totalCalls)}</dd></div>
            <div>
              <dt>Failed</dt>
              <dd>{totalFailures} <small>({totalCalls ? Math.round((totalFailures / totalCalls) * 100) : 0}%)</small></dd>
            </div>
            <div><dt>Tokens</dt><dd>{number.format(totalTokens)}</dd></div>
            <div><dt>Active teachers</dt><dd>{agents.filter(a => a.calls > 0).length} of {agents.length}</dd></div>
          </dl>

          {totalCalls === 0 && (
            <p className="staff-room__empty">No AI answers {days === 1 ? "today" : `in the last ${days} days`} yet. The teachers are reading at their desks.</p>
          )}

          <div className={`staff-room__stage${selectedAgent ? " has-panel" : ""}`}>
            {view === "scene" ? (
              <StaffRoomScene agents={agents} periodLabel={periodLabel} selected={selected}
                onSelect={agent => setSelected(current => (current === agent ? null : agent))} />
            ) : (
              <div className="staff-table-wrap">
                <table className="staff-table">
                  <caption className="small">AI usage per agent, {periodLabel.toLowerCase()}</caption>
                  <thead>
                    <tr><th scope="col">Teacher</th><th scope="col">Calls</th><th scope="col">Failed</th>
                      <th scope="col">Tokens</th><th scope="col">Learners</th><th scope="col">Models</th></tr>
                  </thead>
                  <tbody>
                    {agents.map(agent => (
                      <tr key={agent.agent} className={selected === agent.agent ? "is-selected" : ""}>
                        <th scope="row">
                          <button className="staff-table__name" onClick={() => setSelected(agent.agent)}>
                            <span className="staff-table__dot" style={{ background: AGENT_LOOKS[agent.agent].color }} aria-hidden="true" />
                            {AGENT_LOOKS[agent.agent].name} · {AGENT_LOOKS[agent.agent].subject}
                          </button>
                        </th>
                        <td>{agent.calls}</td>
                        <td>{agent.failures} ({Math.round(agent.failure_rate * 100)}%)</td>
                        <td>{number.format(agent.tokens)}</td>
                        <td>{agent.learners}</td>
                        <td>{agent.models.join(", ") || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {selectedAgent && data && (
              <AgentPanel agent={selectedAgent} days={days} generatedAt={data.generated_at} onClose={() => setSelected(null)} />
            )}
          </div>
          <p className="small staff-room__hint">Busy teachers walk faster. A teacher with many failed answers gets tired. Click a teacher to see their metrics.</p>
        </>
      )}
    </div>
  );
}
