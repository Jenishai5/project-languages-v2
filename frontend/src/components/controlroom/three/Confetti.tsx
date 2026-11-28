import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { random } from "../animation/noise";

const COUNT = 36;
const LIFE = 1.9;
const PALETTE = ["#f0a8aa", "#8fae5a", "#e3ad5b", "#9fb8f0", "#d98b5f", "#fefdfb"];

const dummy = new THREE.Object3D();

export default function Confetti({ active, origin, seed }: { active: boolean; origin: [number, number, number]; seed: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const start = useRef<number | null>(null);
  const wasActive = useRef(false);
  const geometry = useMemo(() => new THREE.BoxGeometry(0.05, 0.016, 0.035), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.6 }), []);
  const particles = useMemo(
    () => Array.from({ length: COUNT }, (_, i) => {
      const r = (k: number) => random(seed + k, i);
      const angle = (i / COUNT) * Math.PI * 2 + r(1) * 0.4;
      const speed = 1.1 + r(2) * 1.2;
      return {
        v: new THREE.Vector3(Math.cos(angle) * speed * 0.55, 2.4 + r(3) * 1.4, Math.sin(angle) * speed * 0.55),
        spin: new THREE.Vector3(r(4) * 9, r(5) * 9, r(6) * 9),
        color: new THREE.Color(PALETTE[i % PALETTE.length]),
      };
    }),
    [seed],
  );

  useEffect(() => {
    if (!mesh.current) return;
    particles.forEach((p, i) => mesh.current?.setColorAt(i, p.color));
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.visible = false;
  }, [particles]);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    if (active && !wasActive.current) start.current = clock.elapsedTime;
    wasActive.current = active;
    if (start.current === null) return;
    const age = clock.elapsedTime - start.current;
    if (age > LIFE) {
      m.visible = false;
      return;
    }
    m.visible = true;
    particles.forEach((p, i) => {
      dummy.position.set(origin[0] + p.v.x * age, origin[1] + p.v.y * age - 4.2 * age * age, origin[2] + p.v.z * age);
      dummy.rotation.set(p.spin.x * age, p.spin.y * age, p.spin.z * age);
      dummy.scale.setScalar(Math.max(0.001, 1 - Math.max(0, age - LIFE + 0.5) / 0.5));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, COUNT]} frustumCulled={false} />;
}
