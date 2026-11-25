import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { AgentName, AgentUsage } from "../../lib/agentsApi";
import Teacher from "./Teacher";
import { AGENT_LOOKS, moodOf } from "./agents";

const WIDTH = 1000;
const HEIGHT = 560;
const FLOOR_TOP = 300;
const WALK = { left: 90, right: 910, top: 395, bottom: 520 };
const DESK_X = [150, 325, 500, 675, 850];
const DESK_Y = 318;

interface Walker {
  x: number;
  y: number;
  tx: number;
  ty: number;
  facing: 1 | -1;
  waitUntil: number;
}

function randomSpot(): { x: number; y: number } {
  return {
    x: WALK.left + Math.random() * (WALK.right - WALK.left),
    y: WALK.top + Math.random() * (WALK.bottom - WALK.top),
  };
}

function depthScale(y: number): number {
  return 0.86 + ((y - WALK.top) / (WALK.bottom - WALK.top)) * 0.24;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface SceneProps {
  agents:      AgentUsage[];
  periodLabel: string;
  selected:    AgentName | null;
  onSelect:    (agent: AgentName) => void;
}

export default function StaffRoomScene({ agents, periodLabel, selected, onSelect }: SceneProps) {
  const nodes = useRef(new Map<AgentName, SVGGElement>());
  const walkers = useRef(new Map<AgentName, Walker>());
  const hourHand = useRef<SVGLineElement>(null);
  const minuteHand = useRef<SVGLineElement>(null);
  const [hovered, setHovered] = useState<AgentName | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const pausedRef = useRef<Set<AgentName>>(new Set());

  const maxCalls = Math.max(1, ...agents.map(a => a.calls));
  const total = agents.reduce((sum, a) => sum + a.calls, 0);
  const busiest = useMemo(
    () => agents.reduce<AgentUsage | null>((best, a) => (a.calls > (best?.calls ?? 0) ? a : best), null),
    [agents],
  );

  useEffect(() => {
    pausedRef.current = new Set([hovered, selected].filter((a): a is AgentName => a !== null));
  }, [hovered, selected]);

  useEffect(() => {
    const reduced = prefersReducedMotion();
    const active = agents.filter(a => a.calls > 0);
    active.forEach((agent, index) => {
      if (!walkers.current.has(agent.agent)) {
        const spot = reduced
          ? { x: WALK.left + ((index + 0.5) / active.length) * (WALK.right - WALK.left), y: (WALK.top + WALK.bottom) / 2 }
          : randomSpot();
        walkers.current.set(agent.agent, { ...spot, tx: spot.x, ty: spot.y, facing: 1, waitUntil: 0 });
      }
    });
    for (const name of [...walkers.current.keys()]) {
      if (!active.some(a => a.agent === name)) walkers.current.delete(name);
    }

    const place = (name: AgentName, walker: Walker, moving: boolean) => {
      const node = nodes.current.get(name);
      if (!node) return;
      const scale = depthScale(walker.y);
      node.setAttribute("transform", `translate(${walker.x.toFixed(1)} ${walker.y.toFixed(1)}) scale(${scale.toFixed(3)})`);
      node.querySelector(".teacher-flip")?.setAttribute("transform", `scale(${walker.facing} 1)`);
      node.classList.toggle("is-moving", moving);
    };

    const tickClock = () => {
      const now = new Date();
      const minutes = now.getMinutes() + now.getSeconds() / 60;
      hourHand.current?.setAttribute("transform", `rotate(${((now.getHours() % 12) + minutes / 60) * 30})`);
      minuteHand.current?.setAttribute("transform", `rotate(${minutes * 6})`);
    };

    tickClock();
    if (reduced) {
      walkers.current.forEach((walker, name) => place(name, walker, false));
      return;
    }

    let frame = 0;
    let last = performance.now();
    let lastClock = last;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const agent of active) {
        const walker = walkers.current.get(agent.agent);
        if (!walker) continue;
        if (pausedRef.current.has(agent.agent) || now < walker.waitUntil) {
          place(agent.agent, walker, false);
          continue;
        }
        const activity = agent.calls / maxCalls;
        const tired = moodOf(agent.calls, agent.failure_rate) === "tired";
        const speed = (32 + 78 * activity) * (tired ? 0.45 : 1);
        const dx = walker.tx - walker.x;
        const dy = walker.ty - walker.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 2) {
          const next = randomSpot();
          walker.tx = next.x;
          walker.ty = next.y;
          walker.waitUntil = now + 600 + Math.random() * (tired ? 2600 : 1400);
          place(agent.agent, walker, false);
          continue;
        }
        const step = Math.min(distance, speed * dt);
        walker.x += (dx / distance) * step;
        walker.y += (dy / distance) * step;
        if (Math.abs(dx) > 1) walker.facing = dx < 0 ? -1 : 1;
        place(agent.agent, walker, true);
      }
      if (now - lastClock > 10000) {
        tickClock();
        lastClock = now;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [agents, maxCalls]);

  const positionOf = (agent: AgentUsage, index: number) => {
    if (agent.calls === 0) return { x: DESK_X[index], y: DESK_Y };
    const walker = walkers.current.get(agent.agent);
    return walker ? { x: walker.x, y: walker.y } : { x: DESK_X[index], y: WALK.top };
  };

  const showTip = (agent: AgentUsage, index: number) => {
    setHovered(agent.agent);
    const { x, y } = positionOf(agent, index);
    setTip({ x: (x / WIDTH) * 100, y: ((y - 120) / HEIGHT) * 100 });
  };

  const hideTip = () => {
    setHovered(null);
    setTip(null);
  };

  const onKey = (event: KeyboardEvent, agent: AgentName) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(agent);
    }
  };

  const teacherNode = (agent: AgentUsage, index: number) => {
    const look = AGENT_LOOKS[agent.agent];
    const mood = moodOf(agent.calls, agent.failure_rate);
    const idle = mood === "idle";
    const isSelected = selected === agent.agent;
    return (
      <g
        key={agent.agent}
        ref={node => { if (node) nodes.current.set(agent.agent, node); else nodes.current.delete(agent.agent); }}
        transform={idle ? `translate(${DESK_X[index]} ${DESK_Y})` : `translate(${DESK_X[index]} ${WALK.top})`}
        className={`staff-teacher${isSelected ? " is-selected" : ""}`}
        role="button"
        tabIndex={0}
        aria-label={`${look.name}, ${look.subject} teacher: ${agent.calls} calls, ${agent.failures} failed. Open metrics.`}
        aria-pressed={isSelected}
        onClick={() => onSelect(agent.agent)}
        onKeyDown={event => onKey(event, agent.agent)}
        onPointerEnter={() => showTip(agent, index)}
        onPointerLeave={hideTip}
        onFocus={() => showTip(agent, index)}
        onBlur={hideTip}
      >
        <rect x="-34" y="-128" width="68" height="160" fill="transparent" />
        {isSelected && <ellipse cx="0" cy="2" rx="30" ry="8" fill="none" stroke={look.color} strokeWidth="3" />}
        <g className="teacher-flip">
          <Teacher look={look} mood={mood} />
        </g>
        {idle && (
          <text className="staff-teacher__zz" x="20" y="-112">z z</text>
        )}
        <g className="staff-teacher__tag" transform={idle ? "translate(0 -136)" : "translate(0 26)"}>
          <rect x="-46" y="-11" width="92" height="22" rx="11" fill="#fefdfb" stroke="#bbc994" />
          <circle cx="-33" cy="0" r="4.5" fill={look.color} />
          <text x="5" y="4.5" textAnchor="middle">{look.name} · {agent.calls}</text>
        </g>
      </g>
    );
  };

  const hoveredAgent = agents.find(a => a.agent === hovered);

  return (
    <div className="staff-scene">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="staff-scene__svg" role="group" aria-label="Staff room with the five AI teachers">
        <defs>
          <pattern id="staff-wall-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M48 0 L0 0 0 48" fill="none" stroke="#e3eaae" strokeWidth="1.5" />
          </pattern>
          <pattern id="staff-floor" width="120" height="34" patternUnits="userSpaceOnUse">
            <rect width="120" height="34" fill="#efe3c8" />
            <path d="M0 33 H120 M60 0 V34" stroke="#e2d2b0" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width={WIDTH} height={FLOOR_TOP} fill="#f0f5d7" />
        <rect width={WIDTH} height={FLOOR_TOP} fill="url(#staff-wall-grid)" />
        <rect y={FLOOR_TOP} width={WIDTH} height={HEIGHT - FLOOR_TOP} fill="url(#staff-floor)" />
        <rect y={FLOOR_TOP - 8} width={WIDTH} height="10" fill="#c7d49c" />

        <g transform="translate(70 60)">
          <rect width="150" height="130" rx="8" fill="#cfe8f5" stroke="#8e9868" strokeWidth="6" />
          <path d="M75 0 V130 M0 65 H150" stroke="#8e9868" strokeWidth="5" />
          <circle cx="112" cy="34" r="14" fill="#fff3b0" />
          <path d="M10 118 Q40 92 70 112 Q100 90 140 116 L140 124 L10 124 Z" fill="#c7d49c" />
        </g>

        <g transform="translate(330 38)">
          <rect width="340" height="150" rx="10" fill="#33503f" stroke="#b55732" strokeWidth="8" />
          <text className="staff-board__title" x="170" y="50" textAnchor="middle">{total} AI answers</text>
          <text className="staff-board__line" x="170" y="86" textAnchor="middle">{periodLabel}</text>
          <text className="staff-board__line" x="170" y="118" textAnchor="middle">
            {busiest ? `Busiest: ${AGENT_LOOKS[busiest.agent].name} (${AGENT_LOOKS[busiest.agent].subject})` : "Everyone is reading"}
          </text>
          <rect x="250" y="138" width="40" height="8" rx="3" fill="#fefdfb" />
        </g>

        <g transform="translate(860 110)">
          <circle r="44" fill="#fefdfb" stroke="#2e3320" strokeWidth="5" />
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} y1="-36" y2="-30" stroke="#2e3320" strokeWidth="3" transform={`rotate(${i * 30})`} />
          ))}
          <line ref={hourHand} y2="-20" stroke="#2e3320" strokeWidth="5" strokeLinecap="round" />
          <line ref={minuteHand} y2="-31" stroke="#b55732" strokeWidth="3" strokeLinecap="round" />
          <circle r="4" fill="#2e3320" />
        </g>

        {agents.map((agent, index) => (agent.calls === 0 ? teacherNode(agent, index) : null))}

        {DESK_X.map(x => (
          <g key={x} transform={`translate(${x} ${DESK_Y - 22})`}>
            <rect x="-62" y="0" width="124" height="14" rx="4" fill="#b55732" />
            <rect x="-56" y="14" width="112" height="36" fill="#c9734e" />
            <rect x="-54" y="50" width="8" height="26" fill="#9c4a2a" />
            <rect x="46" y="50" width="8" height="26" fill="#9c4a2a" />
          </g>
        ))}

        {agents.map((agent, index) => (agent.calls > 0 ? teacherNode(agent, index) : null))}
      </svg>

      {hoveredAgent && tip && (
        <div className="staff-tip" style={{ left: `${tip.x}%`, top: `${tip.y}%` }} role="tooltip">
          <strong>{AGENT_LOOKS[hoveredAgent.agent].name} · {AGENT_LOOKS[hoveredAgent.agent].subject}</strong>
          <span>{hoveredAgent.calls} calls · {hoveredAgent.failures} failed</span>
          <span className="staff-tip__hint">Click for metrics</span>
        </div>
      )}
    </div>
  );
}
