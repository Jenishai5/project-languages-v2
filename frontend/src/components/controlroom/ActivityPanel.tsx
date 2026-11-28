import type { AgentName, AgentsLive } from "../../lib/agentsApi";
import { AGENT_LOOKS } from "../staffroom/agents";
import { ago, STATE_META, matchesFilter, type StatusFilter } from "./liveStates";

interface ActivityPanelProps {
  live:     AgentsLive | null;
  filter:   StatusFilter;
  now:      number;
  onSelect: (agent: AgentName) => void;
}

export default function ActivityPanel({ live, filter, now, onSelect }: ActivityPanelProps) {
  const agents = (live?.agents ?? []).filter(a => matchesFilter(a.state, filter));
  const attention = (live?.agents ?? []).filter(a => a.state === "error" || a.state === "blocked");
  const recent = (live?.recent ?? []).filter(e => agents.some(a => a.agent === e.agent)).slice(0, 12);

  return (
    <section className="cr-panel" aria-labelledby="cr-activity-title">
      <header className="cr-panel__head">
        <h2 id="cr-activity-title" className="cr-panel__title">Agent activity</h2>
        <span className="cr-panel__hint">live</span>
      </header>

      {attention.length > 0 && (
        <ul className="cr-attention" aria-label="Needs attention">
          {attention.map(a => (
            <li key={a.agent} data-state={a.state}>
              <button type="button" onClick={() => onSelect(a.agent)}>
                <span className="cr-attention__title"><strong>{AGENT_LOOKS[a.agent].name}</strong> · {STATE_META[a.state].label}</span>
                <span>{a.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="cr-panel__sub">Right now</h3>
      {live ? (
        <ul className="cr-now">
          {agents.map(a => (
            <li key={a.agent}>
              <button type="button" onClick={() => onSelect(a.agent)} className="cr-now__row">
                <span className="cr-swatch" style={{ background: AGENT_LOOKS[a.agent].color }} aria-hidden="true" />
                <span className="cr-now__name">{AGENT_LOOKS[a.agent].name}</span>
                <span className="cr-chip" style={{ "--state": STATE_META[a.state].color } as React.CSSProperties}>
                  {STATE_META[a.state].label}
                </span>
                <span className="cr-now__detail">{a.detail}</span>
              </button>
            </li>
          ))}
          {agents.length === 0 && <li className="cr-empty">No agents match this filter.</li>}
        </ul>
      ) : (
        <p className="cr-empty">Connecting to live data…</p>
      )}

      <h3 className="cr-panel__sub">Latest answers</h3>
      {recent.length ? (
        <ol className="cr-feed">
          {recent.map(e => (
            <li key={e.id} data-ok={e.succeeded}>
              <span className="cr-swatch" style={{ background: AGENT_LOOKS[e.agent].color }} aria-hidden="true" />
              <span className="cr-feed__text">
                <span><strong>{AGENT_LOOKS[e.agent].name}</strong> {e.succeeded ? "answered" : "failed"}</span>
                <small>{e.model}{e.tokens ? ` · ${e.tokens} tokens` : ""}</small>
              </span>
              <time dateTime={e.created_at}>{ago(e.created_at, now)}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="cr-empty">No answers in the last 7 days.</p>
      )}
    </section>
  );
}
