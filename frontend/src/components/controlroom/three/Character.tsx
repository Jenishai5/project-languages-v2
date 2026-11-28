import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group, Mesh } from "three";
import type { AgentState } from "../../../lib/agentsApi";
import type { AgentLook } from "../../staffroom/agents";
import { Animator } from "../animation/animator";
import { legDrop } from "../animation/poses";
import { COLORS, GEO, mat, shade } from "./geometry";

interface CharacterProps {
  look:     AgentLook;
  state:    AgentState;
  seed:     number;
  deskTurn: number;
  reduced:  boolean;
}

function Hair({ look, swing }: { look: AgentLook; swing: React.RefObject<Group | null> }) {
  const hair = mat(look.hairColor, 0.78);
  switch (look.hair) {
    case "bun":
      return (
        <group>
          <mesh geometry={GEO.cap} material={hair} rotation={[-0.42, 0, 0]} castShadow />
          <group ref={swing} position={[0, 0.2, -0.12]}>
            <mesh geometry={GEO.bun} material={hair} position={[0, 0.06, -0.06]} castShadow />
          </group>
        </group>
      );
    case "short":
      return <mesh geometry={GEO.cap} material={hair} rotation={[-0.3, 0, 0]} scale={[1, 0.92, 1]} castShadow />;
    case "curly": {
      const curls: [number, number, number][] = [];
      for (let ring = 0; ring < 3; ring++) {
        const count = [1, 7, 11][ring];
        const polar = [0, 0.62, 1.1][ring];
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + ring;
          const r = 0.24;
          const y = Math.cos(polar) * r;
          const flat = Math.sin(polar) * r;
          const z = Math.sin(a) * flat;
          if (ring === 2 && z > 0.12) continue;
          curls.push([Math.cos(a) * flat, y, z]);
        }
      }
      return (
        <group>
          <mesh geometry={GEO.cap} material={hair} rotation={[-0.35, 0, 0]} />
          {curls.map((p, i) => <mesh key={i} geometry={GEO.curl} material={hair} position={p} castShadow />)}
        </group>
      );
    }
    case "long":
      return (
        <group>
          <mesh geometry={GEO.cap} material={hair} rotation={[-0.25, 0, 0]} castShadow />
          <group ref={swing} position={[0, 0.12, -0.08]}>
            <mesh geometry={GEO.hairBack} material={hair} position={[0, -0.2, -0.04]} scale={[1.18, 1, 0.55]} castShadow />
          </group>
        </group>
      );
    case "beard":
      return (
        <group>
          <mesh geometry={GEO.cap} material={hair} rotation={[-0.3, 0, 0]} scale={[1, 0.9, 1]} castShadow />
          <mesh geometry={GEO.beard} material={hair} position={[0, -0.17, 0.09]} scale={[1.02, 0.55, 0.72]} />
        </group>
      );
    default:
      return null;
  }
}

function Prop({ look }: { look: AgentLook }) {
  switch (look.prop) {
    case "pen":
      return (
        <group position={[0, -0.04, 0.05]} rotation={[0.9, 0, 0.2]}>
          <mesh geometry={GEO.pen} material={mat("#d23b2a", 0.45)} castShadow />
          <mesh geometry={GEO.penTip} material={mat("#2e3320")} position={[0, -0.105, 0]} rotation={[Math.PI, 0, 0]} />
        </group>
      );
    case "book":
      return (
        <group position={[0, -0.06, 0.06]} rotation={[0.2, 0.3, 0]}>
          <mesh geometry={GEO.book} material={mat(look.color, 0.55)} castShadow />
          <mesh geometry={GEO.pages} material={mat(COLORS.white, 0.8)} position={[0.008, 0, 0]} />
        </group>
      );
    case "mic":
      return (
        <group position={[0, -0.02, 0.05]} rotation={[0.5, 0, 0]}>
          <mesh geometry={GEO.micHandle} material={mat("#2f2f33", 0.4)} castShadow />
          <mesh geometry={GEO.micHead} material={mat("#a7adb5", 0.35)} position={[0, 0.1, 0]} castShadow />
        </group>
      );
    case "globe":
      return (
        <group position={[0, -0.03, 0.08]}>
          <mesh geometry={GEO.globe} material={mat("#6fa8dc", 0.45)} castShadow />
          <mesh geometry={GEO.land} material={mat("#8fae5a", 0.6)} position={[0.04, 0.03, 0.05]} scale={[1.2, 0.9, 0.6]} />
          <mesh geometry={GEO.land} material={mat("#8fae5a", 0.6)} position={[-0.05, -0.02, 0.045]} scale={[0.9, 1.2, 0.6]} />
        </group>
      );
    default:
      return null;
  }
}

export default function Character({ look, state, seed, deskTurn, reduced }: CharacterProps) {
  const [animator] = useState(() => new Animator(seed, state));
  const root = useRef<Group>(null);
  const pelvis = useRef<Group>(null);
  const spine = useRef<Group>(null);
  const torso = useRef<Mesh>(null);
  const head = useRef<Group>(null);
  const lSh = useRef<Group>(null);
  const rSh = useRef<Group>(null);
  const lEl = useRef<Group>(null);
  const rEl = useRef<Group>(null);
  const lHip = useRef<Group>(null);
  const rHip = useRef<Group>(null);
  const lKnee = useRef<Group>(null);
  const rKnee = useRef<Group>(null);
  const lFoot = useRef<Group>(null);
  const rFoot = useRef<Group>(null);
  const lEye = useRef<Group>(null);
  const rEye = useRef<Group>(null);
  const lBrow = useRef<Mesh>(null);
  const rBrow = useRef<Mesh>(null);
  const smile = useRef<Mesh>(null);
  const frown = useRef<Mesh>(null);
  const flat = useRef<Mesh>(null);
  const open = useRef<Mesh>(null);
  const prop = useRef<Group>(null);
  const swing = useRef<Group>(null);
  const bubble = useRef<Group>(null);
  const dots = useRef<Group>(null);
  const clockStart = useRef<number | null>(null);

  useEffect(() => {
    animator.setState(state, clockStart.current ?? 0);
  }, [animator, state]);

  const skin = mat(look.skin, 0.55);
  const skinShade = mat(shade(look.skin, -0.06), 0.6);
  const sweater = mat(look.color, 0.7);
  const sweaterDark = mat(shade(look.color, -0.1), 0.72);
  const pants = mat(COLORS.pants, 0.75);
  const shoe = mat(COLORS.shoe, 0.5);
  const eye = mat(COLORS.eye, 0.25);
  const white = mat(COLORS.white, 0.3);
  const cheek = mat(COLORS.cheek, 0.8);
  const mouth = mat(COLORS.mouth, 0.5);
  const brow = mat(shade(look.hairColor, -0.05), 0.8);

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    if (clockStart.current === null) {
      clockStart.current = now;
      animator.setState(state, now);
    }
    if (animator.state !== state) animator.setState(state, now);
    const { pose: p, eyes, hairSwing } = animator.update(now, delta, deskTurn, reduced);
    const drop = Math.min(legDrop(p.lHip, p.lKnee), legDrop(p.rHip, p.rKnee));

    root.current?.position.set(p.x, p.y - drop, 0);
    if (root.current) root.current.rotation.y = p.turn;
    if (pelvis.current) pelvis.current.rotation.z = p.tilt * 0.5;
    spine.current?.rotation.set(p.lean, p.twist, p.tilt);
    torso.current?.scale.set(1 + p.breath, 1 + p.breath * 0.5, 1 + p.breath);
    head.current?.rotation.set(p.headX, p.headY, p.headZ);
    lSh.current?.rotation.set(p.lShX, 0, p.lShZ);
    rSh.current?.rotation.set(p.rShX, 0, -p.rShZ);
    if (lEl.current) lEl.current.rotation.x = -p.lEl;
    if (rEl.current) rEl.current.rotation.x = -p.rEl;
    lHip.current?.rotation.set(-p.lHip, 0, p.legZ);
    rHip.current?.rotation.set(-p.rHip, 0, p.legZ);
    if (lKnee.current) lKnee.current.rotation.x = p.lKnee;
    if (rKnee.current) rKnee.current.rotation.x = p.rKnee;
    if (lFoot.current) lFoot.current.rotation.x = p.lHip - p.lKnee;
    if (rFoot.current) rFoot.current.rotation.x = p.rHip - p.rKnee;

    const lid = Math.max(0.08, eyes);
    for (const [ref, side] of [[lEye, 1], [rEye, -1]] as const) {
      if (!ref.current) continue;
      ref.current.scale.y = lid;
      ref.current.position.x = side * 0.085 + p.lookX * 0.018;
      ref.current.position.y = 0.025 + p.lookY * 0.014;
    }
    for (const [ref, side] of [[lBrow, 1], [rBrow, -1]] as const) {
      if (!ref.current) continue;
      ref.current.position.y = 0.105 + p.brow * 0.022 + p.browTilt * side * 0.012;
      ref.current.rotation.z = Math.PI / 2 + side * (Math.min(0, p.brow) * -0.35 + p.browTilt * 0.25);
    }
    const s = Math.max(0.001, p.smile * (1 - p.open * 0.6));
    const f = Math.max(0.001, p.frown);
    smile.current?.scale.set(1, s, 1);
    frown.current?.scale.set(0.9, f, 1);
    flat.current?.scale.setScalar(Math.max(0.001, 1 - Math.min(1, p.smile * 2 + p.frown * 2 + p.open * 2)));
    open.current?.scale.set(Math.max(0.001, p.open), Math.max(0.001, p.open * 0.85), 0.45);
    prop.current?.scale.setScalar(Math.max(0.001, p.prop));
    if (swing.current) swing.current.rotation.x = hairSwing;
    if (bubble.current) {
      const busy = state === "thinking" || state === "working" ? 1 : 0.35;
      bubble.current.position.y = 0.62 + (reduced ? 0 : Math.sin(now * 1.8 + seed) * 0.03);
      bubble.current.scale.setScalar(0.7 + busy * 0.3);
    }
    if (dots.current) {
      dots.current.children.forEach((dot, i) => {
        dot.position.y = reduced ? 0 : Math.max(0, Math.sin(now * 6 - i * 0.7)) * 0.02;
      });
    }
  });

  return (
    <group ref={root}>
      <group ref={lHip} position={[0.1, 0.66, 0]}>
        <mesh geometry={GEO.thigh} material={pants} position={[0, -0.15, 0]} castShadow />
        <group ref={lKnee} position={[0, -0.3, 0]}>
          <mesh geometry={GEO.shin} material={pants} position={[0, -0.14, 0]} castShadow />
          <group ref={lFoot} position={[0, -0.29, 0]}>
            <mesh geometry={GEO.shoe} material={shoe} position={[0, -0.03, 0.04]} rotation={[Math.PI / 2, 0, 0]} scale={[1.05, 1, 0.75]} castShadow />
          </group>
        </group>
      </group>
      <group ref={rHip} position={[-0.1, 0.66, 0]}>
        <mesh geometry={GEO.thigh} material={pants} position={[0, -0.15, 0]} castShadow />
        <group ref={rKnee} position={[0, -0.3, 0]}>
          <mesh geometry={GEO.shin} material={pants} position={[0, -0.14, 0]} castShadow />
          <group ref={rFoot} position={[0, -0.29, 0]}>
            <mesh geometry={GEO.shoe} material={shoe} position={[0, -0.03, 0.04]} rotation={[Math.PI / 2, 0, 0]} scale={[1.05, 1, 0.75]} castShadow />
          </group>
        </group>
      </group>

      <group ref={pelvis} position={[0, 0.68, 0]}>
        <group ref={spine} position={[0, 0.02, 0]}>
          <mesh ref={torso} geometry={GEO.torso} material={sweater} position={[0, 0.2, 0]} castShadow />
          <mesh geometry={GEO.neck} material={skinShade} position={[0, 0.49, 0]} />
          <mesh geometry={GEO.torso} material={sweaterDark} position={[0, 0.43, 0.02]} scale={[0.42, 0.12, 0.42]} />

          <group ref={head} position={[0, 0.53, 0]}>
            <mesh geometry={GEO.head} material={skin} position={[0, 0.2, 0]} castShadow />
            <mesh geometry={GEO.ear} material={skinShade} position={[0.245, 0.19, -0.01]} scale={[0.6, 1, 0.9]} />
            <mesh geometry={GEO.ear} material={skinShade} position={[-0.245, 0.19, -0.01]} scale={[0.6, 1, 0.9]} />
            <group position={[0, 0.2, 0]}>
              <group ref={lEye} position={[0.085, 0.025, 0.226]}>
                <mesh geometry={GEO.eye} material={eye} scale={[1, 1.12, 0.6]} />
                <mesh geometry={GEO.glint} material={white} position={[0.012, 0.014, 0.02]} />
              </group>
              <group ref={rEye} position={[-0.085, 0.025, 0.226]}>
                <mesh geometry={GEO.eye} material={eye} scale={[1, 1.12, 0.6]} />
                <mesh geometry={GEO.glint} material={white} position={[0.012, 0.014, 0.02]} />
              </group>
              <mesh ref={lBrow} geometry={GEO.brow} material={brow} position={[0.088, 0.105, 0.212]} />
              <mesh ref={rBrow} geometry={GEO.brow} material={brow} position={[-0.088, 0.105, 0.212]} />
            </group>
            <mesh geometry={GEO.nose} material={skinShade} position={[0, 0.17, 0.25]} scale={[1, 0.85, 0.8]} />
            <mesh geometry={GEO.cheek} material={cheek} position={[0.14, 0.14, 0.2]} scale={[1, 0.7, 0.4]} />
            <mesh geometry={GEO.cheek} material={cheek} position={[-0.14, 0.14, 0.2]} scale={[1, 0.7, 0.4]} />
            <group position={[0, 0.095, 0.232]}>
              <mesh ref={smile} geometry={GEO.arc} material={mouth} rotation={[0, 0, Math.PI]} />
              <mesh ref={frown} geometry={GEO.arc} material={mouth} position={[0, -0.04, 0]} />
              <mesh ref={flat} geometry={GEO.flat} material={mouth} rotation={[0, 0, Math.PI / 2]} />
              <mesh ref={open} geometry={GEO.mouthO} material={mouth} position={[0, -0.02, -0.01]} />
            </group>
            <group position={[0, 0.2, 0]}>
              <Hair look={look} swing={swing} />
            </group>
            {look.prop === "bubble" && (
              <group ref={bubble} position={[0.3, 0.62, 0]}>
                <mesh geometry={GEO.bubble} material={mat(COLORS.white, 0.4)} rotation={[0, 0, Math.PI / 2]} castShadow />
                <mesh geometry={GEO.bubbleTail} material={mat(COLORS.white, 0.4)} position={[-0.08, -0.09, 0]} rotation={[0, 0, 2.6]} />
                <group ref={dots} position={[0, 0, 0.07]}>
                  {[-0.05, 0, 0.05].map(x => (
                    <group key={x} position={[x, 0, 0]}><mesh geometry={GEO.dot} material={mat(look.color, 0.5)} /></group>
                  ))}
                </group>
              </group>
            )}
          </group>

          <group ref={lSh} position={[0.27, 0.4, 0]}>
            <mesh geometry={GEO.upperArm} material={sweater} position={[0, -0.13, 0]} castShadow />
            <group ref={lEl} position={[0, -0.27, 0]}>
              <mesh geometry={GEO.forearm} material={sweater} position={[0, -0.11, 0]} castShadow />
              <mesh geometry={GEO.hand} material={skin} position={[0, -0.25, 0]} castShadow />
            </group>
          </group>
          <group ref={rSh} position={[-0.27, 0.4, 0]}>
            <mesh geometry={GEO.upperArm} material={sweater} position={[0, -0.13, 0]} castShadow />
            <group ref={rEl} position={[0, -0.27, 0]}>
              <mesh geometry={GEO.forearm} material={sweater} position={[0, -0.11, 0]} castShadow />
              <mesh geometry={GEO.hand} material={skin} position={[0, -0.25, 0]} castShadow />
              {look.prop !== "bubble" && (
                <group ref={prop} position={[0, -0.27, 0.02]}>
                  <Prop look={look} />
                </group>
              )}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}
