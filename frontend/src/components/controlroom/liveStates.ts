import type { AgentLive, AgentName, AgentState } from "../../lib/agentsApi";

export const AGENT_ORDER: AgentName[] = ["grammar", "vocabulary", "conversation", "pronunciation", "cultural"];

export const STATE_META: Record<AgentState, { label: string; color: string; group: StatusFilter }> = {
  idle:     { label: "Idle",     color: "#a9b39a", group: "idle" },
  waiting:  { label: "Waiting",  color: "#e3ad5b", group: "active" },
  thinking: { label: "Thinking", color: "#9fb8f0", group: "active" },
  working:  { label: "Working",  color: "#7fd6a6", group: "active" },
  success:  { label: "Answered", color: "#b6e388", group: "active" },
  error:    { label: "Error",    color: "#f08a7e", group: "attention" },
  blocked:  { label: "Blocked",  color: "#f2b84b", group: "attention" },
};

export type StatusFilter = "all" | "active" | "idle" | "attention";

export const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all",       label: "All" },
  { id: "active",    label: "Active" },
  { id: "idle",      label: "Idle" },
  { id: "attention", label: "Needs attention" },
];

export function matchesFilter(state: AgentState, filter: StatusFilter): boolean {
  return filter === "all" || STATE_META[state].group === filter;
}

export function liveFor(agents: AgentLive[] | undefined, name: AgentName): AgentLive | undefined {
  return agents?.find(a => a.agent === name);
}

export function seconds(ms: number | null | undefined): string {
  if (ms == null) return "–";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}
