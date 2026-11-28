import * as THREE from "three";

export const GEO = {
  head:     new THREE.SphereGeometry(0.25, 32, 24),
  torso:    new THREE.CapsuleGeometry(0.23, 0.26, 10, 28),
  neck:     new THREE.CylinderGeometry(0.075, 0.085, 0.12, 16),
  upperArm: new THREE.CapsuleGeometry(0.062, 0.16, 8, 16),
  forearm:  new THREE.CapsuleGeometry(0.056, 0.15, 8, 16),
  hand:     new THREE.SphereGeometry(0.068, 18, 14),
  thigh:    new THREE.CapsuleGeometry(0.08, 0.17, 8, 16),
  shin:     new THREE.CapsuleGeometry(0.069, 0.18, 8, 16),
  shoe:     new THREE.CapsuleGeometry(0.066, 0.1, 8, 16),
  eye:      new THREE.SphereGeometry(0.036, 18, 14),
  glint:    new THREE.SphereGeometry(0.011, 8, 6),
  ear:      new THREE.SphereGeometry(0.05, 14, 10),
  nose:     new THREE.SphereGeometry(0.03, 14, 10),
  cheek:    new THREE.SphereGeometry(0.046, 14, 10),
  brow:     new THREE.CapsuleGeometry(0.013, 0.05, 4, 8),
  arc:      new THREE.TorusGeometry(0.052, 0.013, 8, 24, Math.PI),
  flat:     new THREE.CapsuleGeometry(0.012, 0.06, 4, 8),
  mouthO:   new THREE.SphereGeometry(0.042, 16, 12),
  cap:      new THREE.SphereGeometry(0.268, 36, 18, 0, Math.PI * 2, 0, 1.3),
  curl:     new THREE.SphereGeometry(0.088, 14, 10),
  bun:      new THREE.SphereGeometry(0.11, 20, 16),
  hairBack: new THREE.CapsuleGeometry(0.2, 0.2, 8, 20),
  beard:    new THREE.SphereGeometry(0.2, 28, 18),
  pen:      new THREE.CylinderGeometry(0.014, 0.014, 0.17, 10),
  penTip:   new THREE.ConeGeometry(0.014, 0.04, 10),
  book:     new THREE.BoxGeometry(0.16, 0.2, 0.045),
  pages:    new THREE.BoxGeometry(0.15, 0.19, 0.035),
  bubble:   new THREE.CapsuleGeometry(0.075, 0.12, 8, 18),
  bubbleTail: new THREE.ConeGeometry(0.035, 0.07, 10),
  dot:      new THREE.SphereGeometry(0.018, 10, 8),
  micHandle: new THREE.CylinderGeometry(0.022, 0.018, 0.16, 12),
  micHead:  new THREE.SphereGeometry(0.045, 16, 12),
  globe:    new THREE.SphereGeometry(0.075, 24, 18),
  land:     new THREE.SphereGeometry(0.03, 12, 10),
};

const materials = new Map<string, THREE.MeshStandardMaterial>();

export function mat(color: string, roughness = 0.62, emissive?: string, emissiveIntensity = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${roughness}|${emissive ?? ""}|${emissiveIntensity}`;
  let found = materials.get(key);
  if (!found) {
    found = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
    if (emissive) {
      found.emissive = new THREE.Color(emissive);
      found.emissiveIntensity = emissiveIntensity;
    }
    materials.set(key, found);
  }
  return found;
}

export const COLORS = {
  pants: "#4b5160",
  shoe:  "#2e3320",
  eye:   "#22201d",
  white: "#fefdfb",
  cheek: "#ef9a90",
  mouth: "#5b2b2b",
  desk:  "#d9c7a7",
  deskLeg: "#8a7656",
  frame: "#2b2f27",
  key:   "#ece6d6",
  platform: "#efe9da",
  ground: "#262b1f",
};

export function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${c.getHexString()}`;
}
