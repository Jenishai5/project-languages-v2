import { ContactShadows } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { AgentLive, AgentName } from "../../../lib/agentsApi";
import { AGENT_ORDER, liveFor, matchesFilter, type StatusFilter } from "../liveStates";
import { COLORS } from "./geometry";
import Workstation from "./Workstation";

export interface ControlRoomSceneProps {
  live:     AgentLive[] | undefined;
  selected: AgentName | null;
  filter:   StatusFilter;
  reduced:  boolean;
  onSelect: (agent: AgentName | null) => void;
}

const FOV = 32;

function layout(aspect: number): { positions: [number, number, number][]; camera: THREE.Vector3; target: THREE.Vector3; compact: boolean } {
  const tanV = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const tanH = tanV * aspect;
  if (aspect < 1.25) {
    const positions: [number, number, number][] = [[-1.3, 0, -3.3], [1.3, 0, -3.3], [-1.3, 0, 0], [1.3, 0, 0], [0, 0, 3.3]];
    const distance = Math.max(3.0 / tanH, 3.9 / tanV);
    return { positions, camera: new THREE.Vector3(0, distance * 0.62, distance * 0.78), target: new THREE.Vector3(0, 0.45, 0.1), compact: true };
  }
  const xs = [-5.0, -2.5, 0, 2.5, 5.0];
  const zs = [-0.7, -0.1, 0.15, -0.1, -0.7];
  const distance = Math.max(9.4, 6.5 / tanH);
  return {
    positions: xs.map((x, i) => [x, 0, zs[i]] as [number, number, number]),
    camera: new THREE.Vector3(0, distance * 0.36, distance),
    target: new THREE.Vector3(0, -0.1, 0.6),
    compact: false,
  };
}

function CameraRig({ camera: home, target, reduced }: { camera: THREE.Vector3; target: THREE.Vector3; reduced: boolean }) {
  const get = useThree(state => state.get);
  useEffect(() => {
    const { camera, invalidate } = get();
    camera.position.copy(home);
    camera.lookAt(target);
    invalidate();
  }, [get, home, target]);
  useFrame(({ camera, pointer }, delta) => {
    if (reduced) return;
    const goal = home.clone().add(new THREE.Vector3(pointer.x * 0.7, pointer.y * 0.35, 0));
    camera.position.x = THREE.MathUtils.damp(camera.position.x, goal.x, 2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, goal.y, 2, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, goal.z, 2, delta);
    camera.lookAt(target);
  });
  return null;
}

function Room({ live, selected, filter, reduced, onSelect, overlay }: ControlRoomSceneProps & { overlay: RefObject<HTMLDivElement | null> }) {
  const { size, invalidate } = useThree();
  const aspect = size.width / Math.max(1, size.height);
  const { positions, camera, target, compact } = useMemo(() => layout(aspect), [aspect]);

  useEffect(() => { invalidate(); }, [live, selected, filter, invalidate]);

  return (
    <>
      <color attach="background" args={["#1b1f16"]} />
      <fog attach="fog" args={["#1b1f16", 16, 34]} />
      <hemisphereLight args={["#fff3dc", "#2a2418", 0.75]} />
      <directionalLight position={[4, 9, 6]} intensity={2.1} color="#fff1dc" />
      <directionalLight position={[-6, 4, -4]} intensity={0.55} color="#b9cfff" />
      <CameraRig camera={camera} target={target} reduced={reduced} />

      <mesh position={[0, -0.02, 0]} receiveShadow onClick={() => onSelect(null)}>
        <cylinderGeometry args={[aspect < 1.25 ? 6.5 : 8.6, aspect < 1.25 ? 6.7 : 8.8, 0.06, 96]} />
        <meshStandardMaterial color={COLORS.ground} roughness={0.95} />
      </mesh>

      {AGENT_ORDER.map((name, i) => {
        const agent = liveFor(live, name);
        return (
          <Workstation key={name} name={name} index={i} live={agent} position={positions[i]}
            selected={selected === name} dimmed={!matchesFilter(agent?.state ?? "idle", filter)}
            reduced={reduced} onSelect={onSelect} overlay={overlay} compact={compact} />
        );
      })}

      <ContactShadows position={[0, 0.085, 0]} scale={aspect < 1.25 ? 13 : 17} opacity={0.55} blur={2.4} far={2.2}
        resolution={512} frames={reduced ? 1 : Infinity} color="#141810" />
    </>
  );
}

export default function ControlRoomScene(props: ControlRoomSceneProps) {
  const overlay = useRef<HTMLDivElement>(null);
  return (
    <>
    <Canvas
      className="cr-canvas"
      dpr={[1, 1.75]}
      frameloop={props.reduced ? "demand" : "always"}
      camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 6, 12] }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <Room {...props} overlay={overlay} />
    </Canvas>
    <div ref={overlay} className="cr-overlay" />
    </>
  );
}
