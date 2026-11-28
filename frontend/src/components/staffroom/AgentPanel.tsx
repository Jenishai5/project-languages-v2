import { useState } from "react";
import type { AgentDay, AgentEvent, AgentLive, AgentUsage } from "../../lib/agentsApi";
import { STATE_META, ago, seconds } from "../controlroom/liveStates";
import { AGENT_LOOKS, moodOf } from "./agents";

const CHART = { width: 340, height: 150, top: 14, bottom: 22, left: 4, right: 4 };
const number = new Intl.NumberFormat("en");
const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

function periodDays(generatedAt: string, days: number, daily: AgentDay[]): AgentDay[] {
  const byDay = new Map(daily.map(d => [d.day, d]));
  const end = new Date(generatedAt);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - (days - 1 - i)));
    const key = date.toISOString().slice(0, 10);
    return byDay.get(key) ?? { day: key, calls: 0, failures: 0, tokens: 0 };
  });
}

function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, height, width / 2);
  return `M${x} ${y + height} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + width - r} Q${x + width} ${y} ${x + width} ${y + r} V${y + height} Z`;
}

function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function CallsChart({ agent, days, generatedAt }: { agent: AgentUsage; days: number; generatedAt: string }) {
  const [active, setActive] = useState<AgentDay | null>(null);
  const series = periodDays(generatedAt, days, agent.daily);
  const max = Math.max(1, ...series.map(d => d.calls));
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const slot = plotWidth / series.length;
  const barWidth = Math.max(3, slot - 2);
  const color = AGENT_LOOKS[agent.agent].color;
  const baseline = CHART.top + plotHeight;

  return (
    <figure className="agent-chart">
      <figcaption className="agent-chart__head">
        <span>Calls per day</span>
        <span className="agent-chart__readout" aria-live="polite">
          {active
            ? `${dayLabel.format(new Date(active.day))}: ${active.calls} calls · ${active.failures} failed · ${number.format(active.tokens)} tokens`
            : "Point at a bar"}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img"
        aria-label={`Calls per day for the last ${days} days, highest ${max}`}>
        <line x1={CHART.left} x2={CHART.width - CHART.right} y1={CHART.top} y2={CHART.top} className="agent-chart__grid" />
        <line x1={CHART.left} x2={CHART.width - CHART.right} y1={CHART.top + plotHeight / 2} y2={CHART.top + plotHeight / 2}
          className="agent-chart__grid" />
        <text x={CHART.width - CHART.right} y={CHART.top - 4} textAnchor="end" className="agent-chart__axis">{max}</text>
        {series.map((day, i) => {
          const height = (day.calls / max) * plotHeight;
          const x = CHART.left + i * slot + (slot - barWidth) / 2;
          const isActive = active?.day === day.day;
          return (
            <g key={day.day}>
              {day.calls > 0 && (
                <path d={barPath(x, baseline - height, barWidth, height)} fill={color}
                  opacity={active && !isActive ? 0.45 : 1} />
              )}
              <rect x={CHART.left + i * slot} y={CHART.top} width={slot} height={plotHeight + CHART.bottom}
                fill="transparent" onPointerEnter={() => setActive(day)} onPointerLeave={() => setActive(null)}>
                <title>{`${day.day}: ${day.calls} calls`}</title>
              </rect>
            </g>
          );
        })}
        <line x1={CHART.left} x2={CHART.width - CHART.right} y1={baseline} y2={baseline} className="agent-chart__baseline" />
        <text x={CHART.left} y={CHART.height - 4} className="agent-chart__axis">{dayLabel.format(new Date(series[0].day))}</text>
        <text x={CHART.width - CHART.right} y={CHART.height - 4} textAnchor="end" className="agent-chart__axis">Today</text>
      </svg>
    </figure>
  );
}

interface AgentPanelProps {
  agent:       AgentUsage;
  days:        number;
  generatedAt: string;
  onClose:     () => void;
  live?:       AgentLive;
  recent?:     AgentEvent[];
}

function LiveSection({ live, recent }: { live: AgentLive; recent: AgentEvent[] }) {
  const meta = STATE_META[live.state];
  return (
    <section className="agent-live" aria-label="Live">
      <p className="agent-live__state" style={{ "--state": meta.color } as React.CSSProperties}>
        <span className="agent-live__dot" aria-hidden="true" />
        <strong>{meta.label}</strong> · {live.detail}
      </p>
      <dl className="agent-facts">
        <div><dt>Running now</dt><dd>{live.running ? `${live.running} · ${seconds(live.running_ms)}` : "nothing"}{live.queued ? ` (+${live.queued} queued)` : ""}</dd></div>
        <div><dt>Usual response</dt><dd>{seconds(live.average_ms)}</dd></div>
        <div><dt>Today</dt><dd>{live.calls_today - live.failures_today} answered · {live.failures_today} failed</dd></div>
      </dl>
      {recent.length > 0 && (
        <ol className="agent-live__history" aria-label="Execution history">
          {recent.slice(0, 8).map(e => (
            <li key={e.id} data-ok={e.succeeded}>
              <span>{e.succeeded ? "Answered" : "Failed"}</span>
              <code>{e.model}</code>
              <time dateTime={e.created_at}>{ago(e.created_at)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function AgentPanel({ agent, days, generatedAt, onClose, live, recent = [] }: AgentPanelProps) {
  const look = AGENT_LOOKS[agent.agent];
  const mood = moodOf(agent.calls, agent.failure_rate);
  const moodText = {
    idle:    "Reading at the desk: no calls in this period.",
    walking: "Busy walking between learners.",
    tired:   "Tired: more than 1 in 5 calls failed.",
  }[mood];

  return (
    <aside className="agent-panel" aria-labelledby="agent-panel-title">
      <div className="agent-panel__head">
        <span className="agent-panel__dot" style={{ background: look.color }} aria-hidden="true" />
        <div>
          <p className="eyebrow">{look.subject} agent</p>
          <h2 id="agent-panel-title" className="h2">{look.name}</h2>
        </div>
        <button className="agent-panel__close" onClick={onClose} aria-label="Close metrics">×</button>
      </div>
      <p className="muted">{look.role}</p>
      {live ? <LiveSection live={live} recent={recent} /> : <p className={`agent-panel__mood agent-panel__mood--${mood}`}>{moodText}</p>}

      <dl className="agent-stats">
        <div><dt>Calls</dt><dd>{number.format(agent.calls)}</dd></div>
        <div><dt>Failed</dt><dd>{agent.failures} <small>({Math.round(agent.failure_rate * 100)}%)</small></dd></div>
        <div><dt>Tokens</dt><dd>{number.format(agent.tokens)}</dd></div>
        <div><dt>Learners</dt><dd>{agent.learners}</dd></div>
      </dl>

      {days > 1 && <CallsChart agent={agent} days={days} generatedAt={generatedAt} />}

      <dl className="agent-facts">
        <div><dt>Last call</dt><dd>{timeAgo(agent.last_call_at)}</dd></div>
        <div>
          <dt>Models</dt>
          <dd>{agent.models.length ? agent.models.map(m => <code key={m}>{m}</code>) : "none yet"}</dd>
        </div>
        <div><dt>Tokens per call</dt><dd>{agent.calls ? number.format(Math.round(agent.tokens / agent.calls)) : "–"}</dd></div>
      </dl>
    </aside>
  );
}
