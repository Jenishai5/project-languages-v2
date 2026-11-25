export type TurtleState = "idle" | "covering" | "happy" | "wondered";

interface Props { state: TurtleState; }

const IMG: Record<TurtleState, string> = {
  idle:     "/turtle.png",
  covering: "/turtle2.png",
  happy:    "/turtle.png",
  wondered: "/wondered-turtle.png",
};

export default function TurtlePeek({ state }: Props) {
  return (
    <div>
      <img
        src={IMG[state]}
        alt="turtle"
      />

      {state === "happy" && (
        <>
          <div
          >✨</div>
          <div
          >⭐</div>
        </>
      )}

      {state === "wondered" && (
        <div
        >❓</div>
      )}
    </div>
  );
}
