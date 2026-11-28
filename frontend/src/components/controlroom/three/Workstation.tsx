import { Html, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import type { AgentLive, AgentName, AgentState } from "../../../lib/agentsApi";
import { AGENT_LOOKS } from "../../staffroom/agents";
import { STATE_META, seconds } from "../liveStates";
import Character from "./Character";
import Confetti from "./Confetti";
import { COLORS, mat } from "./geometry";

const CHARACTER_AT: [number, number, number] = [-0.22, 0.08, 0.12];
const DESK_AT: [number, number, number] = [0.42, 0.08, 0.36];
const DESK_TURN = Math.atan2(DESK_AT[0] - CHARACTER_AT[0], DESK_AT[2] - CHARACTER_AT[2]);
const DESK_ROTATION = Math.atan2(CHARACTER_AT[0] - DESK_AT[0], CHARACTER_AT[2] - DESK_AT[2]);
const ACTIVE: AgentState[] = ["thinking", "working", "waiting"];

interface WorkstationProps {
  name:     AgentName;
  index:    number;
  live:     AgentLive | undefined;
  position: [number, number, number];
  selected: boolean;
  dimmed:   boolean;
  reduced:  boolean;
  onSelect: (agent: AgentName) => void;
  overlay:  RefObject<HTMLDivElement | null>;
  compact:  boolean;
}

function Screen({ state, reduced }: { state: AgentState; reduced: boolean }) {
  const lines = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);
  const screen = useRef<THREE.MeshStandardMaterial>(null);
  const color = STATE_META[state].color;
  const lineColor = useMemo(() => `#${new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.55).getHexString()}`, [color]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const busy = state === "working" ? 1 : state === "thinking" ? 0.4 : 0;
    const flash = state === "error" ? 0.5 + Math.sin(t * 6) * 0.5 : 0;
    if (screen.current) screen.current.emissiveIntensity = 0.18 + busy * 0.35 + flash * 0.6;
    if (glow.current) glow.current.intensity = (0.2 + busy * 0.55 + flash * 0.7) * (state === "idle" ? 0.5 : 1);
    lines.current?.children.forEach((line, i) => {
      const base = [0.8, 0.55, 0.9, 0.4, 0.7][i];
      const target = busy > 0 && !reduced ? 0.25 + Math.abs(Math.sin(t * (1.3 + i * 0.37) + i * 2.1)) * 0.75 : base;
      line.scale.x = THREE.MathUtils.lerp(line.scale.x, target, 0.12);
      line.position.x = -0.18 + (line.scale.x * 0.36) / 2;
    });
  });

  return (
    <group position={[0, 0.27, -0.06]}>
      <RoundedBox args={[0.52, 0.34, 0.035]} radius={0.02} smoothness={3} material={mat(COLORS.frame, 0.45)} castShadow />
      <mesh position={[0, 0, 0.019]}>
        <planeGeometry args={[0.47, 0.29]} />
        <meshStandardMaterial ref={screen} color="#11140e" roughness={0.3} emissive={color} emissiveIntensity={0.2} />
      </mesh>
      <group ref={lines} position={[0, 0.09, 0.021]}>
        {[0, 1, 2, 3, 4].map(i => (
          <mesh key={i} position={[0, -i * 0.045, 0]}>
            <planeGeometry args={[0.36, 0.014]} />
            <meshBasicMaterial color={lineColor} transparent opacity={0.85} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, -0.13, -0.019]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.3, 0.025]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <pointLight ref={glow} position={[0, 0, 0.35]} color={color} distance={1.6} decay={2} />
      <mesh position={[0, -0.22, -0.01]} material={mat(COLORS.frame, 0.5)}>
        <cylinderGeometry args={[0.02, 0.025, 0.12, 10]} />
      </mesh>
      <mesh position={[0, -0.28, -0.01]} material={mat(COLORS.frame, 0.5)}>
        <cylinderGeometry args={[0.09, 0.1, 0.015, 20]} />
      </mesh>
    </group>
  );
}

function Desk({ state, reduced }: { state: AgentState; reduced: boolean }) {
  return (
    <group position={DESK_AT} rotation={[0, DESK_ROTATION, 0]}>
      <RoundedBox args={[0.9, 0.05, 0.52]} radius={0.02} smoothness={3} position={[0, 0.76, 0]} material={mat(COLORS.desk, 0.7)} castShadow receiveShadow />
      {[[-0.4, -0.21], [0.4, -0.21], [-0.4, 0.21], [0.4, 0.21]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.37, z]} material={mat(COLORS.deskLeg, 0.7)} castShadow>
          <cylinderGeometry args={[0.022, 0.018, 0.74, 10]} />
        </mesh>
      ))}
      <group position={[0, 0.8, 0]}>
        <Screen state={state} reduced={reduced} />
        <RoundedBox args={[0.38, 0.02, 0.12]} radius={0.008} smoothness={2} position={[0, 0.005, 0.15]} material={mat(COLORS.key, 0.6)} castShadow />
        <mesh position={[0.3, 0.04, 0.05]} material={mat("#f4ead8", 0.6)} castShadow>
          <cylinderGeometry args={[0.035, 0.03, 0.08, 16]} />
        </mesh>
      </group>
    </group>
  );
}

function Beacon({ state, reduced }: { state: AgentState; reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const show = state === "error" || state === "blocked";
  useFrame(({ clock }, delta) => {
    if (!ref.current) return;
    const target = show ? 1 : 0.001;
    const s = THREE.MathUtils.damp(ref.current.scale.x, target, 8, delta);
    ref.current.scale.setScalar(s);
    if (!reduced) {
      ref.current.rotation.y = clock.elapsedTime * 1.6;
      ref.current.position.y = 1.62 + Math.sin(clock.elapsedTime * 2.4) * 0.04;
    }
  });
  const color = STATE_META[state === "blocked" ? "blocked" : "error"].color;
  return (
    <group ref={ref} position={[0.42, 1.62, 0.36]} scale={0.001}>
      <mesh castShadow>
        <octahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.35} />
      </mesh>
    </group>
  );
}

function Barrier({ active }: { active: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const stripes = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 ? "#fefdfb" : "#e3ad5b";
        ctx.beginPath();
        ctx.moveTo(i * 16, 16);
        ctx.lineTo(i * 16 + 16, 0);
        ctx.lineTo(i * 16 + 32, 0);
        ctx.lineTo(i * 16 + 16, 16);
        ctx.fill();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const target = active ? 1 : 0.001;
    ref.current.scale.y = THREE.MathUtils.damp(ref.current.scale.y, target, 7, delta);
    ref.current.visible = ref.current.scale.y > 0.01;
  });
  return (
    <group ref={ref} position={[-0.78, 0.08, 0.58]} rotation={[0, 0.5, 0]} scale={[1, 0.001, 1]}>
      {[-0.2, 0.2].map(x => (
        <mesh key={x} position={[x, 0.2, 0]} material={mat("#4d4a44", 0.6)} castShadow>
          <cylinderGeometry args={[0.018, 0.022, 0.4, 10]} />
        </mesh>
      ))}
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[0.5, 0.06, 0.025]} />
        <meshStandardMaterial map={stripes} roughness={0.6} />
      </mesh>
    </group>
  );
}

function Label({ name, live, selected, dimmed, compact, onSelect }: {
  name: AgentName; live: AgentLive | undefined; selected: boolean; dimmed: boolean; compact: boolean; onSelect: () => void;
}) {
  const look = AGENT_LOOKS[name];
  const state = live?.state ?? "idle";
  const meta = STATE_META[state];
  const running = live?.running_ms ?? null;
  const typical = live?.average_ms ?? null;
  const progress = running !== null && typical ? Math.min(1, running / typical) : null;
  const answered = live ? live.calls_today - live.failures_today : 0;
  const rate = live && live.calls_today ? answered / live.calls_today : null;
  return (
    <button type="button" className={`cr-label${selected ? " is-selected" : ""}${dimmed ? " is-dimmed" : ""}${compact ? " is-compact" : ""}`}
      data-state={state} onClick={onSelect}
      aria-label={`${look.name}, ${look.subject}: ${meta.label}. ${live?.detail ?? ""}`}>
      <span className="cr-label__top">
        <span className="cr-label__name">{look.name}</span>
        <span className="cr-label__role">{look.subject}</span>
      </span>
      <span className="cr-label__state" style={{ "--state": meta.color } as React.CSSProperties}>
        <span className="cr-label__dot" aria-hidden="true" />
        {meta.label}
      </span>
      {!compact && <span className="cr-label__detail">{live?.detail ?? "Waiting for live data…"}</span>}
      {compact ? null : progress !== null ? (
        <span className="cr-label__bar" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></span>
      ) : rate !== null ? (
        <span className="cr-label__bar cr-label__bar--rate" aria-hidden="true"><span style={{ width: `${rate * 100}%` }} /></span>
      ) : null}
      {!compact && <span className="cr-label__meta">
        {running !== null
          ? `${seconds(running)} so far${typical ? ` · usually ${seconds(typical)}` : ""}`
          : live ? `${answered} answered today${live.failures_today ? ` · ${live.failures_today} failed` : ""}` : ""}
      </span>}
    </button>
  );
}

export default function Workstation({ name, index, live, position, selected, dimmed, reduced, onSelect, overlay, compact }: WorkstationProps) {
  const look = AGENT_LOOKS[name];
  const state: AgentState = live?.state ?? "idle";
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const [hovered, setHovered] = useState(false);
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => { document.body.style.cursor = ""; };
  }, [hovered]);

  useFrame(({ clock }, delta) => {
    const active = ACTIVE.includes(state) || state === "error" || state === "blocked";
    if (ringMat.current) {
      ringMat.current.emissiveIntensity = (selected || hovered ? 0.7 : 0.25) + (active && !reduced ? Math.sin(clock.elapsedTime * 3) * 0.2 + 0.2 : 0);
    }
    if (group.current) {
      const s = THREE.MathUtils.damp(group.current.scale.x, dimmed ? 0.9 : 1, 6, delta);
      group.current.scale.setScalar(s);
    }
  });

  return (
    <group position={position}>
      <group ref={group}
        onClick={e => { e.stopPropagation(); onSelect(name); }}
        onPointerOver={e => { e.stopPropagation(); setHovered(true); }}
        onPointerOut={() => setHovered(false)}>
        <mesh position={[0, 0.04, 0]} material={mat(dimmed ? "#9a9a8c" : COLORS.platform, 0.85)} receiveShadow>
          <cylinderGeometry args={[1.12, 1.18, 0.08, 64]} />
        </mesh>
        <mesh position={[0, 0.082, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.02, 1.1, 64]} />
          <meshStandardMaterial ref={ringMat} roughness={0.4} color={STATE_META[state].color} emissive={STATE_META[state].color} />
        </mesh>
        <Desk state={state} reduced={reduced} />
        <Beacon state={state} reduced={reduced} />
        <Barrier active={state === "blocked"} />
        <group position={CHARACTER_AT}>
          <Character look={look} state={state} seed={index * 7.3 + 1.1} deskTurn={DESK_TURN} reduced={reduced} />
        </group>
        <Confetti active={state === "success" && !reduced} seed={index + 1} origin={[CHARACTER_AT[0], 1.9, CHARACTER_AT[2]]} />
      </group>
      <Html position={[0, 0.02, compact ? 1.25 : 1.55]} center distanceFactor={compact ? 7.5 : 5.6} zIndexRange={[20, 0]} portal={overlay as RefObject<HTMLElement>}>
        <Label name={name} live={live} selected={selected} dimmed={dimmed} compact={compact} onSelect={() => onSelect(name)} />
      </Html>
    </group>
  );
}
