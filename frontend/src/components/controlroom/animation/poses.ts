import type { AgentState } from "../../../lib/agentsApi";
import { clamp01, mix, noise1, random, smoothstep, window01 } from "./noise";

export interface Pose {
  x: number; y: number; turn: number;
  lean: number; tilt: number; twist: number; breath: number;
  headX: number; headY: number; headZ: number;
  lShX: number; lShZ: number; lEl: number;
  rShX: number; rShZ: number; rEl: number;
  lHip: number; lKnee: number; rHip: number; rKnee: number;
  legZ: number;
  lookX: number; lookY: number; squint: number;
  brow: number; browTilt: number;
  smile: number; frown: number; open: number;
  prop: number;
}

export type PoseKey = keyof Pose;

export const NEUTRAL: Pose = {
  x: 0, y: 0, turn: 0,
  lean: 0, tilt: 0, twist: 0, breath: 0,
  headX: 0, headY: 0, headZ: 0,
  lShX: 0.05, lShZ: 0.12, lEl: 0.2,
  rShX: 0.05, rShZ: 0.12, rEl: 0.2,
  lHip: 0, lKnee: 0, rHip: 0, rKnee: 0,
  legZ: 0,
  lookX: 0, lookY: 0, squint: 0,
  brow: 0, browTilt: 0,
  smile: 0.5, frown: 0, open: 0,
  prop: 1,
};

export const POSE_KEYS = Object.keys(NEUTRAL) as PoseKey[];

export const DAMPING: Record<PoseKey, number> = {
  x: 4, y: 14, turn: 3.2,
  lean: 6, tilt: 5, twist: 5, breath: 8,
  headX: 5.5, headY: 4.5, headZ: 5,
  lShX: 8, lShZ: 8, lEl: 9,
  rShX: 8, rShZ: 8, rEl: 9,
  lHip: 11, lKnee: 11, rHip: 11, rKnee: 11,
  legZ: 4,
  lookX: 9, lookY: 9, squint: 8,
  brow: 9, browTilt: 9,
  smile: 7, frown: 7, open: 10,
  prop: 6,
};

export interface PoseContext {
  time:     number;
  inState:  number;
  seed:     number;
  deskTurn: number;
  reduced:  boolean;
}

export interface PoseFrame {
  base: Pose;
  add:  Partial<Pose>;
}

function weightShift(time: number, seed: number, speed = 0.11): number {
  return Math.tanh(noise1(time * speed, seed + 11) * 2.6);
}

function breathing(time: number, seed: number, rate = 1.5, depth = 1): Partial<Pose> {
  const b = (Math.sin(time * rate + seed) * 0.5 + 0.5) * depth;
  return { breath: b * 0.028, headX: -b * 0.015, lShX: b * 0.02, rShX: b * 0.02 };
}

function stance(w: number, amount = 1): Partial<Pose> {
  const x = w * 0.035 * amount;
  return {
    x,
    tilt: -w * 0.035 * amount,
    legZ: -x / 0.62,
    lHip: Math.max(0, -w) * 0.08 * amount, lKnee: Math.max(0, -w) * 0.2 * amount,
    rHip: Math.max(0, w) * 0.08 * amount, rKnee: Math.max(0, w) * 0.2 * amount,
  };
}

function idle(c: PoseContext): PoseFrame {
  const { time: T, seed } = c;
  const w = weightShift(T, seed);
  const segment = Math.floor((T + seed * 3.1) / 8);
  const local = (T + seed * 3.1) - segment * 8;
  const glance = random(seed, segment) < 0.45 ? window01(local, 1.2, 4.2, 0.6) : 0;
  const stretch = random(seed + 4, segment) < 0.18 ? window01(local, 4.6, 7.2, 0.7) : 0;
  return {
    base: {
      ...NEUTRAL,
      ...stance(w),
      turn: c.deskTurn * 0.45 * glance,
      headY: noise1(T * 0.28, seed + 1) * 0.42 * (1 - glance) + 0.25 * glance,
      headX: noise1(T * 0.21, seed + 2) * 0.1 - 0.02,
      headZ: noise1(T * 0.18, seed + 3) * 0.08,
      lookX: noise1(T * 0.28 + 0.35, seed + 1) * 0.55,
      lookY: noise1(T * 0.21 + 0.3, seed + 2) * 0.25,
      lShX: 0.06 + noise1(T * 0.37, seed + 4) * 0.05 - stretch * 2.7,
      rShX: 0.06 + noise1(T * 0.33, seed + 5) * 0.05 - stretch * 2.7,
      lShZ: 0.12 + stretch * 0.25,
      rShZ: 0.12 + stretch * 0.25,
      lEl: 0.2 + noise1(T * 0.4, seed + 6) * 0.08 + stretch * 0.4,
      rEl: 0.2 + noise1(T * 0.43, seed + 7) * 0.08 + stretch * 0.4,
      lean: -0.1 * stretch,
      squint: stretch * 0.6,
      open: stretch * 0.5,
      smile: 0.55 - stretch * 0.3,
    },
    add: breathing(T, seed),
  };
}

function thinking(c: PoseContext): PoseFrame {
  const { time: T, seed } = c;
  const side = random(seed, 99) < 0.5 ? -1 : 1;
  const w = weightShift(T, seed, 0.08) * 0.7;
  const segment = Math.floor((T + seed) / 4.2);
  const pick = random(seed + 2, segment);
  const local = (T + seed) - segment * 4.2;
  const blend = smoothstep(0, 0.6, local) * (1 - smoothstep(3.6, 4.2, local));
  const scratch = pick > 0.62 ? blend : 0;
  const chin = 1 - scratch;
  const tap = pick < 0.3 ? Math.sin(T * 9) * 0.08 : 0;
  return {
    base: {
      ...NEUTRAL,
      ...stance(w),
      turn: c.deskTurn * 0.3,
      lean: -0.05,
      headX: mix(-0.28, -0.08, scratch) + noise1(T * 0.4, seed) * 0.04,
      headY: side * 0.28 + noise1(T * 0.3, seed + 1) * 0.1,
      headZ: 0.12 * side + scratch * 0.12,
      lookX: side * 0.55, lookY: mix(0.65, 0.2, scratch),
      rShX: mix(-1.3, -2.55, scratch), rShZ: mix(0.12, 0.55, scratch), rEl: mix(2.25, 2.0, scratch),
      lShX: mix(-0.45, 0.06, scratch), lShZ: mix(-0.28, 0.14, scratch), lEl: mix(1.6, 0.25, scratch),
      brow: 0.45, browTilt: 0.45 * side,
      smile: 0.1, frown: 0.12, open: 0,
      prop: 0.6,
    },
    add: {
      ...breathing(T, seed, 1.2),
      rEl: tap * chin + Math.sin(T * 13) * 0.14 * scratch,
    },
  };
}

function working(c: PoseContext): PoseFrame {
  const { time: T, seed } = c;
  const burst = smoothstep(-0.35, 0.05, noise1(T * 0.45, seed + 8));
  const read = 1 - burst;
  const tapL = Math.sin(T * 15.5) * 0.055 * burst;
  const tapR = Math.sin(T * 15.5 + 1.9) * 0.055 * burst;
  return {
    base: {
      ...NEUTRAL,
      turn: c.deskTurn,
      lean: 0.17,
      headX: 0.2 + read * 0.08 + noise1(T * 0.5, seed) * 0.03,
      headY: noise1(T * 0.35, seed + 1) * 0.08,
      headZ: noise1(T * 0.25, seed + 2) * 0.05,
      lookY: -0.35, lookX: noise1(T * 0.9, seed + 3) * 0.3,
      lShX: -0.98, lShZ: -0.06, lEl: 1.28,
      rShX: mix(-0.98, -0.7, read), rShZ: mix(-0.06, 0.12, read), rEl: mix(1.28, 1.05, read),
      lHip: 0.04, rHip: 0.04, lKnee: 0.06, rKnee: 0.06,
      brow: -0.28, browTilt: 0,
      smile: 0.18, frown: 0, open: read * 0.12,
      prop: 0,
    },
    add: {
      ...breathing(T, seed, 1.7, 0.8),
      lShX: tapL, rShX: tapR, lEl: -tapL * 0.8, rEl: -tapR * 0.8,
      headX: read * Math.sin(T * 2.2) * 0.03,
    },
  };
}

function waiting(c: PoseContext): PoseFrame {
  const { time: T, seed } = c;
  const w = weightShift(T, seed, 0.2);
  const segment = Math.floor((T + seed * 2) / 4.5);
  const local = (T + seed * 2) - segment * 4.5;
  const watch = random(seed + 6, segment) < 0.35 ? window01(local, 0.6, 2.6, 0.45) : 0;
  const tap = Math.max(0, Math.sin(T * 7.5)) * 0.14;
  return {
    base: {
      ...NEUTRAL,
      ...stance(w * 0.6),
      headY: mix(noise1(T * 0.75, seed + 1) * 0.6, 0.35, watch),
      headX: mix(noise1(T * 0.5, seed + 2) * 0.1, 0.38, watch),
      lookX: mix(noise1(T * 0.75 + 0.25, seed + 1) * 0.7, 0.4, watch),
      lookY: mix(0.05, -0.5, watch),
      lShX: mix(0.12, -1.15, watch), lShZ: mix(0.5, -0.2, watch), lEl: mix(1.75, 2.0, watch),
      rShX: 0.12, rShZ: 0.5, rEl: 1.75,
      rHip: 0.08, rKnee: 0.12,
      brow: 0.15, browTilt: -0.1,
      smile: 0.12, frown: 0.12,
      prop: 0.4,
    },
    add: { ...breathing(T, seed, 1.9), rKnee: tap, rHip: tap * 0.35 },
  };
}

function success(c: PoseContext): PoseFrame {
  const { time: T, inState: t, seed } = c;
  const crouch = smoothstep(0, 0.22, t) * (1 - smoothstep(0.22, 0.32, t));
  const air = t >= 0.28 && t <= 0.78 ? Math.sin(((t - 0.28) / 0.5) * Math.PI) : 0;
  const land = smoothstep(0.74, 0.82, t) * (1 - smoothstep(0.82, 1.15, t));
  const cheer = smoothstep(0.85, 1.25, t);
  const up = smoothstep(0.24, 0.4, t);
  const bounce = Math.abs(Math.sin(T * 5.2)) * cheer;
  const wave = Math.sin(T * 6.5) * cheer;
  return {
    base: {
      ...NEUTRAL,
      y: air * 0.34,
      lean: crouch * 0.28 + land * 0.15 - air * 0.06,
      headX: crouch * 0.15 - (air + cheer) * 0.12,
      lHip: crouch * 0.6 + land * 0.38 + air * 0.25, lKnee: crouch * 1.15 + land * 0.75 + air * 0.55,
      rHip: crouch * 0.6 + land * 0.38 + air * 0.25, rKnee: crouch * 1.15 + land * 0.75 + air * 0.55,
      lShX: mix(crouch * 0.55, -2.75, up), lShZ: mix(0.15, 0.38, up), lEl: mix(0.3, 0.25, up),
      rShX: mix(crouch * 0.55, -2.65, up), rShZ: mix(0.15, 0.42, up), rEl: mix(0.3, 0.3, up),
      squint: 0.55 * up, brow: 0.5,
      smile: 1, open: 0.75 * up,
      prop: 1,
    },
    add: {
      y: bounce * 0.05,
      lKnee: bounce * 0.12, rKnee: bounce * 0.12, lHip: bounce * 0.06, rHip: bounce * 0.06,
      rShX: wave * 0.18, lShX: -wave * 0.12, headZ: Math.sin(T * 3.1 + seed) * 0.1 * cheer,
    },
  };
}

function error(c: PoseContext): PoseFrame {
  const { time: T, inState: t, seed } = c;
  const flinch = smoothstep(0, 0.12, t) * (1 - smoothstep(0.3, 0.7, t));
  const after = smoothstep(0.45, 0.9, t);
  const segment = Math.floor((T + seed) / 3.2);
  const local = (T + seed) - segment * 3.2;
  const shrug = random(seed + 9, segment) < 0.5 ? window01(local, 0.4, 1.4, 0.3) : 0;
  return {
    base: {
      ...NEUTRAL,
      turn: c.deskTurn * 0.55 * after,
      lean: -0.14 * flinch,
      headX: -0.16 * flinch + 0.05 * after,
      headY: 0.2 * after,
      headZ: 0.2 * after + shrug * 0.12,
      lookX: 0.4 * after, lookY: -0.1,
      rShX: mix(0.0, -2.5, after), rShZ: mix(0.4, 0.55, after), rEl: mix(0.4, 2.05, after),
      lShX: mix(0.0, 0.12, after), lShZ: mix(0.4, 0.48, after) + shrug * 0.25, lEl: mix(0.4, 1.75, after),
      brow: mix(0.85, -0.55, after), browTilt: 0.55 * after,
      smile: 0, frown: mix(0.2, 0.55, after), open: mix(0.6, 0.1, after),
      prop: 0.5,
    },
    add: { ...breathing(T, seed, 2.1), rEl: Math.sin(T * 12) * 0.13 * after },
  };
}

function blocked(c: PoseContext): PoseFrame {
  const { time: T, seed } = c;
  const segment = Math.floor((T + seed) / 5);
  const local = (T + seed) - segment * 5;
  const wave = window01(local, 0.5, 2.6, 0.4);
  const lookAtBarrier = Math.sin((T + seed) * 0.9) > -0.2 ? 1 : 0;
  return {
    base: {
      ...NEUTRAL,
      ...stance(weightShift(T, seed, 0.1) * 0.7),
      turn: -0.55,
      headY: mix(0.45, -0.25, lookAtBarrier),
      headX: mix(-0.05, 0.12, lookAtBarrier),
      headZ: -0.08,
      lookX: mix(0.5, -0.3, lookAtBarrier), lookY: mix(0.1, -0.2, lookAtBarrier),
      lShX: mix(0.08, -2.45, wave), lShZ: mix(0.45, 0.55, wave), lEl: mix(1.7, 0.55, wave),
      rShX: 0.1, rShZ: 0.45, rEl: 1.7,
      brow: 0.3, browTilt: -0.3,
      smile: 0.15, frown: 0.25,
      prop: 0.5,
    },
    add: { ...breathing(T, seed), lEl: Math.sin(T * 8.5) * 0.4 * wave },
  };
}

const POSES: Record<AgentState, (c: PoseContext) => PoseFrame> = { idle, thinking, working, waiting, success, error, blocked };

export function poseFor(state: AgentState, context: PoseContext): PoseFrame {
  if (context.reduced) {
    const still = POSES[state]({ ...context, time: 0, inState: 2.5 });
    return { base: still.base, add: {} };
  }
  return POSES[state](context);
}

export function legDrop(hip: number, knee: number): number {
  const thigh = 0.3;
  const shin = 0.29;
  return thigh * (1 - Math.cos(hip)) + shin * (1 - Math.cos(knee - hip));
}

export function easeOutBack(t: number): number {
  const x = clamp01(t) - 1;
  return 1 + 2.2 * x * x * x + 1.2 * x * x;
}
