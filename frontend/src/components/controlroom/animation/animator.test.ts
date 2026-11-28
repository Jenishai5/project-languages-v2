import { Animator } from "./animator";
import { legDrop, NEUTRAL, poseFor } from "./poses";

function run(animator: Animator, from: number, to: number, desk = 1.2) {
  let frame = animator.update(from, 0, desk, false);
  for (let t = from; t <= to; t += 1 / 60) frame = animator.update(t, 1 / 60, desk, false);
  return frame;
}

test("every state produces a finite pose", () => {
  for (const state of ["idle", "waiting", "thinking", "working", "success", "error", "blocked"] as const) {
    for (const time of [0, 0.3, 1.7, 9.4]) {
      const { base, add } = poseFor(state, { time, inState: time, seed: 3, deskTurn: 1.2, reduced: false });
      for (const value of [...Object.values(base), ...Object.values(add)]) expect(Number.isFinite(value)).toBe(true);
    }
  }
});

test("working turns the character to its desk and raises the arms to type", () => {
  const animator = new Animator(2, "idle");
  run(animator, 0, 1);
  animator.setState("working", 1);
  const frame = run(animator, 1, 4);
  expect(frame.pose.turn).toBeGreaterThan(1.0);
  expect(frame.pose.lShX).toBeLessThan(-0.7);
});

test("changing state blends smoothly instead of jumping", () => {
  const animator = new Animator(1, "idle");
  const before = run(animator, 0, 2).pose.rShX;
  animator.setState("success", 2);
  const next = animator.update(2 + 1 / 60, 1 / 60, 1.2, false).pose.rShX;
  expect(Math.abs(next - before)).toBeLessThan(0.3);
});

test("success crouches before it jumps", () => {
  const animator = new Animator(4, "idle");
  run(animator, 0, 1);
  animator.setState("success", 1);
  const crouch = run(animator, 1, 1.22);
  expect(crouch.pose.lKnee).toBeGreaterThan(0.5);
  expect(crouch.pose.y).toBeLessThan(0.05);
  const jump = run(animator, 1.22, 1.55);
  expect(jump.pose.y).toBeGreaterThan(0.15);
});

test("reduced motion holds a still pose with open eyes", () => {
  const animator = new Animator(5, "thinking");
  const a = animator.update(1, 1 / 60, 1.2, true);
  const b = animator.update(7, 1 / 60, 1.2, true);
  expect(a.pose).toEqual(b.pose);
  expect(a.eyes).toBe(1);
});

test("feet stay on the floor when the knees bend", () => {
  expect(legDrop(0, 0)).toBe(0);
  expect(legDrop(0.6, 1.15)).toBeGreaterThan(0.05);
  expect(NEUTRAL.smile).toBeGreaterThan(0);
});
