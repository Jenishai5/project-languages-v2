import type { AgentState } from "../../../lib/agentsApi";
import { random } from "./noise";
import { DAMPING, NEUTRAL, POSE_KEYS, poseFor, type Pose } from "./poses";

export interface AnimatorFrame {
  pose:      Pose;
  eyes:      number;
  hairSwing: number;
  inState:   number;
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export class Animator {
  readonly seed: number;
  state: AgentState;
  private enteredAt: number;
  private current: Pose = { ...NEUTRAL };
  private addBlend = 1;
  private nextBlink: number;
  private blinkStart = -10;
  private doubleBlink = false;
  private blinks = 0;
  private lastTurn = 0;
  private turnSpeed = 0;
  private hair = 0;
  private hairVelocity = 0;
  private lastHeadY = 0;
  private started = false;

  constructor(seed: number, state: AgentState, now = 0) {
    this.seed = seed;
    this.state = state;
    this.enteredAt = now;
    this.nextBlink = now + 1 + random(seed, 1) * 3;
  }

  setState(state: AgentState, now: number): void {
    if (state === this.state) return;
    this.state = state;
    this.enteredAt = now;
    this.addBlend = 0;
  }

  timeInState(now: number): number {
    return now - this.enteredAt;
  }

  update(now: number, dt: number, deskTurn: number, reduced: boolean): AnimatorFrame {
    const step = Math.min(dt, 0.05);
    const inState = this.timeInState(now);
    const frame = poseFor(this.state, { time: now, inState, seed: this.seed, deskTurn, reduced });

    if (reduced || !this.started) {
      this.current = { ...frame.base };
      this.started = true;
    } else {
      for (const key of POSE_KEYS) {
        this.current[key] = damp(this.current[key], frame.base[key], DAMPING[key], step);
      }
    }
    this.addBlend = reduced ? 0 : damp(this.addBlend, 1, 3, step);

    const pose: Pose = { ...this.current };
    for (const [key, value] of Object.entries(frame.add) as [keyof Pose, number][]) {
      pose[key] += value * this.addBlend;
    }

    if (!reduced && step > 0) {
      const speed = Math.abs(pose.turn - this.lastTurn) / step;
      this.turnSpeed = damp(this.turnSpeed, speed, 10, step);
      const stepping = Math.min(1, this.turnSpeed * 1.4);
      if (stepping > 0.05) {
        const phase = Math.sin(now * 11);
        pose.lKnee += Math.max(0, phase) * 0.35 * stepping;
        pose.lHip += Math.max(0, phase) * 0.18 * stepping;
        pose.rKnee += Math.max(0, -phase) * 0.35 * stepping;
        pose.rHip += Math.max(0, -phase) * 0.18 * stepping;
      }
    }
    this.lastTurn = pose.turn;

    let eyes = 1;
    if (!reduced) {
      if (now >= this.nextBlink) {
        this.blinkStart = now;
        this.blinks += 1;
        this.doubleBlink = random(this.seed + 3, this.blinks) < 0.2;
        this.nextBlink = now + 2 + random(this.seed + 5, this.blinks) * 3.8;
      }
      const since = now - this.blinkStart;
      const one = (s: number) => (s >= 0 && s < 0.16 ? Math.sin((s / 0.16) * Math.PI) : 0);
      eyes = 1 - Math.max(one(since), this.doubleBlink ? one(since - 0.24) : 0);
    }
    eyes *= 1 - pose.squint * 0.55;

    if (!reduced && step > 0) {
      const headVelocity = (pose.headY - this.lastHeadY) / step;
      const target = -headVelocity * 0.08 - pose.y * 0.6;
      this.hairVelocity += ((target - this.hair) * 60 - this.hairVelocity * 7) * step;
      this.hair += this.hairVelocity * step;
    }
    this.lastHeadY = pose.headY;

    return { pose, eyes, hairSwing: this.hair, inState };
  }
}
