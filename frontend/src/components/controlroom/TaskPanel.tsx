import type { AgentsLive, AgentUsage } from "../../lib/agentsApi";
import { AGENT_LOOKS } from "../staffroom/agents";
import { seconds } from "./liveStates";

interface TaskPanelProps {
  live:        AgentsLive | null;
  usage:       AgentUsage[];
  periodLabel: string;
}

const time = new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" });

export default function TaskPanel({ live, usage, periodLabel }: TaskPanelProps) {
  const agents = live?.agents ?? [];
  const running = agents.filter(a => a.running > 0);
  const queued = agents.reduce((sum, a) => sum + a.queued, 0);
  const inProgress = agents.reduce((sum, a) => sum + a.running, 0);
  const calls = usage.reduce((sum, a) => sum + a.calls, 0);
  const failed = usage.reduce((sum, a) => sum + a.failures, 0);
  const slowest = Math.max(1, ...agents.map(a => a.average_ms ?? 0));

  return (
    <section className="cr-panel" aria-labelledby="cr-tasks-title">
      <header className="cr-panel__head">
        <h2 id="cr-tasks-title" className="cr-panel__title">Task monitor</h2>
        <span className="cr-panel__hint">{periodLabel.toLowerCase()}</span>
      </header>

      <dl className="cr-tiles">
        <div><dt>In progress</dt><dd>{inProgress}</dd>{queued > 0 && <small>{queued} queued</small>}</div>
        <div><dt>Answered</dt><dd>{calls - failed}</dd></div>
        <div data-bad={failed > 0}><dt>Failed</dt><dd>{failed}</dd>{calls > 0 && <small>{Math.round((failed / calls) * 100)}%</small>}</div>
      </dl>

      {running.length > 0 && (
        <>
          <h3 className="cr-panel__sub">Running</h3>
          <ul className="cr-running">
            {running.map(a => (
              <li key={a.agent}>
                <span className="cr-swatch" style={{ background: AGENT_LOOKS[a.agent].color }} aria-hidden="true" />
                {AGENT_LOOKS[a.agent].name}
                <span>{a.running > 1 ? `${a.running} calls · ` : ""}{seconds(a.running_ms)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="cr-panel__sub">Response time</h3>
      <ul className="cr-timing">
        {agents.map(a => (
          <li key={a.agent}>
            <span className="cr-timing__name">{AGENT_LOOKS[a.agent].name}</span>
            <span className="cr-timing__bar" aria-hidden="true">
              <span style={{ width: `${((a.average_ms ?? 0) / slowest) * 100}%`, background: AGENT_LOOKS[a.agent].color }} />
            </span>
            <span className="cr-timing__value">{seconds(a.average_ms)}</span>
          </li>
        ))}
      </ul>
      {live && <p className="cr-footnote">Average of successful answers since the server started at {time.format(new Date(live.tracking_since))}.</p>}
    </section>
  );
}
